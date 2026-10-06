/**
 * The engine's pulse, on disk.  [Doctrine CHANNEL §18, §11, D-20]
 *
 * The playout engine is a separate process and the web tier never talks to
 * it (U-23). So the only thing they share is the filesystem, and the only
 * honest way for a page to know whether the encoder is alive is to look at
 * what it left there.
 *
 * ONE FILE, OVERWRITTEN. Not a log: nothing here is history, and a health
 * record that grew would be a health record somebody has to delete. Written
 * through a temp file and renamed, like every other write in this codebase,
 * so a reader never catches it half-written.
 *
 * IT IS NOT IN THE CHANNEL DOCUMENT, deliberately. A document is the thing
 * that survives a restart; liveness is the thing that must not. Writing
 * "healthy" into a channel would leave that word there after the process
 * died, which is the exact failure this is here to catch.
 */

import { readFile, rename, stat, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Heartbeat } from '../domain/health.js';
import type { Pacing, Reach } from '../domain/pace.js';
import { VAR_ROOT, paths, safe } from './paths.js';

const BEAT_FILE = join(VAR_ROOT, 'playout.json');

/** Counts the writes of this process, so two in flight cannot share a name. */
let writes = 0;

/** The engine says it is still here. Called at the end of every pass. */
export async function beat(
  what: {
    channels: number; made: number;
    /** Whether it is keeping up, when the pass produced anything. [C-41] */
    pacing?: Pacing; load?: number;
    /**
     * AND HOW LONG IT TAKES TO COME BACK.  [§15, pace.ts `reach`]
     *
     * The fact the web tier had to guess at and guessed wrong:
     * every patience in `health.ts` assumed the engine returned
     * within three segments, which is true of one channel and was
     * 20.1 seconds on a measured seventeen. It travels in the
     * heartbeat because the heartbeat is the only thing the two
     * processes share.
     */
    roundTripMs?: number;
    /** Whether the lead outlasts that round trip. [pace.ts] */
    reach?: Reach;
    /** How much television was written ahead, for the sentence. */
    leadMs?: number;
  },
  at = new Date(),
): Promise<void> {
  const body: Heartbeat = {
    at: at.toISOString(),
    pid: process.pid,
    channels: what.channels,
    made: what.made,
    ...(what.pacing ? { pacing: what.pacing } : {}),
    ...(what.load === undefined ? {} : { load: what.load }),
    ...(what.roundTripMs === undefined ? {} : { roundTripMs: what.roundTripMs }),
    ...(what.reach ? { reach: what.reach } : {}),
    ...(what.leadMs === undefined ? {} : { leadMs: what.leadMs }),
  };
  await mkdir(VAR_ROOT, { recursive: true });
  /*
   * A NAME PER WRITE, NOT PER PROCESS.  [§18]
   *
   * The pulse is a timer now and a pass still beats when it ends,
   * so two writes from the SAME pid can be in flight at once — and
   * with one temp name between them, the second `writeFile` lands
   * in the file the first is about to rename. A reader then gets
   * whichever half won. Unique per write, so the rename is always
   * of a file this call finished writing.
   */
  const temp = `${BEAT_FILE}.${process.pid}.${writes += 1}.tmp`;
  await writeFile(temp, JSON.stringify(body), 'utf8');
  await rename(temp, BEAT_FILE);
}

/**
 * When the engine last said anything, or null if it never has.
 *
 * A missing file and an unreadable one are the same answer — "we do not know
 * that it is running" — because they lead to the same advice and telling
 * them apart would only give the page a third state nobody can act on.
 */
export async function readBeat(): Promise<Heartbeat | null> {
  try {
    return JSON.parse(await readFile(BEAT_FILE, 'utf8')) as Heartbeat;
  } catch {
    return null;
  }
}

/**
 * When this channel's newest segment was written, or null if it has none.
 *
 * A fact about the directory, exactly as `advance` treats it: the engine
 * holds no state and neither does this. Reading mtimes is cheap next to what
 * produced the files, and the alternative — the engine reporting per-channel
 * health — would be the engine keeping state about itself.
 */
