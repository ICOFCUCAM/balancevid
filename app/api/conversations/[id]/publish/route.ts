import { availabilityFrom } from '../../../../../src/domain/availability.js';
import { EditError } from '../../../../../src/domain/edit.js';
import { publish, unpublish } from '../../../../../src/domain/publish.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
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
    listed?: unknown; access?: unknown; claims?: unknown;
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
        /*
         * Who may respond, and whether it is discoverable.  [PART FIVE]
         *
         * `respondable` was the only bit here, and it was being asked to
         * carry a discovery decision and an authorization one as well as
         * its own. These are the other two, read by the same function the
         * performance route uses. [D-19]
         */
        ...(body.listed === false ? { listed: false as const } : {}),
        ...(body.respondable && availabilityFrom(body).access
          ? { access: availabilityFrom(body).access! } : {}),
        ...(availabilityFrom(body).claims !== undefined
          ? { claims: availabilityFrom(body).claims! } : {}),
        ...(body.author ? { author: body.author } : {}),
        publishedAt: new Date().toISOString(),
      });
    });
    await audit(id, {
      action: 'conversation.published',
      detail: {
        planHash: render.result['planHash'],
        ...availabilityFrom(body),
      },
    });
    /*
     * Draw what a link to this will show. [U-31, §52]
     *
     * Here rather than at export, because this is the moment the link starts
     * existing: before now nobody could fetch the card, and a conversation
     * can change between its last export and being published. Redrawn on
     * every publish, so the picture always describes what was published
     * rather than what was last rendered.
     */
    await enqueue({ kind: 'render_card', conversationId: id, payload: {} });
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
