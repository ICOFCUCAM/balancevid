import { audit, mutateConversation } from '../../../../../src/store/repository.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Report what only the provider's player knows.  [Doctrine U-01]
 *
 * A Class B source is never fetched, so its duration cannot be probed. The
 * embed reports it once it loads, and it is recorded once — a later, different
 * answer does not silently move every anchor in the conversation.
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    durationFrames?: number; title?: string;
  };

  const durationFrames = Number(body.durationFrames);
  if (!Number.isInteger(durationFrames) || durationFrames <= 0) {
    return fail(400, 'durationFrames must be a positive whole number of frames');
  }

  try {
    const conversation = await mutateConversation(id, (draft) => {
      if (draft.source.class !== 'B') {
        throw new Error('only an embedded source reports its duration');
      }
      if (draft.source.durationFrames > 0) return; // already known
      draft.source.durationFrames = durationFrames;
      if (body.title?.trim() && !draft.source.title.includes(draft.source.providerVideoId ?? '')) {
        return;
      }
      if (body.title?.trim()) draft.source.title = body.title.trim();
    });
    await audit(id, { action: 'source.duration_reported', detail: { durationFrames } });
    return json({ source: conversation.source });
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : 'could not record the duration');
  }
}
