import {
  closeRoom, openRoom, rotateInvite, setPinned, setSpeakerMode, setStaged,
} from '../../../../../src/domain/roomEdit.js';
import { EditError } from '../../../../../src/domain/edit.js';
import { inRoom, presenceOf, raisedHands } from '../../../../../src/domain/participants.js';
import type { Conversation } from '../../../../../src/domain/document.js';
import { callerFor, isOwner } from '../../../../../src/auth/request.js';
import { newInviteToken } from '../../../../../src/auth/guest.js';
import { audit, loadConversation, mutateConversation } from '../../../../../src/store/repository.js';
import { fail, json } from '../../../../../src/web/http.js';
import { roomView } from '../../../../../src/web/room.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The room, as the people in it see it.  [Doctrine ROOM §1, §4, D-03]
 *
 * Readable by the host and by anyone holding a valid guest session for THIS
 * room. What comes back is who is here and what is on screen — never the
 * invite token, which is a credential and belongs only to whoever may hand it
 * out.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation: Conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const caller = await callerFor(request, conversation);
  if (caller.access !== 'owner' && caller.access !== 'participant') {
    return fail(404, 'conversation not found');
  }
  return json(roomView(conversation, caller.access === 'owner', caller.participantId));
}

/**
 * Open a room, or act in one.  [ROOM §3, §6, §8]
 *
 * Every action here is the host's. A guest changes their own presence through
 * `/room/presence` and nothing else — the asymmetry is the product's
 * position: a conversation belongs to whoever opened it.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'conversation not found');

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    hostName?: string;
    speakerMode?: 'automatic' | 'manual' | 'host' | 'conversation';
    staged?: string[];
    pinned?: string | null;
  };
  const now = new Date().toISOString();

  try {
    const conversation = await mutateConversation(id, (draft) => {
      switch (body.action) {
        case 'open':
          openRoom(draft, {
            inviteToken: newInviteToken(),
            hostName: body.hostName ?? 'Host',
            now,
            ...(body.speakerMode ? { speakerMode: body.speakerMode } : {}),
          });
          return;
        case 'close': closeRoom(draft, now); return;
        case 'rotate-invite': rotateInvite(draft, newInviteToken(), now); return;
        case 'stage': setStaged(draft, body.staged ?? []); return;
        case 'speaker-mode':
          if (!body.speakerMode) throw new EditError('a speaker mode is required');
          setSpeakerMode(draft, body.speakerMode);
          return;
        case 'pin': setPinned(draft, body.pinned ?? null); return;
        default: throw new EditError(`unknown action: ${body.action}`);
      }
    });
    await audit(id, { action: `room.${body.action}`, detail: { by: 'owner' } });
    return json(roomView(conversation, true));
  } catch (error) {
    if (error instanceof EditError) return fail(409, error.message);
    return fail(404, 'conversation not found');
  }
}
