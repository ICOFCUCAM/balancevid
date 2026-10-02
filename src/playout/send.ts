/**
 * Keeping a sender alive.  [Doctrine CHANNEL §15, §11, §18, D-20, D-21]
 *
 *     engine writes segments  →  playlist  →  ffmpeg -c copy  →  rtmp://…
 *                                                  │
 *                                        supervised, not fired and forgotten
 *
 * ONE PROCESS PER ENABLED DESTINATION, started when the channel has
 * something to send and stopped when it has not. It lives in the
 * PLAYOUT process rather than the web tier for the same reason
 * everything else that shells out does (U-23): the web tier never
 * runs ffmpeg, and a sender started by a page request would die with
 * the page.
 *
 * IT CANNOT TAKE THE CHANNEL DOWN. Every failure here is caught, and
 * a sender that will not start is a destination that is `blocked`
 * with a reason — never a pass that threw. D-21: *"A destination
 * showing 'on' with nothing arriving is the screen that loses a
 * broadcast."* The screen that loses a broadcast the other way is one
 * where a dead RTMP push stops the television channel, and that is
 * the fault this module is written around.
 *
 * AND IT RESTARTS WITH A BACKOFF, because the two things that kill a
 * sender are a network blip (retry at once) and an ingest refusing
 * the key (retry at once, forever, and get the address banned). One
 * curve covers both: `retryAfter` doubles to a minute and stops.
 */

import { type ChildProcess, spawn } from 'node:child_process';

import type { Channel } from '../domain/channel.js';
import type { Destination } from '../domain/distribution.js';
import { FFMPEG, canReadSegments } from '../render/ffmpeg.js';
import {
  type Target, CANNOT_SEND_FROM_THIS_BUILD,
  redact, refusalFor, retryAfter, senderArgs,
} from '../domain/rtmp.js';
import { getKey } from '../store/streamKeys.js';
import { noteSender } from '../store/senderHealth.js';
import { paths } from '../store/paths.js';

interface Running {
  child: ChildProcess;
  /** What it was started with, so a changed key restarts it. */
  signature: string;
  startedAt: number;
}

/** Everything this process has going, by destination id. */
const live = new Map<string, Running>();
/** How many times each has died, for the backoff. */
const failures = new Map<string, number>();
/** Not before this instant. */
const waitUntil = new Map<string, number>();

/** What a sender is, so a changed key or address restarts it. */
function signatureOf(target: Target): string {
  return `${target.server.trim()}#${target.key.trim().length}`
    + `#${target.key.trim().slice(0, 2)}`;
}

function stop(id: string): void {
  const running = live.get(id);
  if (!running) return;
  live.delete(id);
  try { running.child.kill('SIGTERM'); } catch { /* already gone */ }
}

/** Everything, on the way out. */
export function stopAllSenders(): void {
  for (const id of [...live.keys()]) stop(id);
}

/** For tests and for the control room: what is actually running here. */
export function sendingNow(): string[] {
  return [...live.keys()];
}

async function start(
  channel: Channel, destination: Destination, target: Target, nowMs: number,
): Promise<void> {
  const playlist = paths.senderPlaylist(channel.id);
  const child = spawn(FFMPEG, senderArgs({ playlist, target }), {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  /*
   * THE LAST THING IT SAID, kept so a death has a reason. Bounded,
   * because an ingest that rejects every packet can produce megabytes
   * of complaint a second and this is held in memory for the length
   * of a broadcast.
   */
  let said = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    said = `${said}${chunk.toString()}`.slice(-400);
  });

  live.set(destination.id, {
    child, signature: signatureOf(target), startedAt: nowMs,
  });

  child.on('exit', (code) => {
    live.delete(destination.id);
    failures.set(destination.id, (failures.get(destination.id) ?? 0) + 1);
    const wait = retryAfter(failures.get(destination.id) ?? 1);
    waitUntil.set(destination.id, Date.now() + wait);
    /*
     * THE REASON IS ffmpeg's OWN WORDS, and they are the one place a
     * key could escape: an ingest that rejects a URL frequently
     * echoes it back. The target never goes into a string that is
     * stored or printed — `redact` is the only way a target is ever
     * written down — and ffmpeg's text is truncated and kept, which
     * is why the sanitiser below exists rather than trusting it.
     */
    void noteSender(channel.id, destination.id, {
      state: 'blocked',
      says: `Stopped (${code ?? 'signal'}). ${without(said, target)}`.trim(),
      at: new Date().toISOString(),
    }).catch(() => undefined);
  });

  child.on('error', () => { /* the exit handler does the accounting */ });

  await noteSender(channel.id, destination.id, {
    state: 'on',
    says: `Sending to ${redact(target)}`,
    at: new Date(nowMs).toISOString(),
  }).catch(() => undefined);
}