export async function newestSegmentAt(channelId: string): Promise<number | null> {
  const dir = paths.channelStream(safe(channelId));
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  /* Finished segments only. A `.part.ts` is an encode in progress, and
     counting one as transmission would call a stuck encoder healthy. */
  const finished = names.filter(
    (name) => name.endsWith('.ts') && !name.includes('.part.'));
  if (finished.length === 0) return null;

  let newest = 0;
  for (const name of finished) {
    try {
      const info = await stat(join(dir, name));
      if (info.mtimeMs > newest) newest = info.mtimeMs;
    } catch { /* swept between the listing and the stat. */ }
  }
  return newest > 0 ? newest : null;
}

/* ------------------------------------------------------------------------ *
 *  When a segment could not be rendered.  [CHANNEL §18, C-24]
 * ------------------------------------------------------------------------ */

/**
 * The encoder had a source and could not render it.
 *
 * THE SIGNAL THAT WAS MISSING, and its absence cost this product every
 * picture it transmitted. `produceSegment` falls back to black rather
 * than taking the channel off the air, which is right — but the
 * fallback SUCCEEDS, so a channel rendering black four seconds at a
 * time read as `transmitting` and perfectly healthy. A resilience path
 * with no telemetry is a fault that cannot be found.
 *
 * NOT EVERY BLACK SEGMENT IS THIS. A channel with nothing scheduled is
 * black on purpose and says so through `whyDark`. What is recorded here
 * is narrower and unambiguous: the engine resolved a source, asked
 * ffmpeg for it, and ffmpeg refused.
 *
 * ONE FILE PER CHANNEL, OVERWRITTEN, like the heartbeat beside it and
 * for the same reason: this is liveness, not history. The newest
 * failure is the one worth acting on, and a log of them is a file
 * somebody has to delete.
 */
export interface RenderFailure {
  at: string;
  /** The line of ffmpeg's complaint worth showing an operator. */
  says: string;
}

/**
 * Beside the heartbeat, NOT in the channel's stream directory.
 *
 * The first version put it in `stream/`, next to the segments, and a
 * test caught it within the hour: that directory holds transport and
 * nothing else — the sweeper deletes by age from it and the playlist
 * route lists it. A health record among the segments is a health
 * record the sweeper will eventually delete and the playlist may
 * eventually serve.
 *
 * It belongs where `playout.json` is, for `playout.json`'s own stated
 * reason: this is liveness, and liveness does not live with the
 * material.
 */
function failureFile(channelId: string): string {
  return join(VAR_ROOT, 'playout', `${safe(channelId)}.json`);
}

/**
 * What ffmpeg actually said, out of what it says.
 *
 * ffmpeg is voluble and the useful line is rarely the last one, so the
 * line NAMING the refusal is preferred over the tail. "No such filter:
 * 'drawtext'" is an operator's whole answer; "conversion failed" is
 * not.
 */
export function reasonFrom(stderr: string): string {
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean);
  const named = lines.find((line) => /No such filter|Unknown (filter|encoder|decoder)|Invalid argument|not found|Unrecognized/i.test(line));
  return (named ?? lines[lines.length - 1] ?? 'ffmpeg failed')
    /* The graph address in `[AVFilterGraph @ 0x55…]` changes every run,
       so leaving it in makes two identical faults look different. */
    .replace(/\s*\[[^\]]*@ 0x[0-9a-f]+\]\s*/gi, ' ')
    .trim()
    .slice(0, 200);
}

/** Record that this channel's segment could not be rendered. */
export async function noteFailure(
  channelId: string, says: string, at = new Date(),
): Promise<void> {
  const file = failureFile(channelId);
  try {
    await mkdir(join(VAR_ROOT, 'playout'), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ at: at.toISOString(), says }), 'utf8');
    await rename(temp, file);
  } catch {
    /* A health record that cannot be written must not take the channel
       off the air. The transmission outranks the telemetry. */
  }
}

/** The newest render failure for this channel, or nothing. */
export async function readFailure(
  channelId: string,
): Promise<RenderFailure | null> {
  try {
    return JSON.parse(
      await readFile(failureFile(channelId), 'utf8')) as RenderFailure;
  } catch {
    return null;
  }
}
