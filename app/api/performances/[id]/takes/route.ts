import { addTake } from '../../../../../src/domain/performanceEdit.js';
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
    environment?: { kind: string; spaceId?: string; assetId?: string };
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

  const offsetSamples = Math.max(0, Math.round(Number(body.offsetSamples ?? 0)));
  if (!Number.isFinite(offsetSamples)) return fail(400, 'a take needs a starting point');

  const takeId = newId('take');
  const assetId = newId('asset');
  const label = (body.label ?? '').trim() || `Take ${performance.takes.length + 1}`;

  await mutatePerformance(id, (draft) => {
    addTake(draft, {
      id: takeId as TakeId,
      assetId: assetId as AssetId,
      label,
      environment: (body.environment as never) ?? { kind: 'original' },
      alignment: {
        offsetSamples,
        rateRatio: 1,
        method: body.method === 'calibrated' ? 'calibrated' : 'measured',
      },
      // Counted when the media lands. Zero means "still arriving".
      durationSamples: 0,
      createdAt: new Date().toISOString(),
    });
  });

  await auditPerformance(id, {
    action: 'take.started', detail: { takeId, assetId, label, offsetSamples },
  });
  return json({ takeId, assetId, label, offsetSamples }, { status: 201 });
}
