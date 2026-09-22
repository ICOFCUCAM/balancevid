/**
 * On-disk layout.
 *
 * It deliberately mirrors the portable archive the doctrine promises (U-25):
 * a conversation directory is already the export. "No lock-in. In a product
 * built on the premise that discourse should be open and accountable, holding
 * users' recorded arguments hostage would contradict the product's thesis."
 *
 *   var/conversations/<id>/
 *     conversation.json      the document -- the canonical artifact (INV-00)
 *     audit.log              append-only history (U-25 §2, D-06)
 *     assets/                originals, mezzanines, stills
 *     assets/chunks/<take>/  streamed recording chunks (U-06)
 *     renders/<planHash>/    render plan, shot cache, outputs
 *
 * This is a filesystem adapter standing in for object storage (D-14). Every
 * path goes through here so swapping in S3 touches one module.
 */

import { join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

export const VAR_ROOT = process.env['BALANCEVID_VAR'] ?? resolve(process.cwd(), 'var');

export const paths = {
  conversations: () => join(VAR_ROOT, 'conversations'),
  conversation: (id: string) => join(VAR_ROOT, 'conversations', safe(id)),
  document: (id: string) => join(paths.conversation(id), 'conversation.json'),
  audit: (id: string) => join(paths.conversation(id), 'audit.log'),
  assets: (id: string) => join(paths.conversation(id), 'assets'),
  asset: (id: string, assetId: string, ext: string) =>
    join(paths.assets(id), `${safe(assetId)}.${ext.replace(/[^a-z0-9]/gi, '')}`),
  chunks: (id: string, takeId: string) => join(paths.assets(id), 'chunks', safe(takeId)),
  renders: (id: string) => join(paths.conversation(id), 'renders'),
  render: (id: string, planHash: string) => join(paths.renders(id), safe(planHash)),
  /** Archived evidence: captures, originals and their hashes. [U-33] */
  evidence: (id: string) => join(paths.assets(id), 'evidence'),
  evidenceCapture: (id: string, assetId: string) =>
    join(paths.assets(id), 'evidence', `${safe(assetId)}.png`),
  /** The editing proxy: what the player scrubs. Same frames as the mezzanine. */
  sourceProxy: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}proxy`)}.webm`),
  /**
   * A take's playback proxy.  [Doctrine U-39]
   *
   * The companion player is a published artefact, and whether a viewer's
   * browser can decode H.264 is a licensing question we do not control. The
   * proxy is offered alongside the mezzanine so the player picks what it can
   * actually play.
   */
  takeProxy: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}proxy`)}.webm`),
  /** A take's normalised media. Named here so the web tier can serve it
   *  without importing anything that can run ffmpeg. */
  takeMezzanine: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}mezz`)}.mp4`),
  /** Rendered thumbnail candidates. [U-30] */
  thumbnails: (id: string) => join(paths.conversation(id), 'thumbnails'),
  thumbnail: (id: string, candidateId: string) =>
    join(paths.thumbnails(id), `${safe(candidateId)}.png`),
  queue: () => join(VAR_ROOT, 'queue'),
  queueState: (state: QueueState) => join(VAR_ROOT, 'queue', state),
};

export type QueueState = 'pending' | 'running' | 'done' | 'failed';

/**
 * Ids are generated, but they also arrive from HTTP. Anything that reaches a
 * path join is constrained to the alphabet we actually issue -- path traversal
 * into another tenant's recordings is the worst incident this product can have
 * (D-06).
 */
export function safe(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error(`unsafe identifier: ${JSON.stringify(id)}`);
  }
  return id;
}

export async function ensureDirs(): Promise<void> {
  await mkdir(paths.conversations(), { recursive: true });
  for (const state of ['pending', 'running', 'done', 'failed'] as const) {
    await mkdir(paths.queueState(state), { recursive: true });
  }
}
