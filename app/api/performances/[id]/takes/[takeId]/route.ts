import { mkdir, writeFile } from 'node:fs/promises';

import { paths, safe } from '../../../../../../src/store/paths.js';
import { enqueue } from '../../../../../../src/store/queue.js';
import { auditPerformance, loadPerformance } from '../../../../../../src/store/performances.js';
import { fail, json } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; takeId: string }> };

/**
 * A segment of a performance, as it is recorded.  [U-06]
 *
 * Rolling segments, uploaded as they close, for the reason U-06 gives: a crash
 * costs one segment rather than the take. A four-minute performance is a long
 * time to hold in a browser tab and hope.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id, takeId } = await params;
  const index = Number(new URL(request.url).searchParams.get('index') ?? NaN);
  if (!Number.isInteger(index) || index < 0) return fail(400, 'a chunk index is required');

  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const dir = paths.performanceChunks(id, takeId);
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, 'an empty chunk is not a recording');

  // Zero-padded so a plain sort is the recording's own order — the same reason
  // a Conversation's chunks are named this way.
  await writeFile(
    `${dir}/${String(index).padStart(6, '0')}.part`, new Uint8Array(bytes));
  return json({ ok: true, bytes: bytes.byteLength }, { status: 202 });
}

/**
 * The take is finished. Join it, measure it, and place it on the song.
 *
 * Queued rather than done here: ffmpeg never runs in the web tier (U-23), and
 * the alignment check reads whole minutes of audio.
 */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { id, takeId } = await params;
  const body = await request.json().catch(() => ({})) as { hintSamples?: number };

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  const take = performance.takes.find((t) => t.id === safe(takeId));
  if (!take) return fail(404, 'no such take');

  const job = await enqueue({
    kind: 'assemble_performance_take',
    conversationId: id,
    payload: {
      takeId: safe(takeId),
      assetId: take.assetId,
      // The browser's own measurement, which the worker checks rather than
      // trusts. [§10, S-3]
      hintSamples: Math.max(0, Math.round(
        Number(body.hintSamples ?? take.alignment.offsetSamples))),
    },
  });
  await auditPerformance(id, { action: 'take.finished', detail: { takeId, job: job.id } });
  return json({ job }, { status: 202 });
}
