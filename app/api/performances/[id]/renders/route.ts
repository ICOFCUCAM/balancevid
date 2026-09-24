import {
  PerformancePlanError, buildPerformancePlan,
} from '../../../../../src/domain/performancePlan.js';
import { EXPORT_PROFILES } from '../../../../../src/domain/presentation.js';
import { InvariantViolation } from '../../../../../src/domain/invariants.js';
import { mayPublish } from '../../../../../src/domain/performance.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { auditPerformance, loadPerformance } from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Every master render this performance has asked for. [STUDIO-TWO §14] */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return json({
    jobs: (await listJobs(id)).filter((job) => job.kind === 'render_performance'),
  });
}

/**
 * Make the master video.  [Doctrine STUDIO-TWO §14, S-4, INV-15, U-23]
 *
 * "Never merge the individual takes into one irreversible video until the
 *  final master render." This is that render, and it is the only place the
 *  takes stop being separate things.
 *
 * THE PLAN IS BUILT HERE, in the web tier, for the same reason a
 * Conversation's is: building it is pure and cheap, and it is where a
 * performance that cannot be exported — a gap in the song, a scene naming two
 * takes for a one-panel layout, music the author has not said they may
 * publish — is refused while they are still looking at the button. The worker
 * rebuilds the identical plan from the same document; nothing is passed
 * between them but the profile. [U-23: the web tier never invokes ffmpeg.]
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    exportProfileId?: string;
    /** A private copy of a performance over music that may not be published. */
    allowUnpublishable?: boolean;
  };

  const exportProfileId = body.exportProfileId ?? 'youtube_16x9';
  if (!EXPORT_PROFILES[exportProfileId]) {
    return fail(400, `unknown export profile: ${exportProfileId}`);
  }

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  /*
   * A private export is something the author asks for in words, not something
   * the product decides for them. Asking for one over music they DO hold is
   * harmless and is not treated as an error — the flag only ever widens what
   * INV-15 would otherwise refuse.
   */
  const allowUnpublishable = Boolean(body.allowUnpublishable);

  let plan;
  try {
    plan = buildPerformancePlan(performance, {
      exportProfileId,
      ...(allowUnpublishable ? { allowUnpublishable } : {}),
    });
  } catch (error) {
    if (error instanceof InvariantViolation) return fail(409, error.message, error.invariant);
    if (error instanceof PerformancePlanError) return fail(409, error.message);
    return fail(400, error instanceof Error ? error.message : 'could not plan this render');
  }

  const job = await enqueue({
    kind: 'render_performance',
    // The field is named for the other document. The debt is recorded on the
    // Job type: it is a migration, not a rename. [S-1]
    conversationId: id,
    payload: { exportProfileId, allowUnpublishable },
  });
  await auditPerformance(id, {
    action: 'performance.render.queued',
    detail: {
      planHash: plan.planHash, exportProfileId,
      totalOutputFrames: plan.totalOutputFrames,
      scenes: plan.shots.length,
      publishable: mayPublish(performance.master),
    },
  });

  return json({
    job, planHash: plan.planHash,
    totalOutputFrames: plan.totalOutputFrames,
    publishable: mayPublish(performance.master),
  }, { status: 202 });
}
