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
 *   editor     may change the composition, and is not in it
 *
 * The audience role is what makes §8 possible: twenty people in a lecture,
 * one on stage, and a hand going up. Without it, everyone who joins is
 * someone whose camera the product is deciding what to do with.
 *
 * EDITOR IS THE ONE THAT IS NOT ABOUT THE ROOM. The other three describe
 * where somebody stands in a live discussion. An editor may never be in a
 * room at all: a producer cutting a lecture afterwards, a colleague fixing
 * the captions. They are a participant because the conversation records who
 * did what to it, and they are never staged because they are not a voice.
 *
 * The vocabulary a person is offered when inviting — respondent, co-host,
 * guest, editor — maps onto these rather than doubling them: a respondent and
 * a guest are both `speaker` (the difference is how long the invitation
 * lasts, which is a property of the invitation), a co-host is `host`, and an
 * editor is `editor`. Two names for one permission is how two permissions
 * quietly diverge.
 */
export type ParticipantRole = 'host' | 'speaker' | 'audience' | 'editor';

/**
 * Who may appear in the finished video.
 *
 * Asked rather than assumed from the role list, so adding a role forces the
 * question. An editor is a participant whose contribution is not a picture.
 */
export function mayBeStaged(role: ParticipantRole): boolean {
  return role === 'host' || role === 'speaker';
}

export interface Participant {
  id: ParticipantId;
  /** What they are called on screen. Theirs to set, not generated. */
  displayName: string;
  role: ParticipantRole;
  /**
   * A picture of them, where they have one.
   *
   * A URL rather than bytes: this is shown beside a name in a rail and in a
   * participant list, and it is not part of the composition. Nothing in the
   * render reads it — a face in the finished video is a take, not an avatar,
   * which is the distinction that keeps a still image from ever standing in
   * for somebody having spoken. [INV-00]
   */
  avatarUrl?: string;
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
  /**
   * What the owner has said this person may do, where it differs from what
   * their role comes with.  [ROOM §3, D-03]
   *
   * Sparse on purpose: absent means "whatever the role says", so changing a
   * role default later changes it for everyone who never had it overridden.
   */
  grants?: CapabilityGrants;
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
  // `mayBeStaged` rather than "not audience": an editor is also not audience
  // and is also not a picture, and the second role to be added would have
  // been staged by a test that only knew about the first one.
  return participants.filter((p) => inRoom(p) && mayBeStaged(p.role));
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

/* ------------------------------------------------------------------------ *
 *  What each person may do to the conversation.  [ROOM §3, §8, D-03]
 * ------------------------------------------------------------------------ */

/**
 * The five capabilities, and why they are five rather than one.
 *
 * "A multi-person conversation shouldn't automatically give everyone control
 *  over the finished product."
 *
 * That sentence is the whole model. The room's roles answer "where do you
 * stand in this discussion"; these answer "what may you do to the thing we
 * are making", and they are not the same question — a co-host who runs the
 * live session is not thereby somebody who may publish it.
 *
 *   respond            record responses into this conversation
 *   edit.own           trim or re-record their OWN material
 *   edit.conversation  change ordering, composition, anyone's material
 *   invite             add participants
 *   publish            make the finished conversation public
 *
 * `edit.own` and `edit.conversation` are separate because the first is a
 * person tidying what they said and the second is authority over what
 * everyone said. Collapsing them would mean that letting somebody fix their
 * own stumble lets them re-cut the argument.
 */
export type Capability =
  | 'respond'
  | 'edit.own'
  | 'edit.conversation'
  | 'invite'
  | 'publish';

export const CAPABILITIES: readonly Capability[] = [
  'respond', 'edit.own', 'edit.conversation', 'invite', 'publish',
] as const;

/**
 * What a role comes with, before anybody grants anything.
 *
 * PUBLISH IS IN NOBODY'S DEFAULTS BUT THE HOST'S, and that is the point of
 * the table rather than an omission. Publishing is the one act that cannot be
 * taken back — the link is out — and a co-host is somebody trusted to run a
 * discussion, which is a different kind of trust. It is grantable, and it is
 * granted deliberately or not at all.
 *
 * Likewise `edit.conversation` for a speaker: somebody invited to answer is
 * not thereby somebody who may re-order the argument they are answering in.
 */
const ROLE_DEFAULTS: Record<ParticipantRole, readonly Capability[]> = {
  host: ['respond', 'edit.own', 'edit.conversation', 'invite', 'publish'],
  speaker: ['respond', 'edit.own'],
  // Present, may ask for the floor, contributes nothing until brought in.
  audience: [],
  // Not a voice: an editor shapes the conversation and never appears in it,
  // so they have no own material to edit and nothing to say.
  editor: ['edit.conversation'],
};

/**
 * Capabilities as granted or withheld for one person, where the owner has
 * said something other than the default.
 *
 * Stored SPARSELY — only what differs — for the same reason an opening is
 * (U-22 §2): an object listing every capability at its default reads as five
 * decisions somebody made, and the next person to change a default would
 * silently not change it for anyone already invited.
 */
export type CapabilityGrants = Partial<Record<Capability, boolean>>;

/**
 * May this participant do this?
 *
 * THE HOST IS NOT CHECKED AGAINST A TABLE. Whoever opened the conversation
 * owns it; a grants object that could withhold `publish` from them would be a
 * way to lock somebody out of their own work.
 */
export function may(participant: Participant, capability: Capability): boolean {
  if (participant.role === 'host') return true;
  const granted = participant.grants?.[capability];
  if (granted !== undefined) return granted;
  return ROLE_DEFAULTS[participant.role].includes(capability);
}

/** Everything this participant may do, for a permissions panel to show. */
export function capabilitiesOf(participant: Participant): Capability[] {
  return CAPABILITIES.filter((capability) => may(participant, capability));
}

/**
 * The defaults a role carries, so a panel can say "granted" rather than
 * "granted, and it was already".
 */
export function defaultsFor(role: ParticipantRole): readonly Capability[] {
  return ROLE_DEFAULTS[role];
}
