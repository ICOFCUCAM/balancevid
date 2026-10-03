/**
 * The BalanceVid public competition network.  [GO-VIRAL V-8]
 *
 * > *"An installation BalanceVid operates, on which the network's
 * > campaigns live, and the four states that only mean something
 * > when there are two parties: DRAFT, SUBMITTED, REVIEW and
 * > APPROVED, in front of SCHEDULED. A customer reaches it as a
 * > `Connection` and nothing more."*
 *
 * THREE CLAIMS, AND THIS FILE HOLDS TWO OF THEM. The second —
 * *no path function on a customer's installation names a network
 * record* — is asserted where the paths are, in
 * `test/store/tenancy.test.ts`, because that is where the same
 * kind of claim is already made about accounts.
 *
 * WHAT IS BEING TESTED IS AN ABSENCE, which is the hard kind. The
 * valuable assertions here are the ones that would still pass if
 * somebody deleted the network entirely: a customer's calls run,
 * a customer's screen is complete, and nothing a remote answer
 * does can take either away.
 */

import { describe, expect, it } from 'vitest';

import {
  BEFORE_RUNNING, type Campaign, beforeRunning, campaignSays, publicCalls,
  stillBeingWritten, takenCallSlugs,
} from '../../src/domain/campaign.js';
import {
  CampaignError, addCriterion, approveCall, beginReview, newCampaign,
  schedule, sendBack, setListed, submitForReview,
} from '../../src/domain/campaignEdit.js';
import { reviewsCalls } from '../../src/web/deployment.js';

const NOW = '2026-05-20T10:00:00.000Z';
const OPENS = '2026-05-21T10:00:00.000Z';
const CLOSES = '2026-05-28T10:00:00.000Z';

function call(review?: boolean): Campaign {
  return newCampaign({
    title: 'Sing the second verse',
    track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'Sing the second verse, outdoors' },
    window: { respondable: true, access: 'anyone', opensAt: OPENS, closesAt: CLOSES },
    ...(review === undefined ? {} : { review }),
    now: NOW,
  });
}

describe('which installation reviews calls', () => {
  /*
   * *"Operating the network must not become an entitlement,
   * because an entitlement is something an account can be
   * granted and this is the one capability that cannot be."*
   *
   * SO IT IS READ FROM THE PROCESS. What is checked here is that
   * it is read from the process AND NOWHERE ELSE: no account, no
   * document, no field anybody can set.
   */
  it('is a fact about the process and not about anybody', () => {
    expect(reviewsCalls({})).toBe(false);
    expect(reviewsCalls({ BALANCEVID_REVIEW: '1' })).toBe(true);
    expect(reviewsCalls({ BALANCEVID_REVIEW: 'true' })).toBe(true);
    expect(reviewsCalls({ BALANCEVID_REVIEW: 'yes' })).toBe(true);
    expect(reviewsCalls({ BALANCEVID_REVIEW: ' YES ' })).toBe(true);
  });

  /* A mistyped flag is an installation whose operator mistyped. */
  it('reads anything but a plain yes as no', () => {
    for (const said of ['', '0', 'no', 'false', 'maybe', 'network', 'y']) {
      expect(reviewsCalls({ BALANCEVID_REVIEW: said }), said).toBe(false);
    }
  });
});

describe('a customer\'s own calls', () => {
  /*
   * THE FIRST CLAIM, AT THE POINT IT IS DECIDED. An installation
   * that is not the network creates its calls exactly where every
   * installation has created them since V-2.
   */
  it('start where they have always started', () => {
    const one = call();
    expect(one.state).toBe('scheduled');
    expect(one.history).toEqual([{ state: 'scheduled', at: NOW }]);
    expect(beforeRunning(one)).toBe(false);
    /* And the explicit no is the same as no flag at all. */
    expect(call(false).state).toBe('scheduled');
  });

  /*
   * AND THEY RUN WITH THE NETWORK UNREACHABLE, which on a module
   * that reads nothing is a claim about imports: nothing in the
   * campaign machine asks anything of anywhere. A call opened,
   * listed, judged and completed never consults an origin.
   */
  it('are listed by this installation alone', () => {
    const mine = call();
    setListed(mine, true);
    expect(publicCalls([mine], NOW).map((one) => one.id)).toEqual([mine.id]);
  });
});

