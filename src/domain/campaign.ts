/**
 * A call, and the people answering it are not it.
 *   [GO-VIRAL V-2; Doctrine D-19, D-25]
 *
 * > *"A campaign moves through states and they are not the same
 * > states a single person's invitation moves through."*
 *
 * THIS IS A SECOND NOUN AND NOT A SECOND PROTOCOL, which is the
 * distinction `docs/TAKE-DESKTOP.md` drew about clients — *"they
 * are not two different participation protocols, they are two
 * clients of the same Take system."* Nothing about how a
 * participant takes part changes. A campaign is the thing a
 * hundred of them are answering, and until now there was no such
 * thing: a hundred strangers pressing *Take this song* produced a
 * hundred `ParticipationRequest`s and no record that they were
 * answering one call.
 *
 * WHY NOT TEN MORE STATES ON `ParticipationRequest`, which is the
 * smaller-looking change and is the larger one:
 *
 *   word        on a request              on a campaign
 *   submitted   somebody sent a recording the organiser handed it over
 *   reviewed    a producer held one       BalanceVid is deciding
 *   accepted    this recording is used    this call may exist
 *
 * Three collisions, three different meanings. The actors differ —
 * a request's machine is a producer and one participant; a
 * campaign's is an organiser, a clock and a panel. The lifetimes
 * differ and NEST: a campaign contains N requests and outlives all
 * of them, and one machine cannot be both the container and the
 * thing contained. The clocks differ: `expiresAt` is per link, per
 * person, and SCHEDULED → LIVE → CLOSING is one clock for
 * everybody. And `REQUEST_NEXT` is a total map over
 * `RequestState`; twenty states is ninety rows of which eighty are
 * unreachable, in a table whose whole virtue is that it can be
 * read.
 *
 * A CAMPAIGN READS REQUESTS AND NEVER ADVANCES ONE. D-25:
 * *"production and participation are separate… a participant never
 * holds a studio object."* A campaign is the organiser's; the
 * participant still holds only a request, and `viewFor` stays the
 * one gate on what they are told.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Id } from './ids.js';
import type { ParticipationRequest, RequestHolder } from './participation.js';
import { type TakeAvailability, isListed, isOpenAt } from './availability.js';
import { type ConsentRecord, permits } from './consent.js';
import type { Criterion, Judge, Judgement } from './judging.js';

export type CampaignId = Id<'camp'>;

/**
 * Where a call has got to.
 *
 * SIX, AND THE FOUR IN FRONT OF THEM ARE DELIBERATELY ABSENT.
 * DRAFT → SUBMITTED → REVIEW → APPROVED only mean something when
 * there are two parties, and on one installation there is one
 * account, one password and one owner. An owner submitting a
 * campaign to themselves for review and approving it is ceremony
 * with the same person on both sides — and a state machine whose
 * guard nobody enforces teaches people to click through.
 *
 * Those four are the public network's and arrive with it at V-8.
 * This is the whole of what one installation can honestly operate,
 * and it leaves room at the front of the list rather than
 * inventing an authority. [GO-VIRAL §4, V-8]
 */
export const CAMPAIGN_STATES = [
  'scheduled', 'live', 'closing', 'judging', 'results', 'completed',
] as const;

export type CampaignState = (typeof CAMPAIGN_STATES)[number];

/**
 * The states a campaign may move to from each one.
 *
 * WRITTEN DOWN AS A TABLE, in the same form `REQUEST_NEXT` is and
 * for its reason: the rule is readable rather than spread across
 * the routes that enforce it, and a state added later has one
 * place to be added.
 *
 * TWO EDGES ARE NOT IN THE BRIEF'S LIST AND BOTH ARE ADMISSIONS.
 * `closing` RETURNS TO `live`, because the only thing that makes a
 * call closing is how much of its window is left — and an
 * organiser who extends the deadline has a live call again, not a
 * call stuck in its last stretch. And `judging` RETURNS TO
 * `closing` only in the sense that it does not: it does not. Once
 * entries are shut, reopening them would let somebody enter after
 * seeing what they were competing against, which is the one thing
 * a competition cannot allow.
 *
 * `completed` IS THE ONLY END, and it is a real one. A campaign
 * that has announced its results and been archived cannot be
 * un-announced; that is `attached`'s argument on the request
 * machine, applied to the thing that contains them.
 */
