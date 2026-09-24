/**
 * The room, as a caller is allowed to see it.
 *
 * Shared by every route that answers about a room, and kept out of the route
 * files because Next allows them to export handlers and nothing else — but
 * also because there should be exactly one place that decides what a guest is
 * told. Two of them would eventually disagree, and the thing they would
 * disagree about is a credential.
 */
import type { Conversation } from '../domain/document.js';
import { inRoom, presenceOf, raisedHands } from '../domain/participants.js';

/**
 * What the room looks like to a caller.
 *
 * The invite token is included ONLY for the host. It is the credential that
 * lets anyone in, and a participant who could read it could re-issue it to
 * people the host never invited.
 */
export function roomView(
  conversation: Conversation, owner: boolean, meId?: string,
): Record<string, unknown> {
  const room = conversation.room;
  const staged = room?.stagedParticipantIds ?? [];
  const participants = (conversation.participants ?? [])
    .filter((p) => inRoom(p) || owner)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      role: p.role,
      accent: p.accent,
      presence: presenceOf(p, staged),
      handRaisedAt: p.handRaisedAt,
      me: p.id === meId,
    }));

  return {
    open: Boolean(room?.open),
    title: conversation.title,
    sourceTitle: conversation.source.title,
    speakerMode: room?.speakerMode ?? 'automatic',
    stagedParticipantIds: staged,
    pinnedParticipantId: room?.pinnedParticipantId ?? null,
    participants,
    hands: raisedHands(conversation.participants ?? []).map((p) => p.id),
    ...(owner && room ? { inviteToken: room.inviteToken } : {}),
    ...(meId ? { meId } : {}),
  };
}

/**
 * The link, in one place, so the QR and the copy button cannot disagree.
 *
 * A square on a wall and a string in WhatsApp that differ by one character is
 * a failure nobody debugs at the time — they just find that scanning does not
 * work and use the link instead.
 */
export function joinUrl(origin: string, conversationId: string, token: string): string {
  return `${origin}/r/${conversationId}?t=${encodeURIComponent(token)}`;
}