/**
 * ffmpeg's complaint, with the credential taken out of it.
 *
 * AN INGEST THAT REJECTS A URL ECHOES IT BACK, routinely — "Server
 * returned 403 for rtmp://host/app/THEKEY". That text goes into a
 * health record a page can read, so the key is removed from it by
 * substitution rather than by hoping. Both the raw key and the whole
 * target, because ffmpeg prints either depending on which layer
 * failed.
 */
export function without(text: string, target: Target): string {
  const key = target.key.trim();
  if (!key) return text.slice(0, 300);
  return text.split(key).join('••••••••')
    .slice(0, 300);
}

/**
 * Make what is running match what is configured. Called once a pass.
 *
 * IT IS A RECONCILIATION AND NOT A SET OF COMMANDS, which is the only
 * shape that survives the engine being restarted mid-broadcast: the
 * desired state is the channel document plus the keys on disk, and
 * this closes the gap each pass. Nothing here remembers what an
 * operator pressed.
 */
export async function reconcileSenders(
  channel: Channel, nowMs = Date.now(),
): Promise<void> {
  const wanted = (channel.destinations ?? []).filter((one) => one.enabled);
  const keep = new Set<string>();

  for (const destination of wanted) {
    const target = destination.settingsRef
      ? await getKey(destination.settingsRef) : null;
    let refusal = refusalFor(destination, target);
    /*
     * AND ONE REFUSAL THAT IS ASKED OF THE BINARY RATHER THAN READ
     * OFF THE DOCUMENT.  [C-35]
     *
     * ASKED LAST, AND THAT ORDER IS DELIBERATE TWICE OVER. A
     * destination with no key should be told it has no key — the
     * machine's problem is not the one in front of the operator yet
     * — and the probe spawns two ffmpegs, so it is only worth asking
     * for a destination that would otherwise start sending this
     * second. Everything already configured and still refused here
     * is refused for a reason no amount of configuring will move.
     *
     * The answer is cached for the life of the process, so this
     * costs one probe per engine, not one per pass.
     */
    if (!refusal && !(await canReadSegments())) {
      refusal = CANNOT_SEND_FROM_THIS_BUILD;
    }
    if (refusal || !target) {
      /* `own` is not a fault and does not need saying every pass. */
      if (destination.kind !== 'own') {
        await noteSender(channel.id, destination.id, {
          state: 'blocked', says: refusal ?? 'No settings.',
          at: new Date(nowMs).toISOString(),
        }).catch(() => undefined);
      }
      continue;
    }
    keep.add(destination.id);

    const running = live.get(destination.id);
    if (running) {
      /* A key or an address that changed is a different sender. */
      if (running.signature !== signatureOf(target)) stop(destination.id);
      else continue;
    }
    if (nowMs < (waitUntil.get(destination.id) ?? 0)) continue;
    await start(channel, destination, target, nowMs).catch(async (error) => {
      failures.set(destination.id, (failures.get(destination.id) ?? 0) + 1);
      await noteSender(channel.id, destination.id, {
        state: 'blocked',
        says: `Could not start: ${without(String(error), target)}`,
        at: new Date(nowMs).toISOString(),
      }).catch(() => undefined);
    });
  }

  /* Anything switched off, deleted, or newly refused. */
  for (const id of [...live.keys()]) {
    if (!keep.has(id)) {
      stop(id);
      failures.delete(id);
      waitUntil.delete(id);
    }
  }
}

/** A sender that has been up a while is a sender that is working. */
export const SETTLED_MS = 15_000;

/** Reset the backoff for a sender that has stayed up. */
export function settle(nowMs = Date.now()): void {
  for (const [id, running] of live) {
    if (nowMs - running.startedAt >= SETTLED_MS) failures.delete(id);
  }
}