export const CAMPAIGN_NEXT: Record<CampaignState, readonly CampaignState[]> = {
  scheduled: ['live'],
  live: ['closing', 'judging'],
  closing: ['live', 'judging'],
  judging: ['results'],
  results: ['completed'],
  completed: [],
};

/** Whether a campaign may move from one state to another. */
export function mayMoveCampaign(from: CampaignState, to: CampaignState): boolean {
  return CAMPAIGN_NEXT[from].includes(to);
}

/**
 * What the organiser said, in their own words.
 *
 * TEXT AND NOT A SCHEMA, which is a decision rather than
 * laziness. *"Sing the second verse, outdoors, phone held
 * sideways"* is a rule a person can follow and a machine cannot
 * check, and a product that offered `minDurationSeconds` and
 * `requiredHashtag` would be offering to enforce what it cannot.
 * What it can do is show the words to everybody who enters and
 * to everybody who judges, which is what makes them a rule.
 *
 * THE CRITERIA ARE PUBLISHED FOR THE SAME REASON. A competition
 * whose basis is announced after the entries is not one, and V-5
 * reads these when a judge scores. [GO-VIRAL V-5]
 */
export interface CampaignRules {
  /** What to do. Shown before anybody records. */
  asks: string;
  /** What it will be judged on. Shown before anybody enters. */
  criteria?: string;
  /**
   * What the winner gets, as the organiser wrote it.
   *
   * TEXT, AND THE PRODUCT DOES NOT PAY IT. `docs/GO-VIRAL.md`'s
   * **Not built** says why: a system that sat between two people
   * and a sum of money would acquire obligations that have
   * nothing to do with recorded speech. A campaign records who
   * won; paying them is an act between two people.
   */
  prize?: string;
}

/**
 * The words a campaign asks its entrants to agree to.
 *   [GO-VIRAL V-3]
 *
 * > *"It is a record: what they were told, in what words, on what
 * > date."*
 *
 * APPEND-ONLY, AND THAT IS THE WHOLE REASON THIS IS A LIST RATHER
 * THAN A STRING. A consent record points at its terms by hash, so
 * the words cannot be edited underneath a signature — but a hash
 * on its own is a record nobody can read back. *"They agreed to
 * something with hash a3f…"* answers no question anybody would
 * ask. So the text is kept beside the hash, every wording that was
 * ever shown is kept, and an organiser who improves their terms on
 * Tuesday leaves Monday's entrants pointing at Monday's words.
 *
 * WHICH IS THE ONLY WAY BOTH HALVES CAN BE TRUE AT ONCE: new
 * entrants see the new terms, and an old entry still verifies.
 * One mutable field could do one or the other and not both.
 */
export interface CampaignTerms {
  /** `sha256` of `text`, which is what a consent record names. */
  hash: string;
  /** The exact words that were shown. */
  text: string;
  /** When this wording came into use. */
  from: string;
}

/**
 * A call for takes.
 *
 * `track` IS A `RequestHolder`, NOT A NEW REFERENCE SHAPE. The
 * thing a campaign is about is a performance, a conversation or a
 * channel — the same three a request names, resolved the same way,
 * by the type that already exists for exactly this. A second way
 * of pointing at a studio document is a second thing to keep in
 * step. [D-19]
 *
 * `window` IS A `TakeAvailability`, FOR THE SAME REASON. V-1 put
 * `opensAt` and `closesAt` on the thing a producer publishes; a
 * campaign's clock is that clock, read by the same predicate, so a
 * call and the item it is about cannot come to different
 * conclusions about whether it is open. What a campaign adds is a
 * NAME for the period, which is what `state` is.
 */
