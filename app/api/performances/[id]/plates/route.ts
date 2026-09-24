import { mkdir, writeFile } from 'node:fs/promises';

import { newId } from '../../../../../src/domain/ids.js';
import { paths } from '../../../../../src/store/paths.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { auditPerformance, loadPerformance } from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** The rooms this performance has been measured in. [STUDIO-TWO §4, S-6] */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  return json({
    plates: performance.plates,
    jobs: (await listJobs(id)).filter((job) => job.kind === 'ingest_plate'),
  });
}

/**
 * Three seconds of the empty room.  [Doctrine STUDIO-TWO §4, S-6, INV-16]
 *
 * The author steps out of shot and presses a button; this is what arrives.
 * Nothing is measured here — the web tier never invokes ffmpeg (U-23) — so
 * the clip is written down and a job is queued to average it into a still and
 * measure how much the room moves on its own.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) return fail(400, 'that plate arrived empty');

  const assetId = newId('asset');
  await mkdir(paths.performanceAssets(id), { recursive: true });
  const clipPath = paths.performanceAsset(id, `${assetId}plate`, 'webm');
  await writeFile(clipPath, body);

  const label = new URL(request.url).searchParams.get('label')?.trim();
  const job = await enqueue({
    kind: 'ingest_plate',
    conversationId: id,
    payload: { assetId, clipPath, ...(label ? { label } : {}) },
  });
  await auditPerformance(id, {
    action: 'plate.recorded', detail: { assetId, bytes: body.length },
  });

  return json({ job, assetId }, { status: 202 });
}
