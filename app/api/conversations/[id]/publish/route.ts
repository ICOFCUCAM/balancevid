import { EditError } from '../../../../../src/domain/edit.js';
import { publish, unpublish } from '../../../../../src/domain/publish.js';
import { listJobs } from '../../../../../src/store/queue.js';
import { audit, loadConversation, mutateConversation } from '../../../../../src/store/repository.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Publish, and decide whether it may be answered.  [Doctrine U-31]
 *
 * Consent is recorded here and nowhere else. It is asked at publish time
 * because it cannot be added cheaply afterwards: by then there are responses
 * that were made under an assumption nobody stated.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    respondable?: boolean; author?: string;
  };
  if (typeof body.respondable !== 'boolean') {
    return fail(400, 'say whether responses are allowed — it is not assumed either way');
  }

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  // What gets published is a render: a responder answers a finished video, not
  // a draft that may change under them.
  const render = (await listJobs(id))
    .find((job) => (job.kind === 'render' || job.kind === 'render_reel') && job.state === 'done');
  if (!render?.result?.['planHash']) {
    return fail(409, 'render the conversation first — there is nothing to publish yet');
  }

  try {
    const updated = await mutateConversation(id, (draft) => {
      publish(draft, {
        planHash: String(render.result!['planHash']),
        respondable: body.respondable!,
        ...(body.author ? { author: body.author } : {}),
        publishedAt: new Date().toISOString(),
      });
    });
    await audit(id, {
      action: 'conversation.published',
      detail: { respondable: body.respondable, planHash: render.result['planHash'] },
    });
    return json({ publication: updated.publication });
  } catch (error) {
    if (error instanceof EditError) return fail(409, error.message);
    return fail(400, error instanceof Error ? error.message : 'could not publish');
  }
}

/**
 * Withdraw it.
 *
 * Existing responses are untouched: they answered a version that existed and
 * was consented to, and silently breaking other people's work would be worse
 * than leaving it.
 */
export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  try {
    await mutateConversation(id, (draft) => unpublish(draft, new Date().toISOString()));
    await audit(id, { action: 'conversation.unpublished', detail: {} });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof EditError) return fail(409, error.message);
    return fail(404, 'conversation not found');
  }
}