export interface Campaign {
  id: CampaignId;
  /** What it is called, where a person is choosing between calls. */
  title: string;
  /** The document it is a call about. */
  track: RequestHolder;
  rules: CampaignRules;
  /** When it opens and shuts, in V-1's own fields. */
  window: TakeAvailability;
  state: CampaignState;
  createdAt: string;
  /** Every move, and who made it. The same shape a request keeps. */
  history: { state: CampaignState; at: string; by?: string }[];
  /**
   * The address this call is shared at.  [GO-VIRAL V-4]
   *
   * `/go/<slug>`, AND IT IS THE SAME MACHINERY A STATION'S IS.
   * `slugFor` suggests it from the title and `slugProblem` decides
   * whether what the organiser left is allowed — the two functions
   * `src/domain/station.ts` already has, used unchanged, because a
   * second idea of what a web address may contain is a second set
   * of addresses that print differently. [D-19]
   *
   * ABSENT IS REACHABLE BY ID, which is what every campaign opened
   * before this field existed is. `bySlugOrId` answers both, so an
   * organiser who never names one still has a link to send.
   */
  slug?: string;
  /**
   * Every wording this call has asked entrants to agree to.
   *   [GO-VIRAL V-3]
   *
   * ABSENT MEANS THIS CALL ASKS NOBODY ANYTHING, which is what
   * every campaign written before this field existed is, and
   * what an ordinary producer-issued request still is. A call
   * REQUIRES CONSENT EXACTLY WHEN IT HAS TERMS — there is no
   * second flag, because a flag and a list could disagree, and
   * a call that required consent and had no words to show would
   * be a door with no sign on it.
   *
   * NEWEST LAST. `currentTerms` is what a new entrant sees;
   * every entry already made still names the wording it saw.
   */
  terms?: CampaignTerms[];
  /**
   * What the panel marks, and when it was fixed.  [GO-VIRAL V-5]
   *
   * FROZEN AT LIVE, which is the stage's own rule: *"publish the
   * criteria before the campaign opens, not after it closes."* A
   * criterion added during JUDGING would be applied to entries
   * recorded against different rules, and a competition whose
   * basis moved after the entries is not one.
   *
   * SEPARATE FROM `rules.criteria`, WHICH IS A PARAGRAPH. That
   * one is what an entrant reads before deciding; this is what a
   * judge fills in, and each row needs an id a judgement can name
   * and a scale to be out of. The paragraph is already frozen
   * because nothing can edit it — `newCampaign` writes `rules`
   * and no verb changes them. [`judging.ts`]
   *
   * ABSENT IS A CALL JUDGED BY SOMEBODY'S EYE AND NOT BY A FORM,
   * which is every call opened before this stage and a perfectly
   * ordinary way to run one. `judgementProblem` refuses to record
   * a score against nothing rather than inventing a criterion.
   */
  scorecard?: Criterion[];
  /**
   * Who may mark.  [GO-VIRAL V-5, §4]
   *
   * NAMES AND NOT ACCOUNTS. One account exists on an
   * installation, and a second kind of login so three people can
   * mark eleven videos would be a user system built for a panel.
   * What this records is who a judgement is ATTRIBUTED to, which
   * is honest about what it proves and is further than a score
   * with nobody's name on it. [`judging.ts`]
   */
  panel?: Judge[];
  /**
   * What the panel said, and the only record of the result.
   *
   * THE STANDING IS NOT HERE AND IS NEVER WRITTEN. `resultsFor`
   * derives it from these, so a corrected mark changes the
   * result and nothing can hold a standing its own records do
   * not produce. [GO-VIRAL V-5]
   */
  judgements?: Judgement[];
  /**
   * How long before the close a call is in its last stretch.
   *
   * MINUTES, AND IT IS THE ORGANISER'S. *"CLOSING is the last
   * stretch, where the countdown is the point"* — which is a
   * different length for a weekend challenge and a three-month
   * album campaign, and a constant here would be this product
   * deciding for both.
   *
   * Absent means a day, which is the shape of most of them.
   */
  closingMinutes?: number;
}

/** A day, which is the last stretch of most calls. */
export const CLOSING_BY_DEFAULT = 24 * 60;

export function closingMinutesOf(campaign: Campaign): number {
  const asked = campaign.closingMinutes;
  if (asked === undefined || !Number.isInteger(asked) || asked < 0) {
    return CLOSING_BY_DEFAULT;
  }
  return asked;
}

