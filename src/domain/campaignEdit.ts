/**
 * Opening a call, and what may then be done to it.
 *   [GO-VIRAL V-2; Doctrine D-25, D-19]
 *
 * THE RULES LIVE HERE AND NOWHERE ELSE, which is the arrangement
 * the rest of the product uses and `participationEdit.ts` states:
 * the routes decode and authorise, the domain decides, the store
 * writes. A campaign that could be advanced by a route reaching
 * into its fields would be a lifecycle with two owners. [D-06]
 *
 * NOTHING HERE TOUCHES A REQUEST, A PERFORMANCE OR A
 * CONVERSATION. A campaign observes requests; it does not drive
 * one. `REQUEST_STATES`, `REQUEST_NEXT`, `mayMove`, `advance`,
 * `submit`, `accept`, `reject`, `attach`, `rotate`, `viewFor`,
 * `takesLeft` and `takesMade` are untouched by this stage — not
 * one new state and not one new edge. [D-25]
 */

import {
  type Campaign, type CampaignId, type CampaignRules, type CampaignState,
  type CampaignTerms, clockSays, currentTerms, mayJudge, mayMoveCampaign,
} from './campaign.js';
import { type TakeAvailability, whenProblem } from './availability.js';
import type { RequestHolder } from './participation.js';
import { newId, sha256 } from './ids.js';
import { slugFor, slugProblem } from './station.js';

export class CampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignError';
  }
}

const fail = (message: string): never => { throw new CampaignError(message); };

/** The longest a title may be, because it arrives from a form. */
export const TITLE_LONGEST = 120;
/** And the longest any of the organiser's three paragraphs may be. */
export const RULE_LONGEST = 2000;
/**
 * And the longest a set of terms may be.
 *
 * LONGER THAN A RULE, BECAUSE IT IS A DIFFERENT KIND OF TEXT. A
 * prize is a sentence; what somebody is agreeing to about their
 * own face is allowed to be several paragraphs. Still bounded,
 * because it arrives from a form and is stored forever: the list
 * is append-only, so an unbounded field would be an unbounded
 * field once per edit.
 */
export const TERMS_LONGEST = 8000;

/**
 * Open a call.
 *
 * IT STARTS `scheduled` AND NOT `live`, WHATEVER THE CLOCK SAYS.
 * The clock and the state are two answers to two questions —
 * *when does this open* and *has anybody opened it* — and a call
 * that put itself live on creation would be a call nobody
 * decided to run. `begin` below is the deciding, and on a call
 * whose window has already opened it is one press.
 *
 * A WINDOW IS REQUIRED, which is the difference between a
 * campaign and the availability it is built on. V-1 made
 * `opensAt` and `closesAt` optional because every published item
 * on disk has neither; a CALL with no closing time is the thing
 * V-1's own argument says cannot be judged — no moment at which
 * to stop, no countdown, nothing to call *ending soon*.
 */
export function newCampaign(spec: {
  title: string;
  track: RequestHolder;
  rules: CampaignRules;
  window: TakeAvailability;
  closingMinutes?: number;
  /**
   * The slugs other calls already answer on.  [GO-VIRAL V-4]
   *
   * PASSED IN, BECAUSE THIS MODULE READS NOTHING. The rules live
   * here and the store is somewhere else, which is the
   * arrangement the head of this file states; a `newCampaign`
   * that listed the campaigns to pick an address would be the
   * domain reaching for a disk. The route has the list already.
   */
  taken?: Iterable<string>;
  now: string;
}): Campaign {
  const title = spec.title.trim();
  if (!title) fail('a call has to be called something');
  if (!spec.rules.asks.trim()) fail('a call has to say what is being asked for');

  const bad = whenProblem(spec.window);
  if (bad) fail(bad);
  const closesAt = spec.window.closesAt;
  if (!closesAt) {
    fail('a call has to say when it closes — there is nothing to judge '
      + 'and no countdown to show without one');
  }
  /*
   * AND THE CLOSING STRETCH MUST FIT INSIDE THE CALL. A last
   * stretch longer than the call itself is a call that is closing
   * from the moment it opens, which is a countdown nobody
   * believes.
   */
  if (spec.closingMinutes !== undefined) {
    if (!Number.isInteger(spec.closingMinutes) || spec.closingMinutes < 0) {
      fail('the last stretch is a number of minutes');
    }
    const opens = Date.parse(spec.window.opensAt ?? spec.now);
    const closes = Date.parse(closesAt!);
    if (Number.isFinite(opens) && Number.isFinite(closes)
      && spec.closingMinutes * 60_000 > closes - opens) {
      fail('the last stretch is longer than the call');
    }
  }

  return {
    id: newId('camp') as CampaignId,
    title: title.slice(0, TITLE_LONGEST),
    track: spec.track,
    rules: {
      asks: spec.rules.asks.trim().slice(0, RULE_LONGEST),
      ...(spec.rules.criteria?.trim()
        ? { criteria: spec.rules.criteria.trim().slice(0, RULE_LONGEST) } : {}),
      ...(spec.rules.prize?.trim()
        ? { prize: spec.rules.prize.trim().slice(0, RULE_LONGEST) } : {}),
    },
    window: spec.window,
    /*
     * AN ADDRESS FROM THE TITLE, SUGGESTED AND NOT IMPOSED, which
     * is `slugFor`'s own rule: this is what the field is filled
     * with before anybody edits it, and `setSlug` is where the
     * organiser's own answer is judged. A call with no address at
     * all would be a call whose only link is a `camp_` id — true
     * of every one opened before V-4, and not a thing to make
     * somebody fix before they can open one.
     */
    slug: slugFor(title, spec.taken ?? []),
    state: 'scheduled',
    createdAt: spec.now,
    history: [{ state: 'scheduled', at: spec.now }],
    ...(spec.closingMinutes !== undefined
      ? { closingMinutes: spec.closingMinutes } : {}),
  };
}

