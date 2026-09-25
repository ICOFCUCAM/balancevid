/**
 * The playout engine, running.  [Doctrine CHANNEL §7, D-18, U-23]
 *
 * "The playout engine continuously reads scheduled assets and produces the
 *  broadcast stream."
 *
 * A PROCESS, NOT A JOB. Everything else that shells out to ffmpeg in this
 * product is a unit of work that finishes — ingest a source, assemble a take,
 * render a master — and the queue exists to run those one at a time without
 * blocking the web tier (U-23). A broadcast does not finish. Putting it in
 * the queue would mean either a job that never completes, holding the single
 * consumer forever so no render ever runs again, or nine hundred jobs an hour
 * whose only purpose is to not be that.
 *
 * So: `npm run playout`, beside `npm run start:worker`. It keeps each
 * channel's stream a few segments ahead of the playhead and sweeps what has
 * fallen out of the window behind it. The web tier still never runs ffmpeg;
 * it serves files this process wrote, exactly as it serves renders the worker
 * wrote.
 *
 * IT HOLDS NO STATE OF ITS OWN. Which segments exist is a fact about the
 * directory, and what should be in them is a fact about the schedule. Restart
 * it and it picks up where the clock is, not where it left off — which is the
 * only correct behaviour for a thing whose job is to agree with the time.
 */

import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import type { Channel } from '../domain/channel.js';
import { SEGMENT_MS, WINDOW_SEGMENTS, segmentIndexAt } from '../domain/playout.js';
import { referencedAssets } from '../domain/channel.js';
import {
  auditChannel, listChannels, loadChannel, saveChannel,
} from '../store/channels.js';
import { faultLive, recoverLive } from '../domain/channelEdit.js';
import { paths } from '../store/paths.js';
import { pathFor } from '../store/playoutSources.js';
import { ffprobe } from '../render/ffmpeg.js';
import { produceSegment, type SourceFacts } from './segment.js';

/**
 * How far ahead of the playhead to keep the stream.
 *
 * Two segments — eight seconds. Enough that a slow encode does not starve the
 * playlist, short enough that an edit to the schedule reaches the wire within
 * ten seconds. A channel that ran a minute ahead would ignore a correction
 * made at 20:59 for a programme at 21:00, which is the one moment corrections
 * are made.
 */
const AHEAD_SEGMENTS = 2;

/** How long to wait between passes when there is nothing to do. */
const IDLE_MS = 1000;

/**
 * What a source file is, measured once.
 *
 * Probing costs a process launch, and a channel asks about the same film
 * every four seconds for an hour. The cache is keyed by path and holds for
 * the life of the process: a render addressed by plan hash is immutable by
 * construction, so a stale answer is not a risk the way it would be for a
 * file somebody can overwrite. [U-16]
 */
const facts = new Map<string, SourceFacts | undefined>();

async function factsFor(path: string): Promise<SourceFacts | undefined> {
  if (facts.has(path)) return facts.get(path);
  let measured: SourceFacts | undefined;
  try {
    /*
     * The CHEAP probe, not `render/probe.ts`. That one counts frames, because
     * everything downstream of it has to be frame-exact (INV-02); this one
     * needs to know how long a film is to the nearest millisecond so a loop
     * comes round in the right place, and counting seventy thousand frames of
     * a forty-minute film to learn that would put a minute of work in front
     * of a segment that has four seconds to be ready.
     */
    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration:stream=codec_type',
      path,
    ]);
    const json = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: { codec_type?: string }[];
    };
    const durationMs = Math.round(Number(json.format?.duration ?? 0) * 1000);
    measured = durationMs > 0
      ? {
        durationMs,
        hasAudio: (json.streams ?? []).some((s) => s.codec_type === 'audio'),
      }
      : undefined;
  } catch {
    measured = undefined;
  }
  facts.set(path, measured);
  return measured;
}

/**
 * Bring one channel's stream up to the clock.
 *
 * Produces any segment in [now, now + ahead] that is not already there, then
 * sweeps everything older than the playlist's window. Returns how many it
 * made, so a caller can tell a busy pass from an idle one.
 */
export async function advance(channel: Channel, nowMs = Date.now()): Promise<number> {
  const current = segmentIndexAt(nowMs);
  /*
   * Everything the schedule can possibly ask for in this pass, measured
   * before the first encode. Doing it inside the encode would put a probe on
   * the critical path of a segment that has four seconds to be ready.
   */
  for (const source of referencedAssets(channel)) {
    /*
     * A still has no duration to measure and probing one would cache an
     * `undefined` that then reads as "unplayable" and puts black on air where
     * a caption card should be. Its slot says how long it is held. [§3]
     */
    if (source.kind === 'media' && source.form === 'image') continue;
    const path = pathFor(channel, source);
    if (path) await factsFor(path);
  }

  let made = 0;
  for (let index = current; index <= current + AHEAD_SEGMENTS; index += 1) {
    const target = paths.channelSegment(channel.id, index);
    try {
      await access(target);
      continue;
    } catch { /* not there yet, which is why we are here. */ }
    await produceSegment(channel, index, (path) => facts.get(path));
    made += 1;
  }

  await sweep(channel.id, current - WINDOW_SEGMENTS - AHEAD_SEGMENTS);
  return made;
}

/**
 * Delete what has fallen out of the window.
 *
 * THIS IS WHAT MAKES THE SEGMENTS NOT A COPY. A file that is written, served
 * for half a minute and deleted is transport; a file that accumulates is an
 * archive, and an archive of the broadcast is exactly the duplication D-18
 * forbids — the whole schedule, re-encoded, forever, with nobody having asked
 * for it. Somebody who wants that asks for a recording (§6).
 */
