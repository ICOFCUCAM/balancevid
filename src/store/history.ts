/**
 * Undo, as versions of the document.  [MASTER-EDIT §12 P1]
 *
 * NOTHING IN THIS PRODUCT HAD UNDO, and a studio offering professional
 * controls without it is making a promise it cannot keep: the whole value of
 * a timeline you can click is that you can try something, and trying
 * something you cannot take back is not trying.
 *
 * VERSIONS, NOT INVERSE OPERATIONS. The alternative — a command log where
 * every edit knows how to undo itself — needs an inverse for each of the
 * twenty-odd operations in `performanceEdit`, and every new operation
 * arrives with a second, less-tested one beside it. A performance document
 * is small (scenes, takes' metadata, the audio mode — never media), so the
 * whole of it is cheaper to keep than the machinery for reversing it.
 *
 * AND IT IS HONEST BECAUSE EDITS NEVER DELETE MEDIA. `removeTake` unlinks a
 * take from the document and leaves its asset on disk; no route removes one.
 * That is what makes restoring an old document safe — it can only ever point
 * at files that are still there. If that ever stops being true, undo starts
 * lying, which is why `test/store` asserts it rather than trusting it.
 *
 * A LINEAR HISTORY, which is the one people can predict. `head` is the
 * version you are looking at; undo walks back, redo walks forward, and an
 * edit made after undoing TRUNCATES the future — the branch you abandoned
 * does not come back, because a redo that resurrects work you edited past is
 * the behaviour nobody can hold in their head.
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { paths } from './paths.js';

/** How far back it goes. Beyond this, the oldest version is dropped. */
export const HISTORY_DEPTH = 50;

export interface HistoryState {
  /** How many versions exist behind the current one. */
  canUndo: boolean;
  canRedo: boolean;
  /** Where the head sits, and how many versions there are. */
  head: number;
  count: number;
}

interface Index { head: number; count: number }

const indexPath = (id: string) => `${paths.performanceHistory(id)}/index.json`;

async function readIndex(id: string): Promise<Index> {
  try {
    return JSON.parse(await readFile(indexPath(id), 'utf8')) as Index;
  } catch {
    return { head: 0, count: 0 };
  }
}

async function writeIndex(id: string, index: Index): Promise<void> {
  await mkdir(paths.performanceHistory(id), { recursive: true });
  await writeFile(indexPath(id), JSON.stringify(index), 'utf8');
}

/**
 * Keep this version, and drop any future the edit just abandoned.
 *
 * Called with the document as it now IS, after the edit. Version 1 is the
 * first state ever recorded, so a document with one version has nothing to
 * undo to — which is correct, and the reason `canUndo` asks for two.
 */
export async function recordVersion(id: string, document: unknown): Promise<void> {
  const index = await readIndex(id);
  const next = index.head + 1;
  await mkdir(paths.performanceHistory(id), { recursive: true });
  await writeFile(paths.performanceVersion(id, next),
    JSON.stringify(document), 'utf8');

  /*
   * THE ABANDONED FUTURE, SWEPT UP. Not what makes redo stop — `count`
   * below does that, by no longer counting them — but versions nothing can
   * reach are still versions on somebody's disk. A mutation aimed at this
   * loop went green, which is how the distinction got noticed: the loop is
   * housekeeping and the line under it is the rule.
   */
  for (let n = next + 1; n <= index.count; n += 1) {
    await rm(paths.performanceVersion(id, n), { force: true });
  }
  /* And the oldest, once there are more than the depth allows. */
  const oldest = next - HISTORY_DEPTH;
  if (oldest > 0) await rm(paths.performanceVersion(id, oldest), { force: true });

  await writeIndex(id, { head: next, count: next });
}

/** Whether there is anywhere to go, without loading a version to find out. */
export async function historyState(id: string): Promise<HistoryState> {
  const { head, count } = await readIndex(id);
  let earliest = 1;
  try {
    const names = await readdir(paths.performanceHistory(id));
    const numbers = names
      .filter((name) => /^v\d{6}\.json$/.test(name))
      .map((name) => Number(name.slice(1, 7)));
    earliest = numbers.length > 0 ? Math.min(...numbers) : head;
  } catch { earliest = head; }
  return { head, count, canUndo: head > earliest, canRedo: head < count };
}

/**
 * Step the head, and hand back the document to save.
 *
 * It returns the version rather than writing it, because writing a
 * performance is the store's job and doing it here would be a second path
 * into the same file. `null` means there is nowhere to go.
 */
export async function stepHistory(
  id: string, direction: -1 | 1,
): Promise<unknown | null> {
  const state = await historyState(id);
  if (direction === -1 && !state.canUndo) return null;
  if (direction === 1 && !state.canRedo) return null;
  const target = state.head + direction;
  let document: unknown;
  try {
    document = JSON.parse(await readFile(paths.performanceVersion(id, target), 'utf8'));
  } catch {
    return null;
  }
  await writeIndex(id, { head: target, count: state.count });
  return document;
}
