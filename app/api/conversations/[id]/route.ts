import { EditError, setCaptionStyle } from '../../../../src/domain/edit.js';
import { buildRenderPlan } from '../../../../src/domain/plan.js';
import { projectTimeline, sourceRatio } from '../../../../src/domain/timeline.js';
import { assertTimelineInvariants } from '../../../../src/domain/invariants.js';
import { listJobs } from '../../../../src/store/queue.js';
import { audit, loadConversation, mutateConversation } from '../../../../src/store/repository.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The document, plus the projections derived from it.
 *
 * The timeline and the plan are never stored (INV-09, D-16) -- they are
 * recomputed on every read, which is exactly what makes them impossible to
 * drift from the Conversation.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const timeline = projectTimeline(conversation);
  let invariantError: string | null = null;
  try {
    assertTimelineInvariants(conversation, timeline);
  } catch (error) {
    invariantError = error instanceof Error ? error.message : String(error);
  }

  let plan = null;
  let planError: string | null = null;
  try {
    plan = buildRenderPlan(conversation);
  } catch (error) {
    planError = error instanceof Error ? error.message : String(error);
  }

  return json({
    conversation,
    timeline,
    sourceRatio: sourceRatio(timeline),
    invariantError,
    planError,
    plan: plan ? {
      planHash: plan.planHash,
      totalOutputFrames: plan.totalOutputFrames,
      shots: plan.shots.length,
      attribution: plan.attribution,
      audio: plan.audio,
    } : null,
    jobs: await listJobs(id),
  });
}

/**
 * Decisions that belong to the whole conversation rather than to one response.
 *
 * Captions are the first: how they look is one answer about one piece of work,
 * not a different one per export. [U-19 §2]
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    captionStyleId?: string | null;
  };

  try {
    const conversation = await mutateConversation(id, (draft) => {
      if (body.captionStyleId !== undefined) setCaptionStyle(draft, body.captionStyleId);
    });
    await audit(id, { action: 'conversation.edited', detail: { ...body } });
    return json({ captionStyleId: conversation.captionStyleId ?? null });
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, 'conversation not found');
  }
}
