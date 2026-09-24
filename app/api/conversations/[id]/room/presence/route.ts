import { leaveRoom, lowerHand, raiseHand } from '../../../../../../src/domain/roomEdit.js';
import { EditError } from '../../../../../../src/domain/edit.js';
import { callerFor } from '../../../../../../src/auth/request.js';
import { guestMay } from '../../../../../../src/auth/policy.js';
import { audit, loadConversation, mutateConversation } from '../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../src/web/http.js';
import { roomView } from '../../../../../../src/web/room.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * What a guest may change: themselves.  [Doctrine ROOM §4, §8, D-03]
 *
 * Raise a hand, put it down, leave. That is the whole list, and it is checked
 * against the allowlist in `policy.ts` rather than inferred from the route
 * being reachable — a route is reachable because middleware let it past, and
 * that is not the same question as whether this caller may do this thing.
 *
 * A participant may only ever act on THEMSELVES. The participant id comes
 * from the signed session, never from the request body, so there is nothing
 * to tamper with: a guest cannot lower someone else's hand or remove them.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { action?: string };

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const caller = await callerFor(request, conversation);
  if (caller.access !== 'participant' && caller.access !== 'owner') {
    return fail(404, 'conversation not found');
  }
  const me = caller.participantId;
  if (!me) return fail(409, 'you are not in this room');

  const act = body.action === 'leave' ? 'room.presence' : 'room.raise-hand';
  if (caller.access === 'participant' && !guestMay(act)) {
    return fail(403, 'you cannot do that in this room');
  }

  const now = new Date().toISOString();
  try {
    const updated = await mutateConversation(id, (draft) => {
      switch (body.action) {
        case 'raise-hand': raiseHand(draft, me, now); return;
        case 'lower-hand': lowerHand(draft, me); return;
        case 'leave': leaveRoom(draft, me, now); return;
        default: throw new EditError(`unknown action: ${body.action}`);
      }
    });
    await audit(id, { action: `room.${body.action}`, detail: { participantId: me } });
    return json(roomView(updated, false, me));
  } catch (error) {
    if (error instanceof EditError) return fail(409, error.message);
    return fail(404, 'conversation not found');
  }
}
