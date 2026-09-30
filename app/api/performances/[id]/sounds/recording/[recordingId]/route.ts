import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { paths } from '../../../../../../../src/store/paths.js';
import { newId } from '../../../../../../../src/domain/ids.js';
import { enqueue } from '../../../../../../../src/store/queue.js';
import {
  auditPerformance, loadPerformance,
} from '../../../../../../../src/store/performances.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; recordingId: string }> };

/**
 * An id this route will build a path out of.  [INV-15]
 *
 * Checked against a shape rather than escaped, because escaping is a
 * judgement about a path and this is a judgement about an id: anything
 * that is not one of ours is refused before it is used for anything.
 */
const RECORDING = /^rec_[A-Za-z0-9]{1,64}$/;

/** One segment of a sound being recorded. [U-06] */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id, recordingId } = await params;
  if (!RECORDING.test(recordingId)) return fail(400, 'that is not a recording');
  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const index = Number(new URL(request.url).searchParams.get('index') ?? NaN);
  if (!Number.isInteger(index) || index < 0) return fail(400, 'bad segment number');

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, 'that segment arrived empty');
  const dir = paths.performanceChunks(id, recordingId);
  await mkdir(dir, { recursive: true });
  /* Zero-padded so a plain sort is the recording's own order, the same
     way every other set of segments in this product is named. */
  await writeFile(
    join(dir, `${String(index).padStart(6, '0')}.part`), new Uint8Array(bytes));
  return json({ ok: true, bytes: bytes.byteLength }, { status: 202 });
}

/** The four lanes a sound can arrive on. Anything else is an effect. */
const TRACKS = new Set(['voice', 'effect', 'ambience', 'music']);

/**
 * The last segment has landed: join it, measure it, place it.
 *   [TIMELINE B6i, B8; U-02, U-23]
 *
 * WHERE IT LANDS IS DECIDED HERE AND NOT AT THE START, because the
 * recorder does not know where the song was when capture began until
 * capture has begun. `MediaRecorder.start()` does not start capturing
 * at the moment it is called, and the whole of this studio's alignment
 * exists because of that — a voice-over placed at the moment the
 * button was pressed would be early by however long the device took to
 * open, which is the one error nobody can see and everybody hears.
 *
 * A voice-over defaults to the `voice` lane, which is what it is for.
 */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { id, recordingId } = await params;
  if (!RECORDING.test(recordingId)) return fail(400, 'that is not a recording');
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  /* Something has to have arrived, or the worker would be queued to
     join a directory that does not exist. */
  const dir = paths.performanceChunks(id, recordingId);
  const landed = { count: 0, bytes: 0 };
  try {
    const names = (await readdir(dir)).filter((one) => one.endsWith('.part'));
    for (const name of names) landed.bytes += (await stat(join(dir, name))).size;
    landed.count = names.length;
  } catch { /* no directory at all, which the next line answers */ }
  if (landed.count === 0) return fail(409, 'nothing was recorded');

  const body = await request.json().catch(() => ({})) as {
    label?: string; track?: string; fromSample?: number; loop?: boolean;
  };
  const asked = String(body.track ?? '').trim().toLowerCase();
  const track = TRACKS.has(asked) ? asked : 'voice';
  const label = String(body.label ?? '').trim().slice(0, 120) || 'Voice-over';
  const asks = Number(body.fromSample ?? 0);
  const fromSample = Math.max(0, Math.min(
    performance.master.durationSamples,
    Number.isFinite(asks) ? Math.round(asks) : 0));

  const assetId = newId('asset');
  const job = await enqueue({
    kind: 'ingest_sound',
    conversationId: id,
    payload: {
      assetId,
      chunkDir: dir,
      recordingId,
      label,
      track,
      fromSample,
      ...(body.loop ? { loop: true } : {}),
    },
  });
  await auditPerformance(id, {
    action: 'sound.recorded',
    detail: {
      recordingId, assetId, segments: landed.count, bytes: landed.bytes,
      label, track, fromSample,
    },
  });
  return json({ job, assetId }, { status: 202 });
}
