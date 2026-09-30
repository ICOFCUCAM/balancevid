/**
 * Who may take part, and who may find out.
 *   [TAKE-PLATFORM P8, P10, PART FIVE; Doctrine U-31, D-03, D-25, D-19]
 *
 * THREE CONCEPTS, AND THE THIRD IS THE CORRECTION.
 *
 *   respondable  may somebody submit a Take for this?
 *   listed       should it appear in discovery?
 *   access       WHO may submit one?
 *
 * The first proposal for this was two booleans, and it was wrong in a way
 * worth writing down: `listed: false` was being asked to mean PRIVATE,
 * which it does not. An unlisted song with `access: 'anyone'` is open to
 * everybody who has the URL; an unlisted song with `access: 'invited'` is
 * open to four people. Those are different situations and a boolean cannot
 * say which. Discovery and authorization are separate questions and the
 * flags must stop carrying each other's meaning.
 *
 * NO THIRD OBJECT. `Publication` already carries `respondable` and is
 * shared by conversations and performances; `ChannelPublication` is its own
 * type because a channel publishes a SCHEDULE rather than a render. Both
 * gain the two new fields beside the bit that is already there, and this
 * module holds the rules that read them. Nothing moves, so nothing on disk
 * migrates. [D-19]
 *
 * ACCESS IS MEANINGLESS WHEN NOTHING MAY BE SUBMITTED, which the brief's
 * own table says with two em-dashes — and it is enforced here rather than
 * merely allowed, because a stored `access` on a non-respondable item is a
 * value somebody later reads as though it meant something.
 */

/** Who may submit a Take, when one may be submitted at all. */
export type TakeAccess = 'anyone' | 'members' | 'link' | 'invited';

/**
 * The four, widest first.
 *
 * ORDERED, AND THE ORDER IS THE POINT: each admits everybody the next one
 * admits and more, so "at least as open as" is a comparison rather than a
 * table of cases. A surface that must decide whether tightening a setting
 * would lock somebody out can ask.
 */
export const TAKE_ACCESS: TakeAccess[] = ['anyone', 'members', 'link', 'invited'];

/** What each one is called where somebody is choosing it. */
export const TAKE_ACCESS_LABELS: Record<TakeAccess, string> = {
  anyone: 'Anyone',
  members: 'People with an account here',
  link: 'Anyone with the link',
  invited: 'Only people I invite',
};

/**
 * What each one means, for the control that sets it.
 *
 * Written as the consequence rather than the mechanism, the way the
 * quality presets are: "only people I invite" tells a producer what will
 * happen; "requires a participation request" tells them what the code does.
 */
export const TAKE_ACCESS_MEANS: Record<TakeAccess, string> = {
  anyone: 'Anybody who finds it can record and send you a take.',
  members: 'Somebody must have an account on this installation.',
  link: 'Nobody can find it, but anybody holding the link can take part.',
  invited: 'Only the people you send an invitation to.',
};

/**
 * Whether one access policy admits everybody another does.
 *
 * `anyone` is the widest and `invited` the narrowest, so this is an index
 * comparison — but written as a function because the ORDER is the claim
 * and a caller indexing the array itself would be asserting it again.
 */
export function atLeastAsOpen(one: TakeAccess, as: TakeAccess): boolean {
  return TAKE_ACCESS.indexOf(one) <= TAKE_ACCESS.indexOf(as);
}

/**
 * What a published thing says about taking part.
 *
 * Every field is optional, because nothing on disk has them yet and a
 * document that predates this must not become invalid by sitting still.
 * The defaults are below and they are the behaviour that already exists.
 */
export interface TakeAvailability {
  respondable?: boolean;
  listed?: boolean;
  access?: TakeAccess;
}

/**
 * THE DEFAULTS PRESERVE U-31 EXACTLY.
 *
 * "A published conversation is a Class A source. Anyone can open it and
 * respond to it." An already-published respondable conversation is listed
 * — `/api/published` returns it today — and open to anyone. So an absent
 * `listed` is `true` and an absent `access` is `'anyone'`, and this change
 * alters no existing document's behaviour.
 *
 * `respondable` has no default here because it has never had one: it is
 * written by the publisher and absent means false, which is what
 * `isRespondable` already does.
 */
export const DEFAULT_LISTED = true;
export const DEFAULT_ACCESS: TakeAccess = 'anyone';

/** The access policy in force, which is only a question when one applies. */
export function accessOf(availability: TakeAvailability | undefined): TakeAccess | null {
  if (!availability?.respondable) return null;
  return availability.access ?? DEFAULT_ACCESS;
}

/**
 * Whether this should appear in a browse surface.
 *
 * NOT THE SAME QUESTION AS WHETHER IT IS PUBLISHED, and the caller supplies
 * that: an unpublished thing is not listed whatever this says, and the
 * check belongs where publication is already known. This answers only the
 * author's discovery decision.
 */
export function isListed(availability: TakeAvailability | undefined): boolean {
  return availability?.listed ?? DEFAULT_LISTED;
}

/**
 * Whether somebody standing in a particular relation may submit a Take.
 *
 * `holds` is what the caller can prove about them, and it is deliberately
 * the same vocabulary as the policy: a caller who knows the person is
 * signed in passes `'members'`, one who knows only that they followed a
 * link passes `'link'`, and one who has verified a participation request
 * passes `'invited'`. What they hold must be AT LEAST as strong as what
 * the policy asks — which is the reverse of `atLeastAsOpen`, and the one
 * place that is easy to get backwards.
 *
 * AN INVITATION SATISFIES EVERY POLICY, including `anyone`: a producer who
 * narrows a song from public to invited must not thereby refuse the people
 * they already invited.
 */
export function maySubmit(
  availability: TakeAvailability | undefined,
  holds: TakeAccess,
): boolean {
  const policy = accessOf(availability);
  if (!policy) return false;
  /* `holds` is at least as narrow as the policy demands. */
  return TAKE_ACCESS.indexOf(holds) >= TAKE_ACCESS.indexOf(policy);
}

/**
 * The state of an item, in the brief's own six rows.
 *
 * Named rather than derived at each call site, because the six cases are
 * the specification and a surface that recomputed them would be a second
 * place they could differ. [D-19]
 */
export type AvailabilityState =
  | 'unavailable'      // not respondable, not listed
  | 'browse-only'      // listed, but nothing may be submitted
  | 'open'             // respondable, listed, anyone
  | 'restricted'       // respondable, listed, narrower than anyone
  | 'unlisted'         // respondable, not listed, link holders
  | 'private';         // respondable, not listed, invited only

export function availabilityState(
  availability: TakeAvailability | undefined,
): AvailabilityState {
  const listed = isListed(availability);
  const policy = accessOf(availability);
  if (!policy) return listed ? 'browse-only' : 'unavailable';
  if (listed) return policy === 'anyone' ? 'open' : 'restricted';
  return policy === 'invited' ? 'private' : 'unlisted';
}

/** What to tell somebody looking at the setting. One sentence, no jargon. */
export function describeAvailability(
  availability: TakeAvailability | undefined,
): string {
  switch (availabilityState(availability)) {
    case 'unavailable':
      return 'Nobody can find this or take part in it.';
    case 'browse-only':
      return 'People can find this, but cannot send you a take.';
    case 'open':
      return 'Anybody who finds this can send you a take.';
    case 'restricted':
      return 'People can find this, but only some of them can take part.';
    case 'unlisted':
      return 'Nobody can find this. Anybody holding the link can take part.';
    default:
      return 'Nobody can find this. Only the people you invite can take part.';
  }
}