async function sweep(channelId: string, before: number): Promise<void> {
  if (before <= 0) return;
  let entries: string[];
  try {
    entries = await readdir(paths.channelStream(channelId));
  } catch {
    return;
  }
  await Promise.all(entries.map(async (name) => {
    const index = Number.parseInt(name, 10);
    /*
     * A half-written `.tmp.ts` or `.part.ts` from a process that died mid
     * segment is swept on the same rule: it is named for its index, and if
     * that index is behind the window it is never going to be served.
     */
    if (!Number.isFinite(index) || index >= before) return;
    await rm(join(paths.channelStream(channelId), name), { force: true });
  }));
}

/** Every channel, once. Exported so a test can drive one pass. */
export async function pass(nowMs = Date.now()): Promise<number> {
  const channels = await listChannels();
  let made = 0;
  for (const channel of channels) {
    /*
     * Re-read rather than trusting the listing: a pass takes seconds and the
     * schedule may have been edited during the previous one. A playout engine
     * working from a stale document is a channel broadcasting what somebody
     * has just cancelled.
     */
    const fresh = await loadChannel(channel.id).catch(() => channel);
    /*
     * BEFORE THE SEGMENTS, because a faulted feed changes what they contain.
     * Checked every pass rather than on a timer: the pass IS the timer, and a
     * second one would be a second thing that can stop.
     */
    await watchTheFeed(fresh, nowMs);
    made += await advance(fresh, nowMs).catch(() => 0);
  }
  return made;
}

/* ------------------------------------------------------------------------ *
 *  The process.
 * ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  let running = true;
  const stop = () => { running = false; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  process.stdout.write('playout: on air\n');
  while (running) {
    const started = Date.now();
    let made = 0;
    try {
      made = await pass();
    } catch (error) {
      /*
       * A pass that threw is a pass, not the end of the channel. The most
       * likely causes — a document being rewritten as it was read, a render
       * deleted mid-encode — are transient, and a broadcast that stopped for
       * them would be off air until somebody noticed.
       */
      process.stderr.write(`playout: ${String(error).slice(0, 300)}\n`);
    }
    const spent = Date.now() - started;
    if (made === 0) {
      await new Promise((resolve) => { setTimeout(resolve, IDLE_MS); });
    } else if (spent < SEGMENT_MS / 4) {
      await new Promise((resolve) => { setTimeout(resolve, 200); });
    }
  }
  process.stdout.write('playout: off air\n');
}

/* Run only when started directly, so the module can be imported by a test. */
if (process.argv[1]?.endsWith('playout/index.ts')
  || process.argv[1]?.endsWith('playout/index.js')) {
  void main();
}

/* ------------------------------------------------------------------------ *
 *  Watching the feed.  [Doctrine CHANNEL §9]
 * ------------------------------------------------------------------------ */

/**
 * How long a live buffer may stop growing before the channel gives up on it.
 *
 * Ten seconds: five chunks. Shorter and a presenter on a slow connection
 * would be cut off for a hiccup; longer and the viewer watches a frozen
 * frame for a quarter of a minute, which is the thing this exists to prevent.
 *
 * It is comfortably inside the twelve-second broadcast delay, which matters:
 * the failover happens before the last of the good buffer has gone out, so
 * the cut to backup lands on a picture rather than after one has frozen.
 */
const STALE_MS = 10_000;

/** The last size we saw each live buffer at, and when. */
const watched = new Map<string, { size: number; at: number }>();

/**
 * Is the feed still arriving?
 *
 * By watching the FILE, not the network. The encoder is in somebody's
 * browser on the other side of the world and cannot be asked; what can be
 * observed is whether bytes are landing, which is the only thing that
 * actually matters — a connection that is up and delivering nothing is a
 * failure with a green light on it.
 */
async function watchTheFeed(channel: Channel, nowMs: number): Promise<void> {
  const live = channel.live;
  if (!live || live.phase !== 'on_air') { watched.delete(channel.id); return; }
  const ingest = channel.ingests.find((entry) => entry.id === live.ingestId);
  if (!ingest) return;

  const path = paths.channelLiveBuffer(channel.id, ingest.bufferId);
  let size = 0;
  try {
    size = (await stat(path)).size;
  } catch {
    /* Not created yet is not a fault — the first chunk is still in flight. */
    if (!watched.has(channel.id)) {
      watched.set(channel.id, { size: 0, at: nowMs });
      return;
    }
  }

  const seen = watched.get(channel.id);
  if (!seen || size > seen.size) {
    watched.set(channel.id, { size, at: nowMs });
    if (live.faultedAt && recoverLive(channel)) {
      /*
       * IT CAME BACK. Saved at once, because the studio and the playlist both
       * read this and a presenter who has reconnected should see themselves
       * on air rather than a caption card.
       */
      await saveChannel(channel);
      await auditChannel(channel.id, {
        action: 'channel.feed-recovered',
        detail: { ingestId: ingest.id, bytes: size },
      });
    }
    return;
  }

  if (nowMs - seen.at >= STALE_MS && faultLive(channel, new Date(nowMs).toISOString())) {
    await saveChannel(channel);
    await auditChannel(channel.id, {
      action: 'channel.feed-lost',
      detail: { ingestId: ingest.id, silentMs: nowMs - seen.at, bytes: size },
    });
  }
}
