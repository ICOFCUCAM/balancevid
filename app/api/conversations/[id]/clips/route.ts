import { clipCandidates } from '../../../../../src/domain/clips.js';
import { listJobs, enqueue } from '../../../../../src/store/queue.js';
import { audit, loadConversation } from '../../../../../src/store/repository.js';
import { loadTranscript } from '../../../../../src/store/transcripts.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Clip candidates.  [Doctrine U-22 §4]
 *
 * "The user selects which pairs to publish. The product proposes the strongest
 *  candidates but never auto-publishes."
 *
 * Each candidate carries its reasons, so a creator can disagree with the
 * ranking rather than being told what is good.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  const transcript = await loadTranscript(id);
  return json({
    candidates: clipCandidates(conversation, transcript?.transcript ?? null),
    jobs: (await listJobs(id)).filter((job) => job.kind === 'render_clip'),
  });
}

/** Render one pair as a vertical clip. Nothing is published anywhere. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { interventionId?: string };
  if (!body.interventionId) return fail(400, 'interventionId is required');

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  const candidate = clipCandidates(conversation)
    .find((c) => c.interventionId === body.interventionId);
  if (!candidate) return fail(409, 'that point has no usable response to clip');

  const job = await enqueue({
    kind: 'render_clip',
    conversationId: id,
    payload: { interventionId: body.interventionId },
  });
  await audit(id, {
    action: 'clip.queued',
    detail: { interventionId: body.interventionId, seconds: candidate.totalFrames / 30 },
  });
  return json({ job, candidate }, { status: 202 });
}