/**
 * Move it along.
 *
 * EVERY CHANGE OF STATE GOES THROUGH HERE, so the history is
 * complete rather than nearly complete — the same reason
 * `advance` on a request exists, and the same shape.
 *
 * REFUSED RATHER THAN IGNORED when the move is not allowed. A
 * lifecycle that silently declines to move is one nobody can
 * debug from the record it leaves.
 */
export function advanceCampaign(
  campaign: Campaign, to: CampaignState, now: string, by?: string,
): void {
  if (!mayMoveCampaign(campaign.state, to)) {
    fail(`a ${campaign.state} call cannot become ${to}`);
  }
  campaign.state = to;
  campaign.history = [
    ...campaign.history,
    { state: to, at: now, ...(by?.trim() ? { by: by.trim() } : {}) },
  ];
}

/**
 * Open the doors.
 *
 * NOT BEFORE THE WINDOW SAYS. An organiser who could put a call
 * live early would have a window that says one thing and a door
 * that does another, and the listing draws the window.
 */
export function begin(campaign: Campaign, now: string, by?: string): void {
  if (clockSays(campaign, now) === 'scheduled') {
    fail('this call does not open yet');
  }
  if (clockSays(campaign, now) === 'over') {
    fail('this call has already closed');
  }
  advanceCampaign(campaign, 'live', now, by);
}

/**
 * Say it is in its last stretch.
 *
 * ONLY WHEN IT IS, because CLOSING is a fact about the clock and
 * not a mood. *"The last stretch, where the countdown is the
 * point"* — a call marked closing with a week to run is a
 * countdown nobody believes the second time.
 *
 * AND IT GOES BACK. An organiser who extends the deadline has a
 * live call again, not a call stuck in its last stretch — which
 * is the one edge in `CAMPAIGN_NEXT` that points backwards.
 */
export function enterLastStretch(
  campaign: Campaign, now: string, by?: string,
): void {
  if (clockSays(campaign, now) !== 'closing') {
    fail('this call is not in its last stretch yet');
  }
  advanceCampaign(campaign, 'closing', now, by);
}

/** The deadline moved out, so it is a live call again. */
export function reopenToLive(campaign: Campaign, now: string, by?: string): void {
  if (clockSays(campaign, now) !== 'live') {
    fail('this call is still in its last stretch');
  }
  advanceCampaign(campaign, 'live', now, by);
}

/**
 * Shut the doors and let the judges in.
 *
 * NOT WHILE THE WINDOW IS OPEN, which is V-2's own judging
 * criterion and the one rule a competition cannot bend: a panel
 * that starts while entries are still arriving is judging a
 * different field from the one that entered. [GO-VIRAL V-2]
 */
export function beginJudging(
  campaign: Campaign, now: string, by?: string,
): void {
  if (!mayJudge(campaign, now)) {
    fail('this call is still taking entries — judging cannot start until '
      + 'it has closed');
  }
  advanceCampaign(campaign, 'judging', now, by);
}

/** Announce. */
export function announce(campaign: Campaign, now: string, by?: string): void {
  advanceCampaign(campaign, 'results', now, by);
}

/** Archive it. The one end, and it is a real one. */
export function complete(campaign: Campaign, now: string, by?: string): void {
  advanceCampaign(campaign, 'completed', now, by);
}

/**
 * Move the deadline.
 *
 * ONLY WHILE IT IS STILL TAKING ENTRIES. Extending a call after
 * the judges have seen the field would let somebody enter knowing
 * what they are competing against, which is the thing a
 * competition exists not to allow.
 *
 * AND THE STATE FOLLOWS THE CLOCK. A call in its last stretch
 * whose deadline moves out is live again; one that is live and
 * whose new deadline is close is closing. The two answers must
 * not be left to drift apart by a change that is about exactly
 * the thing they disagree on.
 */
