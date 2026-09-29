import {
  closeRoom, openRoom, rotateInvite, setGrant, setInviteTerms, setPinned,
  setSpeakerMode, setStaged,
} from '../../../../../src/domain/roomEdit.js';
import { EditError } from '../../../../../src/domain/edit.js';
import { inRoom, presenceOf, raisedHands } from '../../../../../src/domain/participants.js';
import type { RoomHost } from '../../../../../src/domain/document.js';
import { callerFor, isOwner } from '../../../../../src/auth/request.js';
import { newInviteToken } from '../../../../../src/auth/guest.js';
import { audit } from '../../../../../src/store/repository.js';
import { loadRoomHost, mutateRoomHost } from '../../../../../src/store/rooms.js';
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
  let conversation: RoomHost;
  try {
    conversation = await loadRoomHost(id);
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
    /* The terms on the door. Each field absent means "leave it alone" and
       null means "take it off". [MASTER-EDIT §10] */
    participantId?: string;
    capability?: string;
    granted?: boolean | null;
    terms?: {
      as?: 'speaker' | 'audience' | 'editor' | null;
      expiresAt?: string | null;
      grants?: Record<string, boolean> | null;
    };
  };
  const now = new Date().toISOString();

  try {
    const conversation = await mutateRoomHost(id, (draft) => {
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
        /*
         * WHO THE LINK ADMITS, WITH WHAT, UNTIL WHEN. Not a revocation:
         * tightening an invitation must not break the one already sent,
         * so the token is untouched and `rotate-invite` stays the way to
         * withdraw a link. [MASTER-EDIT §10]
         */
        /* One person's camera, after they are already in. [§10] */
        case 'grant':
          if (!body.participantId || !body.capability) {
            throw new EditError('a person and a permission are required');
          }
          setGrant(draft, body.participantId, body.capability as never,
            body.granted ?? null);
          return;
        case 'invite-terms':
          if (!body.terms) throw new EditError('no terms were given');
          setInviteTerms(draft, body.terms);
          return;
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
