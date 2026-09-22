import {
  EditError, deleteTake, resetTrim, selectTake, trimTake,
} from '../../../../../../../../src/domain/edit.js';
import { audit, mutateConversation } from '../../../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; ivnId: string; takeId: string }> };

/**
 * Trim, audition, restore.  [Doctrine §17, U-06]
 *
 * Trimming moves markers. The media is never cut, so the pre-roll — the words
 * said before the user decided to speak — stays recoverable however far in the
 * markers are moved (U-04 §3).
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId, takeId } = await params;
  const body = await request.json().catch(() => ({})) as {
    mediaInFrame?: number;
    mediaOutFrame?: number;
    select?: boolean;
    reset?: boolean;
  };

  try {
    const conversation = await mutateConversation(id, (draft) => {
      if (body.reset) resetTrim(draft, ivnId, takeId);
      if (body.mediaInFrame !== undefined || body.mediaOutFrame !== undefined) {
        trimTake(draft, ivnId, takeId, {
          ...(body.mediaInFrame !== undefined ? { mediaInFrame: body.mediaInFrame } : {}),
          ...(body.mediaOutFrame !== undefined ? { mediaOutFrame: body.mediaOutFrame } : {}),
        });
      }
      if (body.select) selectTake(draft, ivnId, takeId);
    });
    await audit(id, { action: 'take.edited', detail: { interventionId: ivnId, takeId, ...body } });
    return json({ intervention: conversation.interventions.find((i) => i.id === ivnId) });
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, error instanceof Error ? error.message : 'conversation not found');
  }
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId, takeId } = await params;
  try {
    await mutateConversation(id, (draft) => deleteTake(draft, ivnId, takeId));
    await audit(id, { action: 'take.deleted', detail: { interventionId: ivnId, takeId } });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, 'conversation not found');
  }
}