/* ------------------------------------------------------------------ *
 *  What the clock says, which is not the same as where it has got to.
 * ------------------------------------------------------------------ */

/**
 * The state the CLOCK implies, which a campaign may not be in yet.
 *
 * TWO ANSWERS AND THEY ARE BOTH NEEDED, which is the thing worth
 * being careful about. `state` is where a person has moved this
 * call to; this is where its window says it should be. They
 * disagree whenever somebody has not pressed the button yet — and
 * a surface that showed only the first would say LIVE about a call
 * that shut an hour ago, while one that showed only the second
 * could not tell JUDGING from RESULTS at all, because the clock
 * has nothing to say about either.
 *
 * SO THE CLOCK ANSWERS ONLY THE THREE STATES IT KNOWS ABOUT. After
 * entries close it is silent, and `state` is the whole truth.
 */
export function clockSays(
  campaign: Campaign, now: string,
): 'scheduled' | 'live' | 'closing' | 'over' {
  const opens = Date.parse(campaign.window.opensAt ?? '');
  const closes = Date.parse(campaign.window.closesAt ?? '');
  const at = Date.parse(now);
  if (!Number.isFinite(at)) return 'live';
  if (Number.isFinite(opens) && at < opens) return 'scheduled';
  if (Number.isFinite(closes)) {
    if (at >= closes) return 'over';
    const lastStretch = closes - closingMinutesOf(campaign) * 60_000;
    if (at >= lastStretch) return 'closing';
  }
  return 'live';
}

/**
 * Whether entries are being taken, which is one question with two
 * halves.
 *
 * THE WINDOW AND THE STATE BOTH HAVE TO AGREE. A call whose window
 * is open but which an organiser has moved to JUDGING is shut — a
 * judge looking at the entries must not have one arrive behind
 * them. A call in LIVE whose window has closed is shut too, which
 * is the ordinary case: nobody presses a button at midnight.
 */
export function takingEntries(campaign: Campaign, now: string): boolean {
  if (campaign.state !== 'live' && campaign.state !== 'closing') return false;
  return isOpenAt(campaign.window, now);
}

/**
 * Whether judging may begin.
 *
 * NOT WHILE THE WINDOW IS OPEN, which is V-2's own judging
 * criterion and the one rule a competition cannot bend: a panel
 * that starts while entries are still arriving is a panel judging
 * a different field from the one that entered.
 */
export function beingJudged(campaign: Campaign): boolean {
  return campaign.state === 'judging';
}

/**
 * What this call publishes as the basis for marking.
 *
 * ONE READING, SO A FORM AND A RESULT CANNOT DISAGREE about how
 * many criteria there are — which is the arithmetic every total
 * in `resultsFor` is out of. [D-19]
 */
export function scorecardOf(campaign: Campaign): Criterion[] {
  return campaign.scorecard ?? [];
}

/** The panel, as a list even where nobody has been named. */
export function panelOf(campaign: Campaign): Judge[] {
  return campaign.panel ?? [];
}

/** What has been said about this call's entries. */
export function judgementsOf(campaign: Campaign): Judgement[] {
  return campaign.judgements ?? [];
}

export function mayJudge(campaign: Campaign, now: string): boolean {
  if (campaign.state !== 'live' && campaign.state !== 'closing') return false;
  return !isOpenAt(campaign.window, now);
}

/** What to tell somebody looking at a call. One line, no jargon. */
export function campaignSays(campaign: Campaign, now: string): string {
  switch (campaign.state) {
    case 'scheduled':
      return 'Not open yet.';
    case 'live':
      return clockSays(campaign, now) === 'over'
        ? 'The deadline has passed. Nothing more can be entered.'
        : 'Open for takes.';
    case 'closing':
      return clockSays(campaign, now) === 'over'
        ? 'The deadline has passed. Nothing more can be entered.'
        : 'Closing soon — this is the last stretch.';
    case 'judging':
      return 'Closed to entries. Being judged.';
    case 'results':
      return 'The results are in.';
    default:
      return 'Over.';
  }
}

