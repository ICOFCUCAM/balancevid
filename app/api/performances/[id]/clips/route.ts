import {
  PerformanceClipError, clipCandidates, clipWindow,
} from '../../../../../src/domain/performanceClips.js';
import {
  PerformancePlanError, buildPerformancePlan,
} from '../../../../../src/domain/performancePlan.js';
import { EXPORT_PROFILES } from '../../../../../src/domain/presentation.js';
import { InvariantViolation } from '../../../../../src/domain/invariants.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { auditPerformance, loadPerformance } from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * What is worth clipping.  [Doctrine STUDIO-TWO §14, §15, U-22]
 *
 * Candidates carry their reasons, so a creator can disagree with the ranking
 * rather than being told what is good — and the one the product chose the
 * boundaries for says so.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  return json({
    candidates: clipCandidates(performance),
    jobs: (await listJobs(id)).filter((job) => job.kind === 'render_performance_clip'),
  });
}

/** Render one stretch as a clip. Nothing is published anywhere. [U-22] */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    fromSample?: number;
    toSample?: number;
    exportProfileId?: string;
    allowUnpublishable?: boolean;
  };

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const exportProfileId = body.exportProfileId ?? 'vertical_9x16';
  if (!EXPORT_PROFILES[exportProfileId]) {
    return fail(400, `unknown export profile: ${exportProfileId}`);
  }

  try {
    const span = clipWindow(performance, Number(body.fromSample), Number(body.toSample));
    /*
     * Planned here, so a clip that cannot be made is refused while the author
     * is still looking at the button — and so the worker and the web tier are
     * proved to agree about what this clip is before anything is queued.
     */
    const plan = buildPerformancePlan(performance, {
      exportProfileId, span,
      ...(body.allowUnpublishable ? { allowUnpublishable: true } : {}),
    });

    const job = await enqueue({
      kind: 'render_performance_clip',
      conversationId: id,
      payload: {
        fromSample: span.fromSample, toSample: span.toSample, exportProfileId,
        allowUnpublishable: Boolean(body.allowUnpublishable),
      },
    });
    await auditPerformance(id, {
      action: 'performance.clip.queued',
      detail: {
        planHash: plan.planHash, exportProfileId,
        fromSample: span.fromSample, toSample: span.toSample,
      },
    });
    return json({ job, planHash: plan.planHash,
      totalOutputFrames: plan.totalOutputFrames }, { status: 202 });
  } catch (error) {
    if (error instanceof PerformanceClipError) return fail(400, error.message);
    if (error instanceof InvariantViolation) return fail(409, error.message, error.invariant);
    if (error instanceof PerformancePlanError) return fail(409, error.message);
    throw error;
  }
}
