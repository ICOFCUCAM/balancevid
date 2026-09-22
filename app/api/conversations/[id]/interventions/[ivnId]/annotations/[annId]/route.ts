import type { Annotation } from '../../../../../../../../src/domain/document.js';
import {
  EditError, removeAnnotation, setAnnotationWindow, updateAnnotation,
} from '../../../../../../../../src/domain/edit.js';
import { audit, mutateConversation } from '../../../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; ivnId: string; annId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId, annId } = await params;
  const body = await request.json().catch(() => ({})) as
    Partial<Pick<Annotation, 'points' | 'text' | 'style' | 'z' | 'drawFrames'>>
    & { appearOffset?: number | null; dismissOffset?: number | null };

  try {
    const conversation = await mutateConversation(id, (draft) => {
      const { appearOffset, dismissOffset, ...rest } = body;
      if (Object.keys(rest).length > 0) updateAnnotation(draft, ivnId, annId, rest);
      if (appearOffset !== undefined || dismissOffset !== undefined) {
        setAnnotationWindow(draft, ivnId, annId, {
          ...(appearOffset !== undefined ? { appearOffset } : {}),
          ...(dismissOffset !== undefined ? { dismissOffset } : {}),
        });
      }
    });
    return json({
      annotation: conversation.interventions
        .find((i) => i.id === ivnId)?.annotations?.find((a) => a.id === annId),
    });
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, error instanceof Error ? error.message : 'not found');
  }
}

export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId, annId } = await params;
  try {
    await mutateConversation(id, (draft) => removeAnnotation(draft, ivnId, annId));
    await audit(id, {
      action: 'annotation.removed',
      detail: { interventionId: ivnId, annotationId: annId },
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof EditError) return fail(404, error.message);
    return fail(404, 'conversation not found');
  }
}
