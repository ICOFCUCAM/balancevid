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
  /**
   * How many strangers may claim this. See `claimsAllowed`.
   *
   * Only meaningful where `access` is `anyone`: every other policy
   * means the producer hands out the invitations, and a ceiling on a
   * door nobody can open by themselves is a number that does nothing.
   */
  claims?: number;
  /**
   * WHEN THE DOOR OPENS AND WHEN IT SHUTS.  [GO-VIRAL V-1]
   *
   * A CEILING WAS THE ONLY BOUND AND IT IS THE WRONG KIND. `claims`
   * says how many; nothing said *until when*. A song opened to
   * `anyone` stayed open until somebody unticked it or the hundredth
   * stranger arrived — so there was no closing time, which means no
   * moment at which a call can be judged, no countdown to show, and
   * no way to say *ending soon* about anything.
   *
   * NOT `expiresAt`, AND THE DIFFERENCE IS WHO IT IS ABOUT.
   * `ParticipationRequest.expiresAt` is one person's link running
   * out — forty invitations are forty deadlines. This is the CALL's
   * own clock, and a call has one. Both exist, neither replaces the
   * other, and the request machine is not touched. [D-19]
   *
   * BOTH OPTIONAL, AND ABSENT IS WHAT EVERY ITEM ON DISK ALREADY
   * MEANS: no `opensAt` is *open since always*, no `closesAt` is
   * *never closes*. An item with neither behaves exactly as it did
   * before this field existed.
   */
  opensAt?: string;
  closesAt?: string;
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

/* ------------------------------------------------------------------ *
 *  The call's own clock.  [GO-VIRAL V-1]
 * ------------------------------------------------------------------ */

/**
 * An instant, or nothing.
 *
 * ONE PARSER, READ AND WRITE. The predicates below and
 * `availabilityFrom` must agree about what a date is, or a
 * producer sets a closing time the door never reads.
 */
function instant(said: unknown): number | null {
  /*
   * NO `!said.trim()` BESIDE THE TYPE CHECK. It was there and
   * mutation could not kill it: `Date.parse('')` and
   * `Date.parse('   ')` are both `NaN`, so the line below already
   * answers for an empty string. A clause that cannot change an
   * answer is a clause nobody can check. [C-49]
   */
  if (typeof said !== 'string') return null;
  const at = Date.parse(said);
  return Number.isFinite(at) ? at : null;
}

/**
 * Whether the call is inside its own window.
 *
 * AN UNREADABLE DATE IS AN OPEN DOOR, which is `isOpen`'s
 * decision on `expiresAt` and is taken here for the reason it
 * gives: *"a corrupt expiry that locked somebody out
 * mid-recording is a worse failure than a link that outlives its
 * terms"*, and there is a revocation that always works —
 * unticking it, or unpublishing. A date that cannot be read is
 * not a deadline anybody set; it is a damaged record, and the
 * answer to a damaged record is not to lock the room.
 *
 * WHAT IS REFUSED INSTEAD IS WRITING ONE. `whenProblem` below is
 * what a producer meets, at the moment they set it, where the
 * thing that is wrong is still in front of them.
 *
 * CLOSED AT THE MINUTE IT SAYS, not after it: `closesAt` is the
 * first instant at which nothing more is accepted, so a call
 * that shuts at noon does not take a take stamped noon.
 */
export function isOpenAt(
  availability: TakeAvailability | undefined, now: string,
): boolean {
  const at = instant(now);
  /* No clock to check against is no reason to shut the door. */
  if (at === null) return true;
  const opens = instant(availability?.opensAt);
  const closes = instant(availability?.closesAt);
  if (opens !== null && at < opens) return false;
  if (closes !== null && at >= closes) return false;
  return true;
}

/** Whether this call has a closing time that has not come yet. */
export function closesWhen(
  availability: TakeAvailability | undefined,
): number | null {
  return instant(availability?.closesAt);
}

/**
 * What is wrong with the window somebody is setting, or nothing.
 *
 * REFUSED AT THE WRITE AND FORGIVEN AT THE READ, which is not
 * two minds about the same question. A date that will not parse
 * in a request body is a producer about to be surprised, and
 * they are here to be told; the same date found on disk a month
 * later is a damaged record, and refusing to serve a
 * performance because of it helps nobody. [U-19]
 */
