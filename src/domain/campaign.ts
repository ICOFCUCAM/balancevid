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
import type { RequestHolder } from './participation.js';
import { type TakeAvailability, isOpenAt } from './availability.js';
import { type ConsentRecord, permits } from './consent.js';

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
