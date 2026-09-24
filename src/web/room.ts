/**
 * The room, as a caller is allowed to see it.
 *
 * Shared by every route that answers about a room, and kept out of the route
 * files because Next allows them to export handlers and nothing else — but
 * also because there should be exactly one place that decides what a guest is
 * told. Two of them would eventually disagree, and the thing they would
 * disagree about is a credential.
 */
import type { Caller } from '../auth/request.js';
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

/**
 * May this caller record into this conversation?  [Doctrine ROOM §10, D-03]
 *
 * A guest records THEMSELVES, and that is the whole of it. The permission is
 * not "may write takes" but "may write takes that are theirs", which is a
 * different question and the only safe one: a take belongs to an
 * intervention, and an intervention names a participant.
 *
 * Two rules, both necessary:
 *
 *   The participant id comes from the SIGNED SESSION, never from the request.
 *   Nothing a guest sends can name somebody else.
 *
 *   They must be on stage. Being in the room is being able to hear (§4); a
 *   room where anyone may start recording into the finished video whenever
 *   they like is not one a host controls.
 */

export function mayRecord(conversation: Conversation, caller: Caller): boolean {
  if (caller.access === 'owner') return true;
  if (caller.access !== 'participant' || !caller.participantId) return false;
  const staged: readonly string[] = conversation.room?.stagedParticipantIds ?? [];
  return Boolean(conversation.room?.open) && staged.includes(caller.participantId);
}

/**
 * May this caller write to this take?
 *
 * Owner: yes. Guest: only if the take hangs off an intervention that names
 * them. A take id is guessable in principle and forwarded in practice, so
 * this is checked on every chunk rather than trusted from whoever created it.
 */
export function mayWriteTake(
  conversation: Conversation, takeId: string, caller: Caller,
): boolean {
  if (caller.access === 'owner') return true;
  if (!mayRecord(conversation, caller)) return false;
  const owning = conversation.interventions.find(
    (intervention) => intervention.takes.some((take) => take.id === takeId));
  // A take nobody owns yet is the one being created right now, by them.
  if (!owning) return false;
  return owning.participantId === caller.participantId;
}
