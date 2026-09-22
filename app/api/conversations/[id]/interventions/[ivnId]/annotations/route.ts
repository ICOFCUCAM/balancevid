import type { Annotation, AnnotationId, AnnotationKind } from '../../../../../../../src/domain/document.js';
import { EditError, addAnnotation } from '../../../../../../../src/domain/edit.js';
import { newId } from '../../../../../../../src/domain/ids.js';
import { audit, mutateConversation } from '../../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; ivnId: string }> };

/**
 * Add a mark over the frozen frame.  [Doctrine §14, U-12]
 *
 * Vector, normalised, timed. Nothing is drawn into a media file — this only
 * writes numbers to the Conversation, and the render draws them again at
 * whatever resolution it is producing.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId } = await params;
  const body = await request.json().catch(() => ({})) as Partial<Annotation> & { kind?: AnnotationKind };

  if (!body.kind) return fail(400, 'a kind is required');
  const annotation: Annotation = {
    id: newId('ann') as AnnotationId,
    kind: body.kind,
    points: body.points ?? [],
    ...(body.text ? { text: body.text } : {}),
    style: body.style ?? {},
    z: body.z ?? Date.now() % 100000,
    ...(body.appearOffset !== undefined ? { appearOffset: body.appearOffset } : {}),
    ...(body.dismissOffset !== undefined ? { dismissOffset: body.dismissOffset } : {}),
    ...(body.drawFrames !== undefined ? { drawFrames: body.drawFrames } : {}),
  };

  try {
    await mutateConversation(id, (draft) => addAnnotation(draft, ivnId, annotation));
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, 'conversation not found');
  }
  await audit(id, {
    action: 'annotation.added',
    detail: { interventionId: ivnId, annotationId: annotation.id, kind: annotation.kind },
  });
  return json({ annotation }, { status: 201 });
}
