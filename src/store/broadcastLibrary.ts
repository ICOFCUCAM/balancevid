/**
 * What there is to broadcast.  [Doctrine CHANNEL §3, D-18, D-16]
 *
 * A channel schedules things other studios finished. This lists them —
 * finished renders, across both document types, with the one thing a
 * scheduler needs that a render does not carry: how long it is, so a slot can
 * be the right length without anybody typing a number they guessed.
 *
 * IT LISTS, IT DOES NOT STAGE. Nothing here copies, links, or moves a file
 * into the channel. The result is a list of REFERENCES with labels on them —
 * which is exactly what a `ProgrammeSource` is, handed to the studio so a
 * person can click one.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProgrammeDocument, ProgrammeSource } from '../domain/channel.js';
import { listConversations } from './repository.js';
import { listPerformances } from './performances.js';
import { paths } from './paths.js';

export interface BroadcastItem {
  /** A reference — a render, or a piece of other media. Never a copy. */
  source: ProgrammeSource;
  /** The document's title, read now rather than copied at schedule time. */
  title: string;
  /** `other` is the library's third branch: idents, cards, photographs. */
  document: ProgrammeDocument | 'other';
  documentId: string;
  planHash: string;
  /** Bytes on disk, which is the only cheap fact about a file. */
  bytes: number;
  /** When the render was made, so the newest is first. */
  madeAt: string;
}

/**
 * Every finished render, newest first.
 *
 * A render is "finished" if `master.mp4` is there. Asked of the filesystem
 * rather than of the queue, because a job record that says done and a file
 * that is not there is exactly the state a scheduler must not be shown —
 * scheduling it would produce a black hour at whatever time it was set for.
 */
export async function broadcastLibrary(): Promise<BroadcastItem[]> {
  const items: BroadcastItem[] = [];

  const conversations = await listConversations().catch(() => []);
  for (const summary of conversations) {
    items.push(...await rendersOf(
      'conversation', summary.id, summary.title, paths.renders(summary.id)));
  }

  const performances = await listPerformances().catch(() => []);
  for (const performance of performances) {
    items.push(...await rendersOf(
      'performance', performance.id, performance.title,
      paths.performanceRenders(performance.id)));
  }

  /*
   * THE THIRD BRANCH of the brief's diagram: idents, caption cards,
   * photographs — media that no studio made. Listed beside the other two
   * because a scheduler does not care which door a thing came through, only
   * that it can point at it. [§3]
   */
  items.push(...await otherMedia());

  return items.sort((a, b) => b.madeAt.localeCompare(a.madeAt));
}

/** Everything in `var/library/`, which is where other media lives. */
async function otherMedia(): Promise<BroadcastItem[]> {
  let names: string[];
  try {
    names = await readdir(paths.library());
  } catch {
    return [];
  }
  const found: BroadcastItem[] = [];
  for (const name of names) {
    if (name.endsWith('.json')) continue;
    const assetId = name.split('.')[0];
    if (!assetId) continue;
    const file = join(paths.library(), name);
    const info = await stat(file).catch(() => null);
    if (!info) continue;
    let title = assetId;
    try {
      const sidecar = await readFile(join(paths.library(), `${assetId}.json`), 'utf8');
      title = (JSON.parse(sidecar) as { label?: string }).label ?? assetId;
    } catch { /* an upload with no sidecar keeps its id. */ }
    found.push({
      source: {
        kind: 'media', assetId,
        form: name.endsWith('.jpg') ? 'image' : 'video',
      },
      title,
      document: 'other',
      documentId: assetId,
      planHash: '',
      bytes: info.size,
      madeAt: info.mtime.toISOString(),
    });
  }
  return found;
}

async function rendersOf(
  document: ProgrammeDocument, documentId: string, title: string, dir: string,
): Promise<BroadcastItem[]> {
  let hashes: string[];
  try {
    hashes = await readdir(dir);
  } catch {
    return [];
  }
  const found: BroadcastItem[] = [];
  for (const planHash of hashes) {
    const file = join(dir, planHash, 'master.mp4');
    try {
      const info = await stat(file);
      found.push({
        source: { kind: 'render', document, documentId, planHash },
        title,
        document,
        documentId,
        planHash,
        bytes: info.size,
        madeAt: info.mtime.toISOString(),
      });
    } catch { /* a render directory with no master is a render still going. */ }
  }
  return found;
}
