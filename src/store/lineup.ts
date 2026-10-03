/**
 * The lineup, on disk.  [Doctrine CHANNEL §2, D-18, TV-NETWORK N-6]
 *
 * ONE SMALL FILE BESIDE THE CHANNELS, holding a number per channel
 * id and nothing else. Not in the channel documents, because an
 * assignment belongs to the network and a channel document belongs
 * to its owner — *"I would not allow every user to choose any
 * number they want"* is a rule about who writes, and the only way
 * to hold it is to write somewhere else.
 *
 * ALLOCATION IS LAZY AND PERMANENT. A channel gets its number the
 * first time anything asks for one, and keeps it: there is no
 * "assign numbers" step an operator could forget, and no pass that
 * renumbers a lineup behind a viewer's back.
 *
 * THE FILE IS NOT THE TRUTH ABOUT WHICH CHANNELS EXIST. It may
 * name a channel that has been deleted and may not yet name one
 * that was just made; the channel documents are the truth, and
 * this answers one question about them. A stale row reserves a
 * number, which is the conservative direction: it keeps a deleted
 * channel's number out of circulation a while longer.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { type Assignments, numberFor } from '../domain/registry.js';
import { paths } from './paths.js';

/** What is written down, or nothing if nothing is. */
export async function readLineup(): Promise<Assignments> {
  try {
    const read: unknown = JSON.parse(await readFile(paths.lineup(), 'utf8'));
    if (!read || typeof read !== 'object' || Array.isArray(read)) return {};
    return read as Assignments;
  } catch {
    /*
     * A LINEUP THAT CANNOT BE READ IS AN EMPTY ONE, never a thrown
     * error. This is on the path of every public television page,
     * and a directory that 500s because a numbers file was
     * truncated is a worse outcome than a directory with no
     * numbers in it. [D-21]
     */
    return {};
  }
}

async function write(assignments: Assignments): Promise<void> {
  await mkdir(paths.channels(), { recursive: true });
  const target = paths.lineup();
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(assignments, null, 2), 'utf8');
  await rename(temp, target);
}

/**
 * Every channel's number, allocating any that are missing.
 *
 * ONE READ AND AT MOST ONE WRITE, however many channels are new.
 * Called on the directory, the guide and every station page, so a
 * write per channel would be a write per row on a page that is
 * served to strangers.
 *
 * AND IT ONLY WRITES WHEN SOMETHING CHANGED, so the common case —
 * every channel already numbered — touches nothing. A file
 * rewritten on every page view is a file whose mtime says nothing
 * and whose disk is busy for no reason.
 */
export async function lineupFor(
  channelIds: readonly string[],
): Promise<Assignments> {
  const held = await readLineup();
  const next: Record<string, number> = { ...held };
  let changed = false;
  for (const id of channelIds) {
    if (typeof next[id] === 'number' && next[id]! > 0) continue;
    const given = numberFor(next, id);
    /* A full lineup answers zero, and zero is not written down:
       the channel simply has no number, and the next channel
       deleted frees one for it. */
    if (given > 0) { next[id] = given; changed = true; }
  }
  if (changed) {
    await write(next).catch(() => undefined);
  }
  return next;
}
