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
 *   var/performances/<id>/   Studio Two. The same shape, a different document.
 *     performance.json       the canonical artifact (INV-00)
 *     audit.log
 *     assets/                the master track, its analysis copy, the takes
 *     assets/chunks/<take>/  streamed recording chunks (U-06, shared)
 *     renders/<planHash>/
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
  /**
   * One still of a response, for the conversation timeline.
   *
   * Taken when the take is assembled rather than on demand: ffmpeg already
   * has the file open at that moment, so the frame costs almost nothing —
   * and a timeline that fills in later is a timeline that looks broken first.
   */
  takePoster: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}poster`)}.jpg`),
  /** Rendered thumbnail candidates. [U-30] */
  thumbnails: (id: string) => join(paths.conversation(id), 'thumbnails'),
  thumbnail: (id: string, candidateId: string) =>
    join(paths.thumbnails(id), `${safe(candidateId)}.png`),
  /**
   * The picture a link to this conversation shows. [U-31]
   *
   * One per conversation, not one per candidate: there is nothing to choose
   * between. It sits beside the thumbnails because it is made at the same
   * moment, by the same job, out of the same decoder.
   */
  shareCard: (id: string) => join(paths.thumbnails(id), 'share-card.png'),
  /**
   * A card per exchange.  [U-30, U-31]
   *
   * Beside the share card and for the same reason — both are typography made
   * by the same job out of the same facts — but a directory rather than a
   * file, because there are as many of these as the author had things to say.
   */
  claimCards: (id: string) => join(paths.thumbnails(id), 'claim-cards'),
  /* ---- Studio Two.  [STUDIO-TWO S-1] --------------------------------- *
   *
   * A parallel tree rather than a flag inside the conversation one, for the
   * same reason the document is a second root: the two are different objects
   * and a directory that is sometimes one and sometimes the other is a
   * directory somebody's cleanup script gets wrong.
   */
  performances: () => join(VAR_ROOT, 'performances'),
  performance: (id: string) => join(VAR_ROOT, 'performances', safe(id)),
  performanceDocument: (id: string) => join(paths.performance(id), 'performance.json'),
  performanceAudit: (id: string) => join(paths.performance(id), 'audit.log'),
  performanceAssets: (id: string) => join(paths.performance(id), 'assets'),
  performanceAsset: (id: string, assetId: string, ext: string) =>
    join(paths.performanceAssets(id), `${safe(assetId)}.${ext.replace(/[^a-z0-9]/gi, '')}`),
  performanceChunks: (id: string, takeId: string) =>
    join(paths.performanceAssets(id), 'chunks', safe(takeId)),
  performanceRenders: (id: string) => join(paths.performance(id), 'renders'),
  /** Clips and the link preview of a performance. [STUDIO-TWO §14] */
  performanceClips: (id: string) => join(paths.performance(id), 'clips'),
  performanceCard: (id: string) => join(paths.performance(id), 'share-card.png'),
  /** The averaged still of an empty room, for §4's matte. [STUDIO-TWO S-6] */
  performancePlate: (id: string, assetId: string) =>
    join(paths.performanceAssets(id), `${safe(assetId)}.plate.png`),
  /**
   * The master, as raw samples for analysis.
   *
   * A second copy, deliberately. Alignment reads whole minutes of audio and
   * decoding an MP3 to do it every time is work repeated for no reason;
   * mono 16-bit PCM at the house rate is the cheapest thing to read and the
   * only form the measurement wants. [S-3]
   */
  masterAnalysis: (id: string) => join(paths.performanceAssets(id), 'master.f32'),
  takeAnalysis: (id: string, assetId: string) =>
    join(paths.performanceAssets(id), `${safe(assetId)}.f32`),
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
