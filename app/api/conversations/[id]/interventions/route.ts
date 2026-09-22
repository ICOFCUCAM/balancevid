import {
  INTERVENTION_TYPES, type Intervention, type InterventionId,
  type InterventionType, type TakeId,
} from '../../../../../src/domain/document.js';
import { newId, quoteHash } from '../../../../../src/domain/ids.js';
import { assertFrames } from '../../../../../src/domain/time.js';
import { audit, mutateConversation } from '../../../../../src/store/repository.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Open an intervention. Called the instant the key is pressed.
 *
 * The take is created empty: it has no usable frames until the worker has
 * assembled and measured it, so the domain simply does not render it yet. No
 * "pending" flag is needed -- an empty take is already unrenderable.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json() as {
    tSourceFrame?: number;
    type?: string;
    quote?: string;
    note?: string;
  };

  const tSourceFrame = Number(body.tSourceFrame);
  try {
    assertFrames(tSourceFrame);
  } catch {
    return fail(400, 'tSourceFrame must be a non-negative integer frame index');
  }

  const type = (body.type ?? 'critique') as InterventionType;
  if (!INTERVENTION_TYPES.includes(type)) return fail(400, `unknown intervention type: ${type}`);

  const interventionId = newId('ivn') as InterventionId;
  const takeId = newId('take') as TakeId;
  const quote = body.quote?.trim();

  const intervention: Intervention = {
    id: interventionId,
    anchor: {
      tSourceFrame,
      // The claim is bound to its hash the moment it is captured, so it cannot
      // later drift from what was actually said (INV-05, U-10).
      ...(quote ? { quote, quoteHash: quoteHash(quote) } : {}),
    },
    type,
    takes: [{
      id: takeId,
      assetId: newId('asset'),
      createdAt: new Date().toISOString(),
      durationFrames: 0,
      prerollFrames: 0,
      mediaInFrame: 0,
      mediaOutFrame: 0,
    }],
    selectedTakeId: takeId,
    ...(body.note ? { note: body.note } : {}),
    createdAt: new Date().toISOString(),
  };

  try {
    await mutateConversation(id, (conversation) => {
      conversation.interventions.push(intervention);
    });
  } catch (error) {
    return fail(404, error instanceof Error ? error.message : 'conversation not found');
  }

  await audit(id, {
    action: 'intervention.opened',
    detail: { interventionId, takeId, tSourceFrame, type },
  });
  return json({ interventionId, takeId }, { status: 201 });
}

/** Delete an intervention. Takes are kept on disk; only the document changes. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const interventionId = new URL(request.url).searchParams.get('interventionId');
  if (!interventionId) return fail(400, 'interventionId is required');
  await mutateConversation(id, (conversation) => {
    conversation.interventions = conversation.interventions.filter((i) => i.id !== interventionId);
  });
  await audit(id, { action: 'intervention.deleted', detail: { interventionId } });
  return json({ ok: true });
}