describe('a call on the installation that reviews them', () => {
  it('starts as a draft nobody has handed in', () => {
    const one = call(true);
    expect(one.state).toBe('draft');
    expect(one.history).toEqual([{ state: 'draft', at: NOW }]);
    expect(beforeRunning(one)).toBe(true);
    expect(campaignSays(one, NOW)).toBe('A draft. Not handed in yet.');
  });

  it('goes in, is looked at, is passed, and is put in the calendar', () => {
    const one = call(true);
    submitForReview(one, NOW, 'Ama');
    expect(one.state).toBe('submitted');
    beginReview(one, NOW, 'Kofi');
    expect(one.state).toBe('review');
    approveCall(one, NOW, 'Kofi');
    expect(one.state).toBe('approved');
    expect(campaignSays(one, NOW)).toBe('Approved. Not in the calendar yet.');
    schedule(one, NOW, 'Kofi');
    expect(one.state).toBe('scheduled');
    /* And who did each of them is on the record. */
    expect(one.history.map((line) => line.by))
      .toEqual([undefined, 'Ama', 'Kofi', 'Kofi', 'Kofi']);
  });

  /*
   * THE ADDRESS IS REQUIRED AT THE DOOR AND NOT BEFORE IT. A call
   * reviewed and approved without one would be passed and then
   * have to be edited to be reachable, and an edit after approval
   * is the hole in every review process there has ever been.
   */
  it('cannot be handed in without an address', () => {
    const one = call(true);
    delete one.slug;
    expect(() => submitForReview(one, NOW)).toThrow(CampaignError);
    expect(() => submitForReview(one, NOW)).toThrow(/address/);
    expect(one.state).toBe('draft');
    /* Give it one and it goes. */
    one.slug = 'second-verse';
    submitForReview(one, NOW);
    expect(one.state).toBe('submitted');
  });

  /* Back from either side, and to the same place. */
  it('comes back to its author from either side', () => {
    const handed = call(true);
    submitForReview(handed, NOW);
    sendBack(handed, NOW, 'Ama');
    expect(handed.state).toBe('draft');

    const looked = call(true);
    submitForReview(looked, NOW);
    beginReview(looked, NOW);
    sendBack(looked, NOW, 'Kofi');
    expect(looked.state).toBe('draft');
  });

  /*
   * AND IT IS FROZEN WHILE SOMEBODY ELSE HAS IT. A call its
   * author can still change while a reviewer has it open is the
   * hole this corridor exists to close: what was passed is not
   * what runs.
   */
  it('cannot be edited once it has been handed in', () => {
    const one = call(true);
    expect(stillBeingWritten(one)).toBe(true);
    addCriterion(one, 'In tune');
    submitForReview(one, NOW);
    expect(stillBeingWritten(one)).toBe(false);
    expect(() => addCriterion(one, 'In time')).toThrow(CampaignError);
    beginReview(one, NOW);
    expect(() => addCriterion(one, 'In time')).toThrow(CampaignError);
    approveCall(one, NOW);
    expect(() => addCriterion(one, 'In time')).toThrow(CampaignError);
    /* And in the calendar it is a scheduled call like any other,
       which has been editable until it opens since V-5. */
    schedule(one, NOW);
    expect(stillBeingWritten(one)).toBe(true);
    addCriterion(one, 'In time');
    expect(one.scorecard).toHaveLength(2);
  });

  /*
   * AND NONE OF THE FOUR IS IN THE PUBLIC DIRECTORY, HOWEVER IT
   * WAS LISTED. `listed` is set while the call is being written,
   * because that is when somebody fills the form in. *"The
   * existence of a draft is private."* [D-03]
   */
  it('is never in the public directory before it is passed', () => {
    for (const state of BEFORE_RUNNING) {
      const one = call(true);
      setListed(one, true);
      one.state = state;
      expect(publicCalls([one], NOW), state).toEqual([]);
    }
    /* And the moment it is in the calendar, it is. */
    const run = call(true);
    setListed(run, true);
    run.state = 'scheduled';
    expect(publicCalls([run], NOW).map((one) => one.id)).toEqual([run.id]);
  });

  /*
   * BUT ITS ADDRESS IS ALREADY SPOKEN FOR, which is a different
   * question from whether anybody can see it. Two calls cannot
   * answer on one address merely because the first is unpublished.
   */
  it('still holds the address it was given', () => {
    const one = call(true);
    expect(takenCallSlugs([one]).has(one.slug!)).toBe(true);
  });
});
