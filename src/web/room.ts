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
import type { Conversation, RoomHost } from '../domain/document.js';
import { hostOf, inRoom, may, presenceOf, raisedHands } from '../domain/participants.js';

/**
 * Which participant a caller IS.  [Doctrine ROOM §1, §12]
 *
 * A guest's session names them outright. The owner's does not — it says they
 * own the conversation, which is a different fact — and the host is
 * nonetheless a participant like anybody else, by the brief's own design: "the
 * host is its first participant, not a special case beside the list."
 *
 * So the owner is the host participant, and that mapping lives here rather
 * than at each call site. It was missing, and the symptom was quiet: the host
 * saw a room in which nobody was them, so nothing addressed to them by name —
 * their own recording, their own place on the stage, their own peer
 * connections — could find them.
 */
export function meIn(
  conversation: RoomHost, caller: Caller,
): string | undefined {
  if (caller.participantId) return caller.participantId;
  if (caller.access === 'owner') return theHost(conversation);
  return undefined;
}

/** The owner's place in the list, in one expression rather than two. */
function theHost(conversation: RoomHost): string | undefined {
  return hostOf(conversation.participants ?? [])?.id;
}

/**
 * What the room looks like to a caller.
 *
 * The invite token is included ONLY for the host. It is the credential that
 * lets anyone in, and a participant who could read it could re-issue it to
 * people the host never invited.
 */
export function roomView(
  conversation: RoomHost, owner: boolean, meId?: string,
): Record<string, unknown> {
  // The host is the host participant, whether or not the route said so.
  const me = meId ?? (owner ? theHost(conversation) : undefined);
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
      me: p.id === me,
    }));

  return {
    open: Boolean(room?.open),
    /* A conversation has a title; a channel has a name. [RoomHost] */
    title: conversation.title ?? conversation.name,
    /* And only a conversation is ABOUT something. */
    sourceTitle: conversation.source?.title,
    speakerMode: room?.speakerMode ?? 'automatic',
    stagedParticipantIds: staged,
    pinnedParticipantId: room?.pinnedParticipantId ?? null,
    participants,
    hands: raisedHands(conversation.participants ?? []).map((p) => p.id),
    ...(owner && room ? { inviteToken: room.inviteToken } : {}),
    /*
     * THE TERMS GO TO THE OWNER ONLY, with the token, and for the same
     * reason: what a link admits people as is a fact about the host's
     * arrangements, and a guest reading the room does not need to know
     * that somebody else's link expires on Friday. [D-03]
     */
    ...(owner && room?.terms ? { terms: room.terms } : {}),
    ...(me ? { meId: me } : {}),
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

export function mayRecord(conversation: RoomHost, caller: Caller): boolean {
  if (caller.access === 'owner') return true;
  if (caller.access !== 'participant' || !caller.participantId) return false;
  const staged: readonly string[] = conversation.room?.stagedParticipantIds ?? [];
  if (!conversation.room?.open || !staged.includes(caller.participantId)) return false;

  /*
   * AND the owner has to have said they may.  [ROOM §3]
   *
   * A NARROWING, never a widening: everything above still has to pass, so a
   * capability cannot let somebody record into a closed room or from off
   * stage. What it adds is that being on stage is no longer the same as being
   * allowed to contribute — an audience member brought up to be seen is not
   * thereby somebody recording into the finished video.
   */
  const participant = (conversation.participants ?? [])
    .find((p) => p.id === caller.participantId);
  if (!participant || !may(participant, 'respond')) return false;
  /*
   * AND THE DEVICES THEY WOULD BE RECORDING WITH.  [MASTER-EDIT §10]
   *
   * HERE, BECAUSE THIS IS WHERE RECORDING IS ALREADY DECIDED. A camera
   * permission enforced in the browser is a button that is easy to not
   * draw and impossible to rely on; every route that accepts a guest's
   * recording asks this function, so a device withheld is withheld at the
   * only place it matters.
   *
   * EITHER, NOT BOTH: a take is a recording of a person, and somebody with
   * a microphone and no camera is somebody contributing audio, which this
   * product composes perfectly well. Requiring both would make withholding
   * a camera mean withholding a voice, which is not what the host said.
   */
  return may(participant, 'use.camera') || may(participant, 'use.microphone');
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
