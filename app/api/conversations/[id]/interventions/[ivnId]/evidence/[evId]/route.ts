import {
  EditError, detachEvidence, setEvidenceLocator, setEvidenceWindow,
} from '../../../../../../../../src/domain/edit.js';
import { audit, mutateConversation } from '../../../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; ivnId: string; evId: string }> };

/**
 * Point at the part that matters, and say when it is on screen.
 * [Doctrine U-33 §2, §3]
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId, evId } = await params;
  const body = await request.json().catch(() => ({})) as {
    region?: { x: number; y: number; w: number; h: number };
    quote?: string;
    page?: number;
    appearOffset?: number | null;
    dismissOffset?: number | null;
  };

  try {
    const conversation = await mutateConversation(id, (draft) => {
      if (body.region !== undefined || body.quote !== undefined || body.page !== undefined) {
        setEvidenceLocator(draft, ivnId, evId, {
          ...(body.region ? { region: body.region } : {}),
          ...(body.quote !== undefined ? { quote: body.quote } : {}),
          ...(body.page !== undefined ? { page: body.page } : {}),
        });
      }
      if (body.appearOffset !== undefined || body.dismissOffset !== undefined) {
        setEvidenceWindow(draft, ivnId, evId, {
          ...(body.appearOffset !== undefined ? { appearOffset: body.appearOffset } : {}),
          ...(body.dismissOffset !== undefined ? { dismissOffset: body.dismissOffset } : {}),
        });
      }
    });
    await audit(id, { action: 'evidence.located', detail: { evidenceId: evId, ...body } });
    return json({
      evidence: conversation.interventions
        .find((i) => i.id === ivnId)?.evidence?.find((e) => e.id === evId),
    });
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, error instanceof Error ? error.message : 'not found');
  }
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId, evId } = await params;
  try {
    await mutateConversation(id, (draft) => detachEvidence(draft, ivnId, evId));
    await audit(id, { action: 'evidence.detached', detail: { interventionId: ivnId, evidenceId: evId } });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof EditError) return fail(404, error.message);
    return fail(404, 'conversation not found');
  }
}
