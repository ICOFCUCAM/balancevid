/**
 * Participants.  [Doctrine ROOM §4, §9, §12]
 *
 * "Being in the room ≠ being on the main stage."
 *
 * That sentence is the whole model, and it is why presence and staging are
 * two different fields rather than one. Sarah can be connected, hearing
 * everything and preparing her answer, without appearing in the finished
 * video — and the moment the host says "Sarah, what do you think?" she is on
 * stage without anything about her connection changing.
 *
 * Collapsing the two into "is Sarah visible" would make joining and being
 * shown the same act, and there would be nowhere to stand between them.
 */

import type { Id } from './ids.js';

export type ParticipantId = Id<'part'>;

/**
 * Where someone is in relation to the conversation.  [ROOM §4]
 *
 *   invited   an invitation exists; nobody has used it yet
 *   waiting   connected, hearing everything, not in the composition
 *   staged    connected AND part of what the viewer sees
 *
 * The brief's three, and exactly three — DERIVED, never stored.
 *
 * The first attempt stored this as a field and had to invent a fourth value,
 * `left`, for someone who had gone: they are not invited, not waiting and not
 * staged, and they cannot simply be deleted because their recordings are in
 * the conversation and the finished video is made from them. A fourth value
 * in a three-value vocabulary is a sign the vocabulary is describing two
 * different things at once.
 *
 * It was. Presence is a fact about TIME — invited when, joined when, left
 * when — and staging is a decision about the COMPOSITION, which belongs to
 * the room because "who is on stage" is one fact about the picture, not a
 * flag on each person. Store those, and the brief's three states fall out of
 * them with nothing left over. Having gone is then not a state at all; it is
 * `leftAt` being set.
 *
 * This is the same discipline the conversation already keeps for order (U-08)
 * and for every representation (INV-00): store what happened, derive what
 * follows.
 */
export type ParticipantState = 'invited' | 'waiting' | 'staged';

/**
 * What someone may do.  [ROOM §3, §8]
 *
 *   host       controls the source, the stage and who may speak
 *   speaker    may be staged and recorded
 *   audience   present, may ask to speak, not recorded unless brought in
 *
 * The audience role is what makes §8 possible: twenty people in a lecture,
 * one on stage, and a hand going up. Without it, everyone who joins is
 * someone whose camera the product is deciding what to do with.
 */
export type ParticipantRole = 'host' | 'speaker' | 'audience';

export interface Participant {
  id: ParticipantId;
  /** What they are called on screen. Theirs to set, not generated. */
  displayName: string;
  role: ParticipantRole;
  /**
   * The colour that identifies them everywhere.  [U-20]
   *
   * Speaker identity is carried by more than colour in this product — shape
   * and position too — but a stable colour per person is what makes a
   * three-way conversation readable at a glance in the timeline, the
   * captions and the lower thirds.
   */
  accent: string;
  /**
   * Their own media, kept apart from everyone else's.  [ROOM §10]
   *
   * "Record each participant's media independently... The raw participant
   *  recordings remain intact." This is the field that makes it true: a
   * participant owns takes, and the composed video is made from them
   * afterwards. Nothing is mixed at record time, so who was on stage can be
   * changed later without asking anyone to say it again.
   */
  invitedAt: string;
  joinedAt?: string;
  leftAt?: string;
  /**
   * Set when they have asked for the floor and not yet been given it.
   * [ROOM §8]
   */
  handRaisedAt?: string;
}

/** Connected: in the room, whether or not the viewer can see them. */
export function inRoom(participant: Participant): boolean {
  return Boolean(participant.joinedAt) && !participant.leftAt;
}

/**
 * Was here, is not now.
 *
 * Not a state — a fact about their timestamps. They keep everything else:
 * their name, their colour and above all their takes, which the finished
 * video is made from whether or not they are still in the room.
 */
export function hasLeft(participant: Participant): boolean {
  return Boolean(participant.joinedAt) && Boolean(participant.leftAt);
}

/**
 * In the composition — what the viewer actually sees.  [ROOM §4]
 *
 * Asked of the ROOM, because who is on stage is one decision about the
 * picture rather than a flag each person carries. Two people cannot disagree
 * about whether one of them is on screen.
 */
export function onStage(participant: Participant, stagedIds: readonly string[]): boolean {
  return inRoom(participant) && stagedIds.includes(participant.id);
}

/**
 * The brief's three states, derived.  [ROOM §4]
 *
 * Someone who has left is none of the three, and says so: `undefined` rather
 * than a fourth name for a thing that is not a presence.
 */
export function presenceOf(
  participant: Participant, stagedIds: readonly string[] = [],
): ParticipantState | undefined {
  if (hasLeft(participant)) return undefined;
  if (!participant.joinedAt) return 'invited';
  return stagedIds.includes(participant.id) ? 'staged' : 'waiting';
}

/**
 * The host, who is whoever holds the role — not whoever is first in the list.
 *
 * A conversation always has exactly one, and the invariant is worth stating
 * because the stage policy falls back to them: a room whose host cannot be
 * found has nobody to return the floor to.
 */
export function hostOf(participants: Participant[]): Participant | undefined {
  return participants.find((p) => p.role === 'host');
}

/** Those the floor can be given to: present, and permitted to be seen. */
export function stageable(participants: Participant[]): Participant[] {
  return participants.filter((p) => inRoom(p) && p.role !== 'audience');
}

/** Everyone whose recordings the conversation holds, present or not. */
export function everyoneWhoSpoke(participants: Participant[]): Participant[] {
  return participants.filter((p) => Boolean(p.joinedAt));
}

/** Hands up, oldest first, because the first to ask should be the first asked. */
export function raisedHands(participants: Participant[]): Participant[] {
  return participants
    .filter((p) => inRoom(p) && p.handRaisedAt)
    .sort((a, b) => (a.handRaisedAt! < b.handRaisedAt! ? -1 : 1));
}
