import { buildRenderPlan } from '../../../../../src/domain/plan.js';
import { EmptyReelError, buildReelPlan } from '../../../../../src/domain/reel.js';
import { EXPORT_PROFILES } from '../../../../../src/domain/presentation.js';
import { InvariantViolation } from '../../../../../src/domain/invariants.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { audit, loadConversation } from '../../../../../src/store/repository.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return json({
    jobs: (await listJobs(id)).filter((j) => j.kind === 'render' || j.kind === 'render_reel'),
  });
}

/**
 * Queue a render.
 *
 * The plan is built HERE, in the web tier, because building it is pure and
 * cheap -- and because that is where INV-01 rejects an impossible export while
 * the user is still looking at the button, rather than failing later in a
 * worker.
 * The worker rebuilds the same plan deterministically from the same document.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    exportProfileId?: string;
    burnInCaptions?: boolean;
    /** 'reel' is the author's own material only — the Class B export. [U-01] */
    kind?: 'full' | 'reel';
  };
  const exportProfileId = body.exportProfileId ?? 'youtube_16x9';
  if (!EXPORT_PROFILES[exportProfileId]) return fail(400, `unknown export profile: ${exportProfileId}`);

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const kind = body.kind ?? (conversation.source.class === 'B' ? 'reel' : 'full');
  let plan;
  try {
    plan = kind === 'reel'
      ? buildReelPlan(conversation, {
          exportProfileId,
          burnInCaptions: body.burnInCaptions !== false,
          accessedAt: conversation.createdAt,
        })
      : buildRenderPlan(conversation, {
          exportProfileId,
          burnInCaptions: body.burnInCaptions !== false,
          accessedAt: conversation.createdAt,
        });
  } catch (error) {
    if (error instanceof InvariantViolation) return fail(409, error.message, error.invariant);
    if (error instanceof EmptyReelError) return fail(409, error.message);
    return fail(400, error instanceof Error ? error.message : 'could not plan this render');
  }

  if (plan.totalOutputFrames === 0) return fail(409, 'nothing to render yet');

  const job = await enqueue({
    kind: kind === 'reel' ? 'render_reel' : 'render',
    conversationId: id,
    payload: { exportProfileId, burnInCaptions: body.burnInCaptions !== false, planHash: plan.planHash },
  });
  await audit(id, {
    action: 'render.queued',
    detail: { kind, planHash: plan.planHash, exportProfileId, totalOutputFrames: plan.totalOutputFrames },
  });

  return json({
    job,
    kind,
    planHash: plan.planHash,
    totalOutputFrames: plan.totalOutputFrames,
    sourceRatio: plan.sourceRatio,
  }, { status: 202 });
}
