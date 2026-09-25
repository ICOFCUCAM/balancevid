import {
  PerformanceEditError, addTake, setEnvironment,
} from '../../../../../src/domain/performanceEdit.js';
import type { AssetId, TakeId } from '../../../../../src/domain/document.js';
import { MASTER_CLASSES } from '../../../../../src/domain/performance.js';
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
    method?: 'measured' | 'calibrated' | 'manual' | 'unplaced';
    /**
     * Footage rather than a performance.  [§2, §5, S-29]
     *
     * Waves, birds, a city at night — something to cut to, which nobody
     * performed and which is not on the song's clock.
     */
    kind?: 'performance' | 'footage';
    /** Footage only: play it again until the scene is over. */
    loop?: boolean;
    /** Footage only: whose it is. Without one it may not be published. */
    rights?: string;
    rightsNote?: string;
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
  const footage = body.kind === 'footage';
  /*
   * Footage is matted against nothing.  [§4, §5, INV-16, S-29]
   *
   * A plate is a measurement of the room a PERFORMER is standing in, so that
   * they can be cut out of it. There is nobody to cut out of a clip of the
   * sea, and handing it the room's plate would let it be given an
   * environment — a beach composited onto a beach, keyed against a
   * measurement of somebody's living room.
   */
  const plate = footage ? undefined
    : body.plateAssetId
      ? performance.plates.find((p) => p.assetId === body.plateAssetId)
      : performance.plates[performance.plates.length - 1];
  if (!footage && body.plateAssetId && !plate) return fail(400, 'no such plate');

  /*
   * The method is taken at its word.  [§10, S-3, S-29]
   *
   * It used to read "calibrated, or else measured", which turned every
   * declared `manual` into a claim that a clock had measured it — the exact
   * dishonesty §10 exists to prevent, on the one path (uploading) where
   * nothing was measured at all. An upload declares `unplaced` and looks
   * unplaced until the worker either hears the song in it or does not.
   */
  const method = body.method === 'calibrated' ? 'calibrated'
    : body.method === 'manual' ? 'manual'
      : body.method === 'unplaced' || footage ? 'unplaced'
        : 'measured';

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
        ...(footage ? {
          kind: 'footage' as const,
          /*
           * Looping unless told otherwise. Stock scenery is seconds long and
           * a chorus is not; the default that leaves a panel black two thirds
           * of the way through is not a default, it is a trap.
           */
          loop: body.loop !== false,
          ...(typeof body.rights === 'string' && MASTER_CLASSES.includes(
            body.rights as never) ? { rights: body.rights as never } : {}),
          ...(typeof body.rightsNote === 'string' && body.rightsNote.trim()
            ? { rightsNote: body.rightsNote.trim().slice(0, 300) } : {}),
          /*
           * Silent as far as this record is concerned, before a single byte
           * has arrived. The measurement that runs when the media lands says
           * whether there IS sound on it; this says it is not ours to use.
           */
          hasAudio: false,
        } : {}),
        alignment: {
          offsetSamples,
          rateRatio: 1,
          method,
          ...(Number.isFinite(body.latencySamples) && Number(body.latencySamples) > 0
            ? { latencySamples: Math.round(Number(body.latencySamples)) }
            : {}),
        },
        // Counted when the media lands. Zero means "still arriving".
        durationSamples: 0,
        createdAt: new Date().toISOString(),
      });
      if (!footage && body.environment && body.environment.kind !== 'original') {
        setEnvironment(draft, takeId, body.environment as never);
      }
    });
  } catch (error) {
    if (error instanceof PerformanceEditError) return fail(409, error.message);
    throw error;
  }

  await auditPerformance(id, {
    action: footage ? 'footage.started' : 'take.started',
    detail: { takeId, assetId, label, offsetSamples, method },
  });
  return json({ takeId, assetId, label, offsetSamples, method,
    ...(footage ? { kind: 'footage' } : {}) }, { status: 201 });
}
