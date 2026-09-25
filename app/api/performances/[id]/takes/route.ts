import {
  PerformanceEditError, addTake, setEnvironment,
} from '../../../../../src/domain/performanceEdit.js';
import type { AssetId, TakeId } from '../../../../../src/domain/document.js';
import { newId } from '../../../../../src/domain/ids.js';
import {
  auditPerformance, loadPerformance, mutatePerformance,
} from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * A take begins.  [Doctrine STUDIO-TWO §1, §10, U-06]
 *
 * The document learns about the recording BEFORE the media exists, exactly as
 * a Conversation's take does: a browser that crashes mid-song has still left
 * evidence that somebody was recording, and chunks arriving for a take nobody
 * declared would have nowhere to go.
 *
 * The offset is provisional. It is what the browser measured from its own
 * audio clock, and the worker checks it against the master once the media
 * lands — see §10 and S-3 for why that check is necessary and why it cannot
 * always succeed.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    label?: string;
    offsetSamples?: number;
    method?: 'measured' | 'calibrated' | 'manual';
    /** What the browser measured this device to add. [§10, S-3] */
    latencySamples?: number;
    environment?: { kind: string; spaceId?: string; assetId?: string };
    /** Which room this is being recorded in. Defaults to the latest measured. */
    plateAssetId?: string;
  };

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  if (performance.master.durationSamples <= 0) {
    return fail(409, 'the song is still being prepared — give it a moment');
  }

  /*
   * NOT clamped at zero. A take whose device delay was measured begins just
   * before the song, and rounding that up to zero is how a calibration gets
   * quietly discarded — which is exactly what this used to do. [§10, S-3]
   */
  const offsetSamples = Math.round(Number(body.offsetSamples ?? 0));
  if (!Number.isFinite(offsetSamples)) return fail(400, 'a take needs a starting point');

  const takeId = newId('take');
  const assetId = newId('asset');
  const label = (body.label ?? '').trim() || `Take ${performance.takes.length + 1}`;

  /*
   * The room this take is being shot in. The newest plate unless the author
   * says otherwise, because plates are recorded in order and the latest one
   * is the light they are standing in now. [§4, S-6]
   */
  const plate = body.plateAssetId
    ? performance.plates.find((p) => p.assetId === body.plateAssetId)
    : performance.plates[performance.plates.length - 1];
  if (body.plateAssetId && !plate) return fail(400, 'no such plate');

  try {
    await mutatePerformance(id, (draft) => {
      addTake(draft, {
        id: takeId as TakeId,
        assetId: assetId as AssetId,
        label,
        // Set below, through the one door that knows INV-16. A take that
        // began with an environment it cannot support would be a document
        // that was briefly invalid, which is a document that can be saved.
        environment: { kind: 'original' },
        ...(plate ? { plateAssetId: plate.assetId } : {}),
        alignment: {
          offsetSamples,
          rateRatio: 1,
          method: body.method === 'calibrated' ? 'calibrated' : 'measured',
          ...(Number.isFinite(body.latencySamples) && Number(body.latencySamples) > 0
            ? { latencySamples: Math.round(Number(body.latencySamples)) }
            : {}),
        },
        // Counted when the media lands. Zero means "still arriving".
        durationSamples: 0,
        createdAt: new Date().toISOString(),
      });
      if (body.environment && body.environment.kind !== 'original') {
        setEnvironment(draft, takeId, body.environment as never);
      }
    });
  } catch (error) {
    if (error instanceof PerformanceEditError) return fail(409, error.message);
    throw error;
  }

  await auditPerformance(id, {
    action: 'take.started', detail: { takeId, assetId, label, offsetSamples },
  });
  return json({ takeId, assetId, label, offsetSamples }, { status: 201 });
}
