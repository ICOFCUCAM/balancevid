import { joinRoom } from '../../../../../../src/domain/roomEdit.js';
import { EditError } from '../../../../../../src/domain/edit.js';
import { guestCookie, issueGuest } from '../../../../../../src/auth/guest.js';
import { isSecureRequest } from '../../../../../../src/auth/session.js';
import { audit, loadConversation, mutateConversation } from '../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../src/web/http.js';
import { roomView } from '../../../../../../src/web/room.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Follow the link and say who you are.  [Doctrine ROOM §6, §12, D-06]
 *
 * The one route in this product a stranger may write to, and the reason is in
 * the brief: an invitation is a link somebody sends over WhatsApp, and the
 * person receiving it has no account. So the link IS the credential, and what
 * happens here is an exchange — a capability anyone could have forwarded, for
 * a session that names one conversation and one person.
 *
 * The answer to a wrong token is the same as the answer to a wrong
 * conversation id: not found. A 403 would confirm that the room exists, and
 * whether a given conversation exists is itself private (D-03).
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    token?: string; displayName?: string;
  };

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'that conversation could not be found');
  }

  const room = conversation.room;
  /*
   * Closed, never opened, or the wrong secret: one answer for all three.
   * The comparison is length-independent so that a wrong token cannot be
   * narrowed down by how long the refusal takes.
   */
  if (!room?.open || !body.token || !constantTimeEqual(body.token, room.inviteToken)) {
    return fail(404, 'that invitation is not valid. Ask for a new link.');
  }

  const now = new Date().toISOString();
  let participantId: string;
  try {
    const updated = await mutateConversation(id, (draft) => {
      const joined = joinRoom(draft, body.displayName ?? '', now);
      participantId = joined.id;
    });
    conversation = updated;
  } catch (error) {
    if (error instanceof EditError) return fail(409, error.message);
    return fail(404, 'that conversation could not be found');
  }

  const { token, expiresAt } = await issueGuest(
    { conversationId: id, participantId: participantId! }, room.inviteToken,
  );
  await audit(id, {
    action: 'room.joined',
    detail: { participantId: participantId!, displayName: body.displayName },
  });

  return json(
    { participantId: participantId!, room: roomView(conversation, false, participantId!) },
    {
      status: 201,
      headers: {
        'set-cookie': guestCookie(token, id, expiresAt, isSecureRequest(request)),
      },
    },
  );
}

/** Length-independent, comparison-time-independent. */
function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
