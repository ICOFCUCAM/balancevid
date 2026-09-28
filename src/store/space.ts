/**
 * How much room is left.  [Doctrine §19, U-25]
 *
 * A workspace that lets you delete things should say why you would want to.
 * This is the number that makes the delete menu mean something, and it is a
 * real measurement rather than a quota: this product has no accounts and no
 * plan, so the only honest figures are what the work occupies and what the
 * disk has left.
 *
 * TWO NUMBERS, NOT ONE. "145 GB used" says nothing on its own — used out of
 * what? The filesystem's own free space is the denominator, and it is the
 * one that actually stops a render.
 *
 * MEASURED, THEN CACHED FOR A MINUTE. Walking the var directory costs a stat
 * per file and the home page is the one page somebody reloads out of habit.
 * A minute is far shorter than the time it takes to fill a disk and far
 * longer than a double-click.
 */

import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { VAR_ROOT } from './paths.js';

export interface Space {
  /** What this workspace's own files occupy. */
  usedBytes: number;
  /** What the filesystem has left, which is what actually runs out. */
  freeBytes: number;
  /** The filesystem's size, for the bar to be a proportion of something. */
  totalBytes: number;
  /** True when the walk gave up, so the page can say "at least". */
  partial: boolean;
}

/**
 * Enough files that the number is right; few enough that the page is fast.
 *
 * A channel's stream directory alone is a few hundred segments that are
 * swept continuously, and they are not work anybody is storing — so a cap
 * here costs accuracy on exactly the bytes that do not matter.
 */
const MAX_FILES = 20_000;

/** How long a measurement stands before it is taken again. */
const CACHE_MS = 60_000;

let cached: { at: number; space: Space } | null = null;

export async function diskSpace(now = Date.now()): Promise<Space> {
  if (cached && now - cached.at < CACHE_MS) return cached.space;

  let usedBytes = 0;
  let seen = 0;
  let partial = false;

  const walk = async (dir: string): Promise<void> => {
    if (seen >= MAX_FILES) { partial = true; return; }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= MAX_FILES) { partial = true; return; }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        seen += 1;
        try {
          usedBytes += (await stat(full)).size;
        } catch { /* swept between the listing and the stat. */ }
      }
    }
  };
  await walk(VAR_ROOT);

  let freeBytes = 0;
  let totalBytes = 0;
  try {
    const fs = await statfs(VAR_ROOT);
    freeBytes = Number(fs.bavail) * Number(fs.bsize);
    totalBytes = Number(fs.blocks) * Number(fs.bsize);
  } catch { /* an unusual filesystem; the bar falls back to what is used. */ }

  const space: Space = { usedBytes, freeBytes, totalBytes, partial };
  cached = { at: now, space };
  return space;
}

/** `1.4 GB`, `812 MB`, `— `. Two significant figures, which is all a bar needs. */
export function bytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit += 1; }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