export function moveDeadline(
  campaign: Campaign, closesAt: string, now: string, by?: string,
): void {
  if (campaign.state !== 'live' && campaign.state !== 'closing') {
    fail('this call is no longer taking entries');
  }
  const bad = whenProblem({ opensAt: campaign.window.opensAt, closesAt });
  if (bad) fail(bad);
  campaign.window = { ...campaign.window, closesAt };
  const says = clockSays(campaign, now);
  if (says === 'closing' && campaign.state === 'live') {
    advanceCampaign(campaign, 'closing', now, by);
  }
  if (says === 'live' && campaign.state === 'closing') {
    advanceCampaign(campaign, 'live', now, by);
  }
}

/**
 * The hash of a set of terms, as everything here spells it.
 *
 * THE EXACT BYTES, AND `quoteHash`'S NORMALISATION IS DELIBERATELY
 * NOT APPLIED. That one folds whitespace and quotation marks so
 * re-transcribing a quotation does not invalidate an anchor —
 * right for a quotation and wrong here. A clause reflowed is a
 * clause somebody may read differently, and the question this hash
 * answers is *are these the words they saw*, to which "nearly" is
 * not an answer.
 */
export function termsHashOf(text: string): string {
  return sha256(text);
}

/**
 * Say what entrants have to agree to.  [GO-VIRAL V-3]
 *
 * THIS IS THE ONLY WAY A CALL COMES TO REQUIRE CONSENT, and
 * calling it is the organiser deciding to ask. A call with no
 * terms asks nobody anything and every request under it behaves
 * exactly as every request has always behaved.
 *
 * IT APPENDS AND NEVER REPLACES. An organiser improving their
 * wording on Tuesday must not reach back and change what Monday's
 * entrants agreed to — and must not invalidate Monday's entries
 * either, which is what replacing a single string would do. Both
 * are avoided by the same decision: the old wording stays on
 * record, `currentTerms` is what the next entrant sees, and
 * `termsSigned` still finds Monday's.
 *
 * THE SAME WORDS TWICE ARE THE SAME WORDS. Pressing save on an
 * unchanged form must not write a second entry with an identical
 * hash and a later date — the wording came into use when it came
 * into use, and `from` is that moment.
 */
export function setTerms(
  campaign: Campaign, text: string, at: string,
): CampaignTerms {
  const words = text.trim().slice(0, TERMS_LONGEST);
  if (!words) fail('terms nobody can read are not terms');
  const already = currentTerms(campaign);
  const hash = termsHashOf(words);
  if (already?.hash === hash) return already;
  const next: CampaignTerms = { hash, text: words, from: at };
  campaign.terms = [...(campaign.terms ?? []), next];
  return next;
}

/**
 * Change the address a call answers on.  [GO-VIRAL V-4]
 *
 * REFUSED RATHER THAN REPAIRED, which is `slugProblem`'s own rule
 * and the reason this calls it instead of a second one: *"a slug
 * is an address somebody will print, and quietly turning what they
 * typed into something else is how a station ends up advertising a
 * URL that is not theirs."*
 *
 * AND UNIQUE, for the reason a station's is: two calls on one
 * address is one of them unreachable, and which one depends on the
 * order a directory happens to be read in.
 *
 * CHANGING IT BREAKS THE OLD LINK, and that is said here rather
 * than worked around. A call whose address moved after a thousand
 * people shared it is a thousand dead links; the honest answer is
 * that the organiser decides, and the id still works.
 */
export function setSlug(
  campaign: Campaign, slug: string, taken: Iterable<string>,
): void {
  const wanted = slug.trim().toLowerCase();
  const wrong = slugProblem(wanted);
  if (wrong) fail(wrong);
  for (const one of taken) {
    if (one === wanted) fail('another call already answers on that address');
  }
  campaign.slug = wanted;
}

/**
 * Put it in the directory, or take it out.  [GO-VIRAL V-4]
 *
 * ON THE WINDOW, BECAUSE THAT IS WHERE `listed` LIVES. V-2 made a
 * call's window a `TakeAvailability` so that a call and the item
 * it is about could not come to different conclusions about being
 * open; the same field answers *does this appear in an index*, and
 * a second flag on the campaign would be a second answer.
 *
 * UNLISTED IS NOT PRIVATE AND THE DIFFERENCE IS THE POINT. The
 * call stays at its own address for whoever holds it — the
 * station directory's own words, *"works through direct
 * link/domain but doesn't appear in the directory"*. An organiser
 * who wants nobody in it has `complete` for that.
 */
export function setListed(campaign: Campaign, listed: boolean): void {
  campaign.window = { ...campaign.window, listed };
}
