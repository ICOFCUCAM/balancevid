import type { InterventionType } from '../../../../../../src/domain/document.js';
import {
  EditError, deleteIntervention, moveAnchor, setLayout, setNote, setType,
} from '../../../../../../src/domain/edit.js';
import { audit, mutateConversation } from '../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; ivnId: string }> };

/**
 * Studio Mode edits.  [Doctrine §17, §26]
 *
 * Every change lands on the Conversation and nothing else. The timeline, the
 * plan, the captions and the article are all recomputed from it (INV-00), so
 * there is no second place for an edit to be applied or forgotten.
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId } = await params;
  const body = await request.json().catch(() => ({})) as {
    type?: InterventionType;
    layoutId?: string | null;
    tSourceFrame?: number;
    note?: string | null;
  };

  try {
    const conversation = await mutateConversation(id, (draft) => {
      if (body.type !== undefined) setType(draft, ivnId, body.type);
      if (body.layoutId !== undefined) setLayout(draft, ivnId, body.layoutId);
      if (body.tSourceFrame !== undefined) moveAnchor(draft, ivnId, body.tSourceFrame);
      if (body.note !== undefined) setNote(draft, ivnId, body.note);
    });
    await audit(id, { action: 'intervention.edited', detail: { interventionId: ivnId, ...body } });
    return json({ intervention: conversation.interventions.find((i) => i.id === ivnId) });
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, error instanceof Error ? error.message : 'conversation not found');
  }
}

/** The recordings stay on disk; only the document forgets the point. [D-13] */
export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId } = await params;
  try {
    await mutateConversation(id, (draft) => deleteIntervention(draft, ivnId));
    await audit(id, { action: 'intervention.deleted', detail: { interventionId: ivnId } });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof EditError) return fail(404, error.message);
    return fail(404, 'conversation not found');
  }
}