/* ------------------------------------------------------------------ *
 *  Which call a request belongs to.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 *  What this call asks of the people entering it.  [GO-VIRAL V-3]
 * ------------------------------------------------------------------ */

/** The wording a new entrant is shown, or none because there is none. */
export function currentTerms(campaign: Campaign): CampaignTerms | null {
  return campaign.terms?.at(-1) ?? null;
}

/**
 * The wording somebody actually agreed to, found by its hash.
 *
 * NOT `currentTerms`, AND THE DIFFERENCE IS THE POINT. An entry
 * made on Monday names Monday's words; asking whether it matches
 * TODAY's terms would invalidate every entry the moment an
 * organiser fixed a typo, which is the opposite of what a signed
 * record is for. The question is *are these words still on
 * record*, and the list is append-only so the answer stays yes.
 */
export function termsSigned(
  campaign: Campaign, hash: string,
): CampaignTerms | null {
  return (campaign.terms ?? []).find((one) => one.hash === hash) ?? null;
}

/** Whether entering this call means agreeing to something first. */
export function needsConsent(campaign: Campaign): boolean {
  return currentTerms(campaign) !== null;
}

/**
 * Why this entry may not go into this call, or nothing.
 *
 * ONE PREDICATE, ASKED AT BOTH DOORS — the one a participant
 * sends through and the one a producer accepts through — because
 * a rule enforced at submission and forgotten at acceptance is a
 * rule that holds until somebody uses the inbox. [D-19]
 *
 * A CALL WITH NO TERMS REFUSES NOTHING, which is the whole of
 * *"an ordinary submission with no consent record behaves exactly
 * as today"*. Every request this product has ever issued answers
 * this with the empty string.
 *
 * `permits` RATHER THAN A WITHDRAWAL CHECK OF ITS OWN, so a
 * withdrawal is honoured by whatever asks. A record that reaches
 * here and does not permit entry has been taken back: `entry` is
 * the one scope `consentFrom` will not write a record without, so
 * it is present on every record that was ever made.
 */
export function entryProblem(
  campaign: Campaign, consent: ConsentRecord | undefined,
): string {
  if (!needsConsent(campaign)) return '';
  if (!consent) {
    return 'this call asks everybody entering it to agree to its terms first';
  }
  if (!permits(consent, 'entry')) return 'that agreement was taken back';
  if (!termsSigned(campaign, consent.termsHash)) {
    return 'those are not the terms of this call';
  }
  return '';
}

/**
 * The one call taking entries for this document, or nothing.
 *
 * A TRACK MAY HAVE SEVERAL CALLS, which the brief is explicit
 * about: *"a song can potentially have multiple campaigns —
 * France Launch Challenge, Global Take Challenge, TikTok
 * Performance Challenge."* So this answers only when there is no
 * question which one somebody meant.
 *
 * WITH TWO LIVE, A STRANGER PRESSING "TAKE THIS SONG" HAS NOT
 * CHOSEN. The generic door on the discovery listing names a
 * document, not a call; guessing which call they meant would put
 * somebody's entry in a competition they never read the rules of.
 * They get a request belonging to no call, which is exactly what
 * every request was before this stage — and V-4's campaign page
 * is the door that names one. [GO-VIRAL §3, V-4]
 */
export function callFor(
  campaigns: readonly Campaign[], holder: RequestHolder, now: string,
): Campaign | null {
  const open = campaigns.filter((one) => one.track.kind === holder.kind
    && one.track.id === holder.id && takingEntries(one, now));
  return open.length === 1 ? open[0]! : null;
}

/** One call and the requests answering it, or a request answering none. */
export interface Entries<T> {
  campaign: CampaignId | null;
  requests: T[];
}

/**
 * What the inbox is looking at.  [GO-VIRAL V-2]
 *
 * > *"A hundred claimed requests under one campaign are listed as
 * > one call in the inbox."*
 *
 * A PRODUCER WHO OPENED A CALL TO THE PUBLIC HAS ONE THING TO
 * THINK ABOUT AND A HUNDRED THINGS TO LOOK AT. Before this, the
 * inbox drew a hundred rows that looked exactly like a hundred
 * people the producer had invited by name — which is the same
 * failure B-3 found one layer down, where four angles of one
 * capture arrived as four strangers.
 *
 * ORDER IS THE ORDER THINGS CAME IN, with a call standing where
 * its FIRST request stood. A producer who looked away must not
 * find the list reshuffled because the ninety-ninth entry
 * arrived.
 *
 * A REQUEST ANSWERING NO CALL IS A GROUP OF ONE, not a special
 * case — which is every request this product has ever issued, and
 * what makes this safe to put in front of all of them.
 */
