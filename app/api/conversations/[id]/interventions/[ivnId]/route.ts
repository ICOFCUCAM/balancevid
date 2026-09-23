import type { InterventionType } from '../../../../../../src/domain/document.js';
import {
  EditError, deleteIntervention, moveAnchor, setLayout, setNote, setType,
} from '../../../../../../src/domain/edit.js';
import { rm } from 'node:fs/promises';
import { paths } from '../../../../../../src/store/paths.js';
import { audit, loadConversation, mutateConversation } from '../../../../../../src/store/repository.js';
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

  const before = await loadConversation(id).catch(() => null);
  const movedFrom = before?.interventions.find((i) => i.id === ivnId)?.anchor.tSourceFrame;

  try {
    const conversation = await mutateConversation(id, (draft) => {
      if (body.type !== undefined) setType(draft, ivnId, body.type);
      if (body.layoutId !== undefined) setLayout(draft, ivnId, body.layoutId);
      if (body.tSourceFrame !== undefined) moveAnchor(draft, ivnId, body.tSourceFrame);
      if (body.note !== undefined) setNote(draft, ivnId, body.note);
    });
    /*
     * A thumbnail of "the moment you stopped at" is wrong the instant the
     * anchor moves, and it is stored under a name that does not change — so
     * a stale file would be served as a current one. Removing it is enough:
     * the next export regenerates the set (U-30), and until then the bundle
     * simply reports one fewer candidate rather than a misleading picture.
     */
    const movedTo = conversation.interventions.find((i) => i.id === ivnId)?.anchor.tSourceFrame;
    if (movedFrom !== undefined && movedTo !== undefined && movedFrom !== movedTo) {
      for (const stale of [`frame_${ivnId}`, `quote_${ivnId}`]) {
        await rm(paths.thumbnail(id, stale), { force: true }).catch(() => undefined);
      }
    }

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
