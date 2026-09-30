import { mkdir, writeFile } from 'node:fs/promises';

import { newId } from '../../../../../src/domain/ids.js';
import { paths } from '../../../../../src/store/paths.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import {
  auditPerformance, loadPerformance,
} from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** The sounds on this timeline, and any still being measured. [B6h, B8] */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  return json({
    sounds: performance.sounds ?? [],
    jobs: (await listJobs(id)).filter((job) => job.kind === 'ingest_sound'),
  });
}

/** The four lanes a sound can arrive on. Anything else is an effect. */
const TRACKS = new Set(['voice', 'effect', 'ambience', 'music']);

/**
 * "Add audio."  [TIMELINE B6h, B8; U-23, U-02]
 *
 * Applause, a voice-over, rain, a second musical layer. The file is
 * written down and a job is queued, and that is ALL that happens here:
 * the web tier never invokes ffmpeg, so nothing in this route knows how
 * long the audio is. The document learns about the layer when the
 * worker has counted its samples, because a layer whose length is a
 * guess is drawn at the wrong width and planned over the wrong stretch.
 *
 * WHERE IT LANDS COMES FROM THE PLAYHEAD, not from the file. A sound
 * dropped on a timeline goes where the author was looking, which is the
 * one piece of information the upload itself cannot carry.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) return fail(400, 'that file arrived empty');

  const query = new URL(request.url).searchParams;
  const asked = query.get('track')?.trim().toLowerCase() ?? '';
  const track = TRACKS.has(asked) ? asked : 'effect';
  const label = query.get('label')?.trim().slice(0, 120) || 'Sound';
  /*
   * CLAMPED TO THE SONG HERE, because the master clock is the anchor
   * and a layer outside it has no stretch to be heard over. The domain
   * refuses one outright; refusing an upload the author already waited
   * for, over a number the studio computed, would be the wrong place
   * to be strict. [B10]
   */
  const asks = Number(query.get('fromSample') ?? 0);
  const fromSample = Math.max(0, Math.min(
    performance.master.durationSamples,
    Number.isFinite(asks) ? Math.round(asks) : 0));

  /*
   * OR IT REPLACES A STRETCH OF THE SONG.  [TIMELINE B6g]
   *
   * The same upload, measured by the same worker, put somewhere
   * else when it lands: a re-recorded bridge is not a layer over
   * the song, it IS the song over that stretch. A second route for
   * it would be a second place the ingest could be got wrong.
   *
   * The stretch is named here rather than found later, because by
   * the time the worker runs the author may have divided the song
   * again — and replacing "whatever is there now" is not what they
   * asked for.
   */
  const replaceFrom = Number(query.get('replaceFrom') ?? NaN);
  const replaceTo = Number(query.get('replaceTo') ?? NaN);
  const replacing = Number.isInteger(replaceFrom) && Number.isInteger(replaceTo)
    && replaceTo > replaceFrom;
  if (replacing && !performance.master.sections?.some(
    (one) => one.fromSample === replaceFrom && one.toSample === replaceTo)) {
    return fail(409, 'the song is not divided there any more');
  }

  const assetId = newId('asset');
  await mkdir(paths.performanceAssets(id), { recursive: true });
  const originalPath = paths.performanceAsset(id, `${assetId}orig`, 'bin');
  await writeFile(originalPath, body);

  const job = await enqueue({
    kind: 'ingest_sound',
    conversationId: id,
    payload: {
      assetId,
      originalPath,
      label,
      track,
      fromSample,
      ...(query.get('loop') === 'true' ? { loop: true } : {}),
      ...(replacing ? { replaceFrom, replaceTo } : {}),
    },
  });
  await auditPerformance(id, {
    action: replacing ? 'song.section-uploaded' : 'sound.uploaded',
    detail: {
      assetId, bytes: body.length, label, track, fromSample,
      ...(replacing ? { replaceFrom, replaceTo } : {}),
    },
  });

  return json({ job, assetId }, { status: 202 });
}