export function entriesIn<T extends { campaign?: CampaignId }>(
  requests: readonly T[],
): Entries<T>[] {
  const out: Entries<T>[] = [];
  const found = new Map<CampaignId, Entries<T>>();
  for (const request of requests) {
    const call = request.campaign;
    if (!call) { out.push({ campaign: null, requests: [request] }); continue; }
    const already = found.get(call);
    if (already) { already.requests.push(request); continue; }
    const group: Entries<T> = { campaign: call, requests: [request] };
    found.set(call, group);
    out.push(group);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  The public face of a call.  [GO-VIRAL V-4, §10, §20]
 * ------------------------------------------------------------------ */

/**
 * Whether this call appears in an index at all.
 *
 * `isListed` AND NOT A FIELD OF ITS OWN, because V-2 made the
 * window a `TakeAvailability` precisely so that a call and the
 * item it is about could not come to different conclusions. An
 * organiser who unticks *listed* has said the same thing here they
 * say about a song: it works through its link and does not appear
 * in the directory. [TV-NETWORK's `bySlug`, one noun over]
 */
export function callListed(campaign: Campaign): boolean {
  return isListed(campaign.window);
}

/**
 * Every address in use, except this call's own.
 *
 * THE SAME SHAPE `channelEdit`'S `takenSlugs` TAKES, and for the
 * same reason: the uniqueness check has to exclude the call being
 * edited, or saving a call without touching its address would
 * refuse on the address it already has.
 */
export function takenCallSlugs(
  campaigns: readonly Campaign[], except?: string,
): Set<string> {
  const out = new Set<string>();
  for (const one of campaigns) {
    if (one.id === except) continue;
    if (one.slug) out.add(one.slug);
  }
  return out;
}

/**
 * The call at this address, by slug or by id.
 *
 * UNLISTED IS REACHABLE BY ADDRESS, which is the whole of what
 * unlisted means — the station directory's own words, *"works
 * through direct link/domain but doesn't appear in the
 * directory"*. What this refuses is nothing: a caller that has the
 * address has the call, and the INDEX is where listing is decided.
 *
 * SLUG FIRST, THEN ID, and a slug that looks like an id cannot
 * exist because `slugProblem` refuses an underscore. So the two
 * namespaces cannot collide and the order is a convenience rather
 * than a rule somebody has to remember.
 */
export function bySlugOrId(
  campaigns: readonly Campaign[], handle: string,
): Campaign | null {
  /*
   * AN EMPTY HANDLE NEEDS NO GUARD OF ITS OWN, and one was
   * written and deleted. `slugProblem` refuses anything shorter
   * than the minimum, so no call carries an empty slug, and no id
   * is empty either — so the two lookups below already answer
   * nothing. A branch that cannot change an answer is a branch
   * nobody can check. [the thirty-third]
   */
  const wanted = handle.trim().toLowerCase();
  return campaigns.find((one) => one.slug === wanted)
    ?? campaigns.find((one) => one.id === handle.trim())
    ?? null;
}

/**
 * What a stranger browsing sees, in the order they want it.
 *
 * WHAT IS OPEN, SOONEST DEADLINE FIRST, THEN EVERYTHING ELSE
 * NEWEST FIRST. Two orderings in one list, and the reason is that
 * they answer two different questions. A person looking at an open
 * call is deciding whether they have time to enter, so the one
 * closing on Friday belongs above the one closing in March. A
 * person looking at a call that has closed is reading a result,
 * and the newest result is the interesting one.
 *
 * A COMPLETED CALL IS NOT IN THE INDEX. It is still at its own
 * address — V-7's creator keeps a link that works — but a
 * directory of finished competitions is a directory nobody is
 * browsing. [§10]
 */
export function publicCalls(
  campaigns: readonly Campaign[], now: string,
): Campaign[] {
  const shown = campaigns.filter(
    (one) => callListed(one) && one.state !== 'completed');
  const open = shown.filter((one) => takingEntries(one, now));
  const rest = shown.filter((one) => !takingEntries(one, now));
  open.sort((a, b) => (a.window.closesAt ?? '').localeCompare(b.window.closesAt ?? ''));
  rest.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...open, ...rest];
}

/**
 * How long is left, in milliseconds, or nothing.
 *
 * THE INSTANT AND NOT THE WORD, which is V-1's own argument for
 * putting `closesAt` on the listing: *"a countdown needs the
 * instant, not the word."* `clockSays` answers *closing*; this
 * answers *four hours and eleven minutes*, and a page drawing the
 * second from the first would be a page inventing it.
 *
 * NEVER NEGATIVE. A deadline that has passed is nothing left, not
 * minus a day — a countdown that ran backwards past zero would be
 * drawn as a number nobody can read.
 */
export function msLeft(campaign: Campaign, now: string): number | null {
  const closes = Date.parse(campaign.window.closesAt ?? '');
  const at = Date.parse(now);
  if (!Number.isFinite(closes) || !Number.isFinite(at)) return null;
  return Math.max(0, closes - at);
}

/**
 * What a stranger may be told about a call, and no more.
 *
 * `viewFor`'S JOB, ONE NOUN OVER, and it is here rather than in a
 * route for the same reason that one is in a domain module: what
 * crosses to somebody with no account is a decision, and a
 * decision made in two routes is two decisions.
 *
 * WHAT IS WITHHELD IS THE TRACK. A call names a performance, a
 * conversation or a channel by id, and an index that carried that
 * id would let a directory of competitions be read as a directory
 * of this installation's unpublished work — a document's existence
 * is itself private. The way in is `/go/<slug>/enter`, which
 * resolves the track on the server. [D-03]
 *
 * AND THE TERMS. They are long, they belong where somebody is
 * about to agree to them, and the Take surface already carries
 * them on the one fetch it makes. [V-3]
 */
export interface CallRow {
  id: CampaignId;
  slug?: string;
  title: string;
  asks: string;
  state: CampaignState;
  clock: ReturnType<typeof clockSays>;
  says: string;
  listed: boolean;
  opensAt?: string;
  closesAt?: string;
  /** The instant, so a countdown is drawn rather than guessed. [V-1] */
  msLeft: number | null;
  /** Where it lives, which is the thing a person shares. */
  at: string;
}

export function callRow(campaign: Campaign, now: string): CallRow {
  return {
    id: campaign.id,
    ...(campaign.slug ? { slug: campaign.slug } : {}),
    title: campaign.title,
    asks: campaign.rules.asks,
    state: campaign.state,
    clock: clockSays(campaign, now),
    says: campaignSays(campaign, now),
    listed: callListed(campaign),
    ...(campaign.window.opensAt ? { opensAt: campaign.window.opensAt } : {}),
    ...(campaign.window.closesAt ? { closesAt: campaign.window.closesAt } : {}),
    msLeft: msLeft(campaign, now),
    at: `/go/${campaign.slug ?? campaign.id}`,
  };
}

/* ------------------------------------------------------------------ *
 *  What answered it.  [GO-VIRAL V-4, §20]
 * ------------------------------------------------------------------ */

/** One thing on the wall: a capture somebody agreed may be shown. */
export interface CallEntry {
  requestId: string;
  /** The submission's own id, which the media route takes. */
  submissionId: string;
  assetId: string;
  kind: 'video' | 'audio' | 'text';
  at: string;
  /** As the producer wrote it, where they wrote one. */
  participant?: string;
  durationSamples?: number;
}

/**
 * The entries this call may show, and only those.
 *
 * THE PARTICIPANT'S OWN PERMISSION IS THE AUTHORITY, and it is a
 * stronger one than anything else in this product has for putting
 * a face on a public page. `permits(consent, 'display')` is the
 * answer to a question that was asked in plain words, before the
 * camera opened, with nothing pre-ticked, naming this call's exact
 * terms by their hash. An entry whose maker did not tick that box
 * is not here; one who ticked it and took it back is not here
 * either, from the moment they did. [V-3]
 *
 * WHICH IS A DIFFERENT LINE FROM THE ONE `policy.ts` DRAWS ABOUT
 * RAW MATERIAL, and the difference is worth stating rather than
 * stepping over. That rule withholds *"the song, the takes' own
 * media and the document"* from a published performance, because
 * nobody consented to those being handed out — they are the
 * material a finished thing was made from. A competition entry is
 * not material; it is the thing itself, made to be entered, by
 * somebody who said it could be shown here.
 *
 * ONE ROW PER CAPTURE, HOWEVER MANY CAMERAS SAW IT. Four angles of
 * one performance arrive as four submissions sharing a
 * `capturedIn.id` — B-3's own finding one layer down, where four
 * angles landed in the inbox as four strangers. A wall that drew
 * them as four entries would be a competition somebody appeared in
 * four times for singing once.
 *
 * ORDER IS ARRIVAL ORDER. Newest first would make the wall reshuffle
 * under somebody reading it, and a competition has no ranking until
 * V-5 produces one.
 */
export function wallOf(
  campaign: Campaign, requests: readonly ParticipationRequest[],
): CallEntry[] {
  const out: CallEntry[] = [];
  for (const request of requests) {
    if (request.campaign !== campaign.id) continue;
    if (!permits(request.consent, 'display')) continue;
    const seen = new Set<string>();
    for (const one of request.submissions ?? []) {
      const capture = one.capturedIn?.id;
      if (capture) {
        if (seen.has(capture)) continue;
        seen.add(capture);
      }
      out.push({
        requestId: request.id,
        submissionId: one.id,
        assetId: one.assetId,
        kind: one.kind,
        at: one.at,
        ...(request.participant ? { participant: request.participant } : {}),
        ...(one.durationSamples !== undefined
          ? { durationSamples: one.durationSamples } : {}),
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The loop, measured.  [GO-VIRAL §20]
 *
 * > *"Measure the loop, not the vanity. Entries, finishers,
 * > shares, arrivals from a share, and how many of those entered.
 * > Five numbers. If entries go up and arrivals-who-entered goes
 * > down, the loop is leaking and the big number is lying to you."*
 *
 * FOUR OF THE FIVE, AND THE MISSING ONE IS NAMED RATHER THAN
 * GUESSED. Shares cannot be counted without something that watches
 * where a visitor came from, and *"nothing should start watching
 * viewers to do it"* — `favorites.ts` is per device and says so,
 * and that is this product's posture. So there is no shares
 * number here and no third-party analytics anywhere. A count this
 * product cannot honestly take is a count it does not print.
 *
 * EVERY ONE OF THESE IS A RECORD THE INSTALLATION ALREADY WRITES
 * ABOUT ITSELF. A request is an entry. A request with a submission
 * finished. `claimed` marks somebody who arrived and took the call
 * themselves rather than being invited by name — which is the
 * arrival signal that already existed. [§20]
 *
 * AND THE LEAK IS THE POINT. `arrivals` beside `arrivalsWhoEntered`
 * is the one pair that can disagree, and a page that printed only
 * the first would be the big number the brief is warning about.
 */
export interface LoopNumbers {
  /** Requests under this call, however they came to exist. */
  entries: number;
  /** Of those, the ones that sent something. */
  finishers: number;
  /** Strangers who took the call themselves. */
  arrivals: number;
  /** And of those, the ones who finished. */
  arrivalsWhoEntered: number;
}

export function loopNumbers(
  campaign: Campaign, requests: readonly ParticipationRequest[],
): LoopNumbers {
  const mine = requests.filter((one) => one.campaign === campaign.id);
  const sent = (one: ParticipationRequest) => (one.submissions ?? []).length > 0;
  const arrived = mine.filter((one) => one.claimed === true);
  return {
    entries: mine.length,
    finishers: mine.filter(sent).length,
    arrivals: arrived.length,
    arrivalsWhoEntered: arrived.filter(sent).length,
  };
}
