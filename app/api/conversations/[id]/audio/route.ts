import { listeningCost } from '../../../../../src/domain/audioExport.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { audit, loadConversation } from '../../../../../src/store/repository.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The conversation, to listen to.  [Doctrine U-22, INV-00]
 *
 * Owner-only, like every other export: the finished file is served from the
 * render it was taken from, which is where the publication rules already live.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  return json({
    /*
     * What listening costs this conversation, measured rather than guessed:
     * a response that marks the frame or shows a document is a response whose
     * subject does not survive being heard. Said before anybody publishes a
     * podcast in which a third of their argument points at a picture.
     */
    listening: listeningCost(conversation),
    jobs: (await listJobs(id)).filter((job) => job.kind === 'render_audio'),
  });
}

/** Take the audio from a finished render. Nothing is composed a second time. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { planHash?: string };

  try {
    await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const renders = (await listJobs(id)).filter((job) =>
    (job.kind === 'render' || job.kind === 'render_reel') && job.state === 'done');
  /*
   * The render the author asked for, or the most recent one — `listJobs`
   * returns newest first, which is a thing this codebase has already been
   * caught assuming the other way round.
   */
  const render = body.planHash
    ? renders.find((job) => job.result?.['planHash'] === body.planHash)
    : renders[0];
  if (!render?.result?.['planHash']) {
    return fail(409, body.planHash
      ? 'that video has not been rendered'
      : 'render the conversation first — the audio is taken from the video');
  }

  const planHash = String(render.result['planHash']);
  const job = await enqueue({ kind: 'render_audio', conversationId: id, payload: { planHash } });
  await audit(id, { action: 'audio.queued', detail: { planHash } });
  return json({ job, planHash }, { status: 202 });
}
