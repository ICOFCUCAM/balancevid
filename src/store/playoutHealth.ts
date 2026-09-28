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
import { VAR_ROOT, paths, safe } from './paths.js';

const BEAT_FILE = join(VAR_ROOT, 'playout.json');

/** The engine says it is still here. Called at the end of every pass. */
export async function beat(
  what: { channels: number; made: number }, at = new Date(),
): Promise<void> {
  const body: Heartbeat = {
    at: at.toISOString(),
    pid: process.pid,
    channels: what.channels,
    made: what.made,
  };
  await mkdir(VAR_ROOT, { recursive: true });
  const temp = `${BEAT_FILE}.${process.pid}.tmp`;
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
