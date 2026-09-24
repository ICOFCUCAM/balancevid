import { mkdir, writeFile } from 'node:fs/promises';

import { type MasterClass, MASTER_CLASSES } from '../../../src/domain/performance.js';
import { newPerformance } from '../../../src/domain/performanceEdit.js';
import { newId } from '../../../src/domain/ids.js';
import type { AssetId } from '../../../src/domain/document.js';
import { ensureDirs, paths } from '../../../src/store/paths.js';
import { enqueue } from '../../../src/store/queue.js';
import {
  auditPerformance, listPerformances, savePerformance,
} from '../../../src/store/performances.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * Studio Two's projects.  [Doctrine STUDIO-TWO §1, §3, S-1, S-9]
 *
 * A separate collection from the Conversations, because a Performance is a
 * separate document. Listing them together would mean one endpoint answering
 * about two kinds of thing, which is how a client ends up with a field that is
 * sometimes a source and sometimes a song.
 */
export async function GET(): Promise<Response> {
  const performances = await listPerformances();
  return json({
    performances: performances.map((p) => ({
      id: p.id,
      title: p.title,
      master: {
        title: p.master.title,
        artist: p.master.artist,
        class: p.master.class,
        durationSamples: p.master.durationSamples,
      },
      takes: p.takes.length,
      scenes: p.scenes.length,
      updatedAt: p.updatedAt,
      /* A master still being decoded has no length, so nothing can be placed
       * on it yet — the same "not ready" a Conversation has before ingest. */
      ready: p.master.durationSamples > 0,
    })),
  });
}

/**
 * Step 1 — choose the music.  [§3]
 *
 * "Then: the master track is ready." Not quite: it is decoded first, because
 * every scene boundary in the performance is measured against a length that
 * has to be counted rather than believed (U-02), and ffmpeg never runs in the
 * web tier (U-23).
 *
 * THE CLASSIFICATION IS ASKED FOR HERE and defaults to the most restrictive
 * answer. An author who uploads a commercial recording gets a studio that
 * works and a publish button that refuses, which is the honest arrangement —
 * the alternative is finding out after making the video. [S-9, INV-15]
 */
export async function POST(request: Request): Promise<Response> {
  await ensureDirs();
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, 'a music file is required');

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, 'choose a song, an instrumental or a backing track to perform against');
  }

  const declared = String(form.get('masterClass') ?? '').trim();
  /*
   * Unstated means third-party. The safe default is the restrictive one: a
   * field left blank must not quietly grant a permission nobody claimed.
   */
  const masterClass: MasterClass = MASTER_CLASSES.includes(declared as MasterClass)
    ? declared as MasterClass
    : 'third_party';
  const licence = String(form.get('licence') ?? '').trim();
  if ((masterClass === 'licensed' || masterClass === 'open') && !licence) {
    return fail(400, 'say what permits this track — a licence reference, or the terms it is under');
  }

  const masterTitle = String(form.get('masterTitle') ?? file.name).trim() || file.name;
  const artist = String(form.get('artist') ?? '').trim();
  const writer = String(form.get('writer') ?? '').trim();
  const title = String(form.get('title') ?? '').trim() || masterTitle;

  const id = newId('perf');
  const assetId = newId('asset');
  const extension = (file.name.split('.').pop() ?? 'mp3')
    .toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';

  await mkdir(paths.performanceAssets(id), { recursive: true });
  const originalPath = paths.performanceAsset(id, assetId, extension);
  await writeFile(originalPath, Buffer.from(await file.arrayBuffer()));

  const performance = newPerformance(title, {
    assetId: assetId as AssetId,
    title: masterTitle,
    ...(artist ? { artist } : {}),
    ...(writer ? { writer } : {}),
    class: masterClass,
    ...(licence ? { licence } : {}),
    // Counted by the worker. Zero means "not decoded yet", which is what
    // `ready` above reports.
    durationSamples: 0,
  }, new Date().toISOString());
  performance.id = id as typeof performance.id;

  await savePerformance(performance);
  await auditPerformance(id, {
    action: 'master.added',
    detail: { assetId, bytes: file.size, filename: file.name, masterClass, masterTitle },
  });

  const job = await enqueue({
    kind: 'ingest_master',
    conversationId: id,
    payload: { originalPath, assetId },
  });

  return json({ performance, job }, { status: 201 });
}
