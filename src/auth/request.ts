/**
 * Is this request the owner's?  [Doctrine D-06]
 *
 * Middleware already turned away anything that needs a session. This is the
 * second check, for the routes middleware lets through because they MIGHT be
 * public: they still have to know whether they are talking to the owner or to
 * a stranger, because the answer decides what they will serve.
 *
 * Two checks in different layers, both of which must say yes. A single gate is
 * one refactor away from being bypassed.
 */

import type { Conversation } from '../domain/document.js';
import { AUTH, isLocked } from './config.js';
import { GUEST_COOKIE, verifyGuest, type GuestClaim } from './guest.js';
import { SESSION_COOKIE, verifySession } from './session.js';

export async function isOwner(request: Request): Promise<boolean> {
  if (isLocked()) return false;
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  return verifySession(token, AUTH.passwordHash!);
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * What a caller may do with one conversation.
 *
 * `notFound` rather than `forbidden` for an unpublished conversation a
 * stranger asked for: 403 confirms it exists, and the existence of a draft is
 * itself private (D-03). A stranger and a wrong id get the same answer.
 */
export type Access = 'owner' | 'participant' | 'public' | 'denied';

export async function accessTo(
  request: Request,
  conversation: { publication?: { unpublishedAt?: string } | undefined },
): Promise<Access> {
  if (await isOwner(request)) return 'owner';
  const publication = conversation.publication;
  return publication && !publication.unpublishedAt ? 'public' : 'denied';
}

/**
 * Who this is, in this one conversation.  [Doctrine ROOM §6, §12, D-03]
 *
 * The room's version of `accessTo`, and it needs the whole conversation
 * because a guest's credential is verified against that room's invite token.
 * Rotating the token therefore ends every guest session in the room and
 * nothing else — which is what makes "withdraw the invitation" mean
 * something to people already inside.
 */
export interface Caller {
  access: Access;
  /** Set only for a guest: which participant they signed in as. */
  participantId?: string;
}

export async function callerFor(
  request: Request, conversation: Conversation,
): Promise<Caller> {
  if (await isOwner(request)) return { access: 'owner' };

  const room = conversation.room;
  if (room?.open) {
    const claim: GuestClaim | null = await verifyGuest(
      readCookie(request.headers.get('cookie'), GUEST_COOKIE),
      conversation.id,
      room.inviteToken,
    );
    /*
     * And they must still be someone. A participant the host removed, or who
     * left, holds a signature that verifies and a place that is gone — the
     * cookie is proof of who they claimed to be, never proof that they are
     * still welcome.
     */
    if (claim) {
      const participant = (conversation.participants ?? [])
        .find((p) => p.id === claim.participantId);
      if (participant && !participant.leftAt) {
        return { access: 'participant', participantId: claim.participantId };
      }
    }
  }

  const publication = conversation.publication;
  return { access: publication && !publication.unpublishedAt ? 'public' : 'denied' };
}