export function whenProblem(body: {
  opensAt?: unknown; closesAt?: unknown;
}): string {
  const said = (one: unknown) => one !== undefined && one !== null && one !== '';
  if (said(body.opensAt) && instant(body.opensAt) === null) {
    return 'that is not a date to open at';
  }
  if (said(body.closesAt) && instant(body.closesAt) === null) {
    return 'that is not a date to close at';
  }
  const opens = instant(body.opensAt);
  const closes = instant(body.closesAt);
  /*
   * A WINDOW THAT IS ALREADY SHUT IS NOT A WINDOW. Setting a
   * closing time before the opening one is a typo every time,
   * and the item it would produce is one nobody can ever take
   * part in — which the surface would then have to explain.
   */
  if (opens !== null && closes !== null && closes <= opens) {
    return 'it cannot close before it opens';
  }
  return '';
}

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
  now: string,
): boolean {
  const policy = accessOf(availability);
  if (!policy) return false;
  /*
   * AND THE CALL'S OWN CLOCK, WHICH IS A SEPARATE QUESTION FROM
   * WHO. [V-1] `now` is required rather than defaulted, so every
   * caller is counted: a permission check with an optional clock
   * is a permission check somebody forgets to wind, and the
   * compiler is the only reviewer that reads every call site.
   *
   * THE INVITED PATH DOES NOT COME THROUGH HERE. A person
   * holding a participation request is admitted by
   * `requestForLink` and `isOpen`, against their own
   * `expiresAt`; this predicate is what a stranger meets.
   */
  if (!isOpenAt(availability, now)) return false;
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
  | 'scheduled'        // respondable, but not yet [V-1]
  | 'closed'           // respondable, and no longer [V-1]
  | 'open'             // respondable, listed, anyone
  | 'restricted'       // respondable, listed, narrower than anyone
  | 'unlisted'         // respondable, not listed, link holders
  | 'private';         // respondable, not listed, invited only

/**
 * EIGHT ROWS NOW, AND THE TWO NEW ONES COME FIRST once there is
 * anything to submit.  [V-1]
 *
 * *Who may take part* is a different question from *may anybody
 * yet*, and the second one is answered first: an item open to
 * `anyone` next Tuesday is not `open`, it is `scheduled`, and a
 * surface that drew it as open would be inviting people to press
 * a button that refuses them.
 *
 * STILL LISTED EITHER WAY. Discovery is not the clock — a call
 * nobody can find before it opens is a call nobody enters when
 * it does, and *ending soon* is a thing to show rather than a
 * thing to hide. `isListed` is untouched. [TAKE-PLATFORM PART FIVE]
 */
export function availabilityState(
  availability: TakeAvailability | undefined,
  now: string,
): AvailabilityState {
  const listed = isListed(availability);
  const policy = accessOf(availability);
  if (!policy) return listed ? 'browse-only' : 'unavailable';
  if (!isOpenAt(availability, now)) {
    const opens = instant(availability?.opensAt);
    const at = instant(now);
    return opens !== null && at !== null && at < opens ? 'scheduled' : 'closed';
  }
  if (listed) return policy === 'anyone' ? 'open' : 'restricted';
  return policy === 'invited' ? 'private' : 'unlisted';
}

/** What to tell somebody looking at the setting. One sentence, no jargon. */
export function describeAvailability(
  availability: TakeAvailability | undefined,
  now: string,
): string {
  switch (availabilityState(availability, now)) {
    case 'unavailable':
      return 'Nobody can find this or take part in it.';
    case 'browse-only':
      return 'People can find this, but cannot send you a take.';
    case 'scheduled':
      return 'People can find this. It opens for takes later.';
    case 'closed':
      return 'This has closed. Nobody can send you a take now.';
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

/**
 * What a publish request said about availability, made safe.
 *
 * ONE READER FOR TWO ROUTES, because a conversation and a performance are
 * published by different code and mean exactly the same thing by these
 * three fields. Two copies of this would be two ideas of what an unknown
 * access word does. [D-19]
 *
 * AN UNKNOWN POLICY IS THE NARROWEST ONE, and that is the opposite of how
 * `qualityFor` resolves a word it does not know. The reason is what is at
 * stake: a stale preset falls back to a picture nobody minded, and a stale
 * ACCESS POLICY falling back to `anyone` would publish somebody's song to
 * the world because a field was misspelled. When the meaning is
 * permission, the safe direction is closed.
 */
export function availabilityFrom(body: {
  respondable?: unknown; listed?: unknown; access?: unknown; claims?: unknown;
  opensAt?: unknown; closesAt?: unknown;
}): TakeAvailability {
  const respondable = body.respondable === true;
  const asked = typeof body.access === 'string' ? body.access : undefined;
  const known = TAKE_ACCESS.find((one) => one === asked);
  const access = known ?? (asked ? 'invited' : DEFAULT_ACCESS);
  /*
   * A CEILING ONLY WHERE STRANGERS CAN COME THROUGH, and never a value
   * that is not a count: a negative or fractional ceiling read later as
   * a bound is a bound that does not hold.
   */
  const claims = Number.isInteger(body.claims) && (body.claims as number) >= 0
    ? body.claims as number : undefined;
  /*
   * THE WINDOW, NORMALISED, AND ONLY WHEN IT IS ONE.  [V-1]
   *
   * Stored as the instant rather than as whatever the client
   * typed, so two producers in two time zones write the same
   * record and the predicates above compare like with like.
   *
   * ONLY WHERE SOMETHING MAY BE SUBMITTED, for the reason
   * `access` is: a closing time on an item nothing can be sent
   * to is a value somebody later reads as though it meant
   * something.
   *
   * AND NOTHING AT ALL IF THE PAIR IS WRONG. `whenProblem` is
   * what tells the producer why, at the write, where the thing
   * that is wrong is still in front of them — this is the same
   * parse reaching the same conclusion, so a route that forgot
   * to ask cannot store a window the door will not read. [D-19]
   */
  const window = whenProblem(body) ? {} : {
    ...(instant(body.opensAt) !== null
      ? { opensAt: new Date(instant(body.opensAt)!).toISOString() } : {}),
    ...(instant(body.closesAt) !== null
      ? { closesAt: new Date(instant(body.closesAt)!).toISOString() } : {}),
  };
  return {
    respondable,
    listed: body.listed !== false,
    /* Only where it means something, and never a word we do not know. */
    ...(respondable ? { access } : {}),
    ...(respondable && access === 'anyone' && claims !== undefined
      ? { claims } : {}),
    ...(respondable ? window : {}),
  };
}

/**
 * How many strangers may claim this before the door closes.
 *   [TAKE-PLATFORM P41; D-25]
 *
 * THE EXPOSURE THIS BOUNDS, stated plainly: `POST /api/participate/…`
 * is the only creating write a stranger may make, and each press writes
 * a request. Opening a song to `anyone` without a ceiling is opening it
 * to a script. The client asks once per device because it keeps what it
 * is given, which covers the accidental case and not the deliberate one.
 *
 * A NUMBER RATHER THAN A RATE, because a rate limit is about traffic and
 * this is about a production. What a producer knows is how many takes
 * they are willing to receive from strangers — "a hundred" is an answer
 * they can give; "ten per minute per address" is not a question they
 * should be asked, and it is the deployment's job anyway.
 *
 * FINITE BY DEFAULT. An absent ceiling means this one, not unlimited: a
 * producer who ticks "anyone" is saying who may take part, not agreeing
 * to an unbounded number of them, and the safe reading of silence is a
 * bound they can raise.
 *
 * IT COUNTS CLAIMS ONLY. A producer inviting a choir must not spend the
 * public ceiling — `claimed` on the request is what tells them apart.
 */
export const CLAIMS_BY_DEFAULT = 100;

/** The most this item allows, whether or not anybody set it. */
export function claimsAllowed(availability: TakeAvailability | undefined): number {
  const asked = availability?.claims;
  if (asked === undefined) return CLAIMS_BY_DEFAULT;
  if (!Number.isInteger(asked) || asked < 0) return CLAIMS_BY_DEFAULT;
  return asked;
}

/** Whether one more stranger may take part, given how many already have. */
export function mayClaim(
  availability: TakeAvailability | undefined, alreadyClaimed: number,
  now: string,
): boolean {
  if (!maySubmit(availability, 'anyone', now)) return false;
  return alreadyClaimed < claimsAllowed(availability);
}
