import type { AssetId, TakeId } from '../../../../../../../src/domain/document.js';
import { newId } from '../../../../../../../src/domain/ids.js';
import { EditError } from '../../../../../../../src/domain/edit.js';
import { audit, mutateConversation } from '../../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; ivnId: string }> };

/**
 * Re-record.  [Doctrine U-06 §1, §17]
 *
 * "An intervention holds many takes; one is selected. Re-recording appends a
 *  take and switches the selection. Takes are never deleted implicitly."
 *
 * The new take starts empty, exactly as the first one does when the key is
 * pressed: zero usable frames until the worker has assembled and measured it,
 * so the domain simply does not render it yet. The previous take stays
 * selected until this one is ready, which means a re-record that is abandoned
 * halfway costs nothing.
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId } = await params;
  const takeId = newId('take') as TakeId;

  try {
    await mutateConversation(id, (draft) => {
      const target = draft.interventions.find((i) => i.id === ivnId);
      if (!target) throw new EditError(`no such intervention: ${ivnId}`);
      target.takes.push({
        id: takeId,
        assetId: newId('asset') as AssetId,
        createdAt: new Date().toISOString(),
        durationFrames: 0,
        prerollFrames: 0,
        mediaInFrame: 0,
        mediaOutFrame: 0,
      });
    });
  } catch (error) {
    if (error instanceof EditError) return fail(404, error.message);
    return fail(404, 'conversation not found');
  }

  await audit(id, { action: 'take.opened', detail: { interventionId: ivnId, takeId } });
  return json({ interventionId: ivnId, takeId }, { status: 201 });
}
