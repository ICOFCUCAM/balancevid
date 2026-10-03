/**
 * What this machine can actually do, measured on it.
 *   [Doctrine §19, U-25; TAKE-DESKTOP T-3]
 *
 * > *"free disk and sustained write rate **on this machine**"*
 *
 * THE EMPHASIS IS THE BRIEF'S AND IT IS THE WHOLE POINT. A
 * published figure for a disk is what it does on a bench with
 * nothing else running; what matters is what THIS machine
 * sustained to THIS directory a moment ago, with whatever else
 * the operator has open.
 *
 * `src/store/space.ts` ALREADY ASKS `statfs` on the installation
 * side, and is not reused: it is bound to `VAR_ROOT`, it walks a
 * directory to total what the work occupies, and it caches for a
 * minute. None of that is this question, and the one line they
 * share is the system call. What IS taken from it is the rule it
 * states — *"the only honest figures are what the work occupies
 * and what the disk has left"* — one level sharper, because a
 * recording also needs the disk to keep UP.
 *
 * AND IT MEASURES BY WRITING. There is no way to ask an operating
 * system how fast a filesystem is; the number is only true if you
 * produce it. So this writes a real file to the real directory
 * the recording will go to, in the chunks a recorder produces,
 * and times it.
 */

import { open, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';

export interface Machine {
  freeBytes: number;
  writeBytesPerSecond: number;
  /** Where it measured, so a refusal can name the disk. */
  where: string;
}

/**
 * How much is written while measuring.
 *
 * ENOUGH TO LEAVE THE CACHE, which is the only thing that makes
 * this a measurement rather than a measurement of RAM. A few
 * megabytes are absorbed by the page cache and return a number in
 * the gigabytes a second, which would pass every disk ever made.
 * Sixty-four megabytes takes under a second on anything modern
 * and several on the kind of disk this check exists to refuse —
 * which is the right way round.
 */
export const PROBE_BYTES = 64 * 1024 * 1024;

/**
 * The size of one write.
 *
 * A RECORDER PRODUCES CHUNKS, NOT A STREAM. `MediaRecorder`
 * delivers a blob per timeslice, and a probe that wrote one
 * enormous buffer would measure something no recording does. Four
 * megabytes is about a second of four streams at 1080p30.
 */
const CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * What the filesystem holding this directory has left.
 *
 * `statfs`, and the AVAILABLE blocks rather than the free ones:
 * a filesystem reserves some for root, and a recording does not
 * run as root. `bfree` would promise space this application
 * cannot have.
 */
export async function freeOn(where: string): Promise<number> {
  const stats = await statfs(where);
  return Number(stats.bavail) * Number(stats.bsize);
}

/**
 * What this directory sustained, a moment ago.
 *
 * FLUSHED, OR IT IS NOT A MEASUREMENT. Without `datasync` the
 * numbers are the page cache's and not the disk's — the same
 * class of error as PART THREE's reading a stopped track, and it
 * fails in the same direction: a figure that looks wonderful and
 * is about something else.
 *
 * THE PROBE FILE IS REMOVED WHETHER OR NOT THIS WORKS. A capture
 * station that left sixty-four megabytes behind every time
 * somebody opened PREPARE would be the thing filling the disk it
 * is checking.
 */
export async function writeRateOn(
  where: string, bytes = PROBE_BYTES,
): Promise<number> {
  const target = join(where, `.take-probe-${process.pid}`);
  const chunk = Buffer.alloc(CHUNK_BYTES, 0);
  let handle;
  try {
    handle = await open(target, 'w');
    const began = performance.now();
    for (let written = 0; written < bytes; written += CHUNK_BYTES) {
      await handle.write(chunk);
    }
    /* The disk, not the cache. */
    await handle.datasync();
    const took = (performance.now() - began) / 1000;
    return took > 0 ? bytes / took : 0;
  } catch {
    /*
     * A DIRECTORY THAT CANNOT BE WRITTEN TO SUSTAINS NOTHING, and
     * zero is the honest answer rather than an absent one: the
     * check above it refuses, with the number it measured, which
     * is what the operator needs to know.
     */
    return 0;
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(target, { force: true }).catch(() => undefined);
  }
}

export async function measure(where: string): Promise<Machine> {
  const [freeBytes, writeBytesPerSecond] = await Promise.all([
    freeOn(where).catch(() => 0),
    writeRateOn(where),
  ]);
  return { freeBytes, writeBytesPerSecond, where };
}
