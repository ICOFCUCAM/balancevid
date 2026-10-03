/**
 * A call, and the people answering it are not it.
 *   [GO-VIRAL V-2; Doctrine D-19, D-25]
 *
 * > *"A campaign moves through states and they are not the same
 * > states a single person's invitation moves through."*
 *
 * THE ARGUMENT THIS ENCODES is that a campaign is a second NOUN
 * and not a second protocol. Three of its state names collide
 * with three of the request machine's and every collision means
 * something different; the actors differ; the lifetimes nest; the
 * clocks are per-person and per-everybody. So the request machine
 * is untouched, and these are the rules of the thing that
 * contains it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BEFORE_RUNNING, type Campaign, CAMPAIGN_NEXT, CAMPAIGN_STATES,
  CLOSING_BY_DEFAULT, beforeRunning, callFor, campaignSays, clockSays,
  closingMinutesOf, entriesIn, mayJudge, mayMoveCampaign, stillBeingWritten,
  takingEntries,
} from '../../src/domain/campaign.js';

/**
 * The words the two machines genuinely share.
 *
 * A TAKE IS SUBMITTED AND SO IS A CALL. Two machines using one
 * English word for two different things is not a leak; a
 * campaign STATE appearing in `REQUEST_NEXT` would be. And it is
 * only this one: `review` is a campaign state and `reviewed` is
 * a request state, which are different words. [GO-VIRAL §4]
 */
const REQUEST_WORDS = ['submitted'] as const;
import {
  CampaignError, advanceCampaign, announce, begin, beginJudging, complete,
  enterLastStretch, moveDeadline, newCampaign, reopenToLive,
} from '../../src/domain/campaignEdit.js';

const OPENS = '2026-06-01T09:00:00.000Z';
const CLOSES = '2026-06-08T17:00:00.000Z';
const BEFORE = '2026-05-30T12:00:00.000Z';
const DURING = '2026-06-03T12:00:00.000Z';
/* Inside the last day, which is the default last stretch. */
const LAST = '2026-06-08T09:00:00.000Z';
const AFTER = '2026-06-09T12:00:00.000Z';

function call(over: Partial<Campaign> = {}): Campaign {
  return newCampaign({
    title: 'Sing the second verse',
    track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'Sing the second verse, outdoors' },
    window: { respondable: true, access: 'anyone', opensAt: OPENS, closesAt: CLOSES },
    now: '2026-05-20T10:00:00.000Z',
    ...('closingMinutes' in over ? { closingMinutes: over.closingMinutes } : {}),
  });
}

/** A call moved to a state, by the verbs that get it there. */
function at(state: Campaign['state']): Campaign {
  const one = call();
  if (state === 'scheduled') return one;
  begin(one, DURING);
  if (state === 'live') return one;
  if (state === 'closing') { enterLastStretch(one, LAST); return one; }
  beginJudging(one, AFTER);
  if (state === 'judging') return one;
  announce(one, AFTER);
  if (state === 'results') return one;
  complete(one, AFTER);
  return one;
}

describe('the six states, and the four in front of them', () => {
  /*
   * THE FOUR ARRIVED WITH THE PUBLIC NETWORK AT V-8, and the
   * argument for keeping them out until then is unchanged: DRAFT
   * → SUBMITTED → REVIEW → APPROVED only mean something when
   * there are two parties, and an owner submitting a campaign to
   * themselves and approving it is ceremony with the same person
   * on both sides.
   *
   * WHAT CHANGED IS NOT A GUARD. An ordinary installation's calls
   * are created at SCHEDULED and no edge leads back, which the
   * test below proves of the graph itself. [GO-VIRAL V-8]
   */
  it('puts the two-party states in front of the rest', () => {
    expect([...CAMPAIGN_STATES]).toEqual([
      'draft', 'submitted', 'review', 'approved',
      'scheduled', 'live', 'closing', 'judging', 'results', 'completed',
    ]);
  });

  /*
   * THE CLAIM THAT REPLACES THE GUARD, AND THE ONE V-8 IS JUDGED
   * ON: an installation that is not the network cannot reach any
   * of the four, because its calls begin at SCHEDULED and the
   * table has no way back. Walked rather than asserted edge by
   * edge, so an edge added anywhere fails it.
   */
  it('cannot be walked back into the two-party states', () => {
    const reached = new Set<string>(['scheduled']);
    for (const state of reached) {
      for (const next of CAMPAIGN_NEXT[state as Campaign['state']]) {
        reached.add(next);
      }
    }
    for (const two of BEFORE_RUNNING) {
      expect(reached.has(two), two).toBe(false);
    }
    /* And everything after SCHEDULED is still reached. */
    expect(reached.has('completed')).toBe(true);
  });

  /* The corridor itself, including the one door back. */
  it('runs the four as a corridor with one way back to the draft', () => {
    expect(mayMoveCampaign('draft', 'submitted')).toBe(true);
    expect(mayMoveCampaign('submitted', 'review')).toBe(true);
    expect(mayMoveCampaign('review', 'approved')).toBe(true);
    expect(mayMoveCampaign('approved', 'scheduled')).toBe(true);
    /* Back, from either side, and to the same place. */
    expect(mayMoveCampaign('submitted', 'draft')).toBe(true);
    expect(mayMoveCampaign('review', 'draft')).toBe(true);
    /* But never past the person holding it. */
    expect(mayMoveCampaign('draft', 'review')).toBe(false);
    expect(mayMoveCampaign('draft', 'approved')).toBe(false);
    expect(mayMoveCampaign('submitted', 'approved')).toBe(false);
    expect(mayMoveCampaign('review', 'scheduled')).toBe(false);
    /* And approval is not the calendar. */
    expect(mayMoveCampaign('approved', 'live')).toBe(false);
  });

  /*
   * AND IT DOES NOT TOUCH THE REQUEST MACHINE. Not one new state,
   * not one new edge: a campaign observes requests and never
   * advances one. [GO-VIRAL §4]
   */
  it('leaves the request machine exactly as it was', () => {
    const participation = readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'domain', 'participation.ts'),
      'utf8');
    expect(participation).toMatch(
      /REQUEST_STATES = \[\s*'created', 'sent', 'opened', 'recording', 'submitted',\s*'received', 'reviewed', 'accepted', 'rejected', 'attached',\s*\] as const;/);
    /*
     * And no campaign state has leaked into its table — except
     * the four words the two machines genuinely share. `draft`
     * is not in `REQUEST_STATES` either, but `submitted` and
     * `review` are ordinary English about a take and about a
     * call both, which is why this looks for the campaign's own.
     */
    for (const state of CAMPAIGN_STATES) {
      if ((REQUEST_WORDS as readonly string[]).includes(state)) continue;
      expect(participation.match(
        new RegExp(`REQUEST_NEXT[\\s\\S]*?'${state}'[\\s\\S]*?\\n\\};`)))
        .toBeNull();
    }
    /* The one thing it gained is one optional field. */
    expect(participation).toMatch(/campaign\?: Id<'camp'>;/);
  });

  /*
   * `closing` RETURNS TO `live`, because the only thing that makes
   * a call closing is how much of its window is left — and an
   * organiser who extends the deadline has a live call again.
   */
  it('lets a call come back out of its last stretch, and nothing else', () => {
    expect(CAMPAIGN_NEXT.closing).toContain('live');
    expect(mayMoveCampaign('closing', 'live')).toBe(true);
    /* But entries never reopen once judging has seen the field. */
    expect(mayMoveCampaign('judging', 'live')).toBe(false);
    expect(mayMoveCampaign('judging', 'closing')).toBe(false);
    expect(mayMoveCampaign('results', 'judging')).toBe(false);
  });

  /* `completed` is the one end, and it is a real one. */
  it('ends once, and the end is an end', () => {
    expect(CAMPAIGN_NEXT.completed).toEqual([]);
    for (const state of CAMPAIGN_STATES) {
      expect(mayMoveCampaign('completed', state)).toBe(false);
    }
  });

  /* A table is only readable if every row is reachable. */
  it('has a row for every state and no state without a row', () => {
    expect(Object.keys(CAMPAIGN_NEXT).sort()).toEqual([...CAMPAIGN_STATES].sort());
    const reachable = new Set(Object.values(CAMPAIGN_NEXT).flat());
    for (const state of CAMPAIGN_STATES) {
      /* The two places a call can be created, on the two kinds
         of installation there are. [GO-VIRAL V-8] */
      if (state === 'scheduled' || state === 'draft') continue;
      expect(reachable.has(state), state).toBe(true);
    }
  });
});

describe('opening a call', () => {
  it('starts scheduled, whatever the clock says', () => {
    const one = call();
    expect(one.state).toBe('scheduled');
    expect(one.history).toEqual([{ state: 'scheduled', at: '2026-05-20T10:00:00.000Z' }]);
  });

  /*
   * A WINDOW IS REQUIRED, which is the difference between a
   * campaign and the availability it is built on. V-1 made the
   * two fields optional because every published item on disk has
   * neither; a CALL with no closing time is the thing V-1's own
   * argument says cannot be judged.
   */
  it('refuses a call with no closing time', () => {
    expect(() => newCampaign({
      title: 'x', track: { kind: 'performance', id: 'p' },
      rules: { asks: 'sing' },
      window: { respondable: true, access: 'anyone', opensAt: OPENS },
      now: BEFORE,
    })).toThrow(/when it closes/);
  });

  /* And refuses the windows V-1 refuses, in V-1's own words. */
  it('refuses a window V-1 would refuse, with its reason', () => {
    expect(() => newCampaign({
      title: 'x', track: { kind: 'performance', id: 'p' },
      rules: { asks: 'sing' },
      window: { respondable: true, opensAt: CLOSES, closesAt: OPENS },
      now: BEFORE,
    })).toThrow(/cannot close before it opens/);
  });

  it('refuses a call with no name and one that asks for nothing', () => {
    const base = {
      track: { kind: 'performance' as const, id: 'p' },
      window: { respondable: true, opensAt: OPENS, closesAt: CLOSES },
      now: BEFORE,
    };
    expect(() => newCampaign({ ...base, title: '  ', rules: { asks: 'sing' } }))
      .toThrow(CampaignError);
    expect(() => newCampaign({ ...base, title: 'x', rules: { asks: '  ' } }))
      .toThrow(/what is being asked for/);
  });

  /*
   * A LAST STRETCH LONGER THAN THE CALL is a call that is closing
   * from the moment it opens, which is a countdown nobody
   * believes.
   */
  it('refuses a last stretch longer than the call', () => {
    expect(() => newCampaign({
      title: 'x', track: { kind: 'performance', id: 'p' },
      rules: { asks: 'sing' },
      window: { respondable: true, opensAt: OPENS, closesAt: CLOSES },
      closingMinutes: 60 * 24 * 30,
      now: BEFORE,
    })).toThrow(/longer than the call/);
  });

  /* A day, which is the shape of most of them. */
  it('closes over a day unless the organiser says otherwise', () => {
    expect(closingMinutesOf(call())).toBe(CLOSING_BY_DEFAULT);
    expect(closingMinutesOf(call({ closingMinutes: 60 }))).toBe(60);
    /* And a number that is not one is the default, not a crash. */
    expect(closingMinutesOf({ ...call(), closingMinutes: -1 }))
      .toBe(CLOSING_BY_DEFAULT);
    expect(closingMinutesOf({ ...call(), closingMinutes: 1.5 }))
      .toBe(CLOSING_BY_DEFAULT);
  });

  /* The organiser's words are theirs, trimmed and bounded. */
  it('keeps the organiser’s words, bounded', () => {
    const one = newCampaign({
      title: ` ${'t'.repeat(400)} `,
      track: { kind: 'channel', id: 'chan_1' },
      rules: {
        asks: ' sing ', criteria: ' in tune ', prize: ' a guitar ',
      },
      window: { respondable: true, opensAt: OPENS, closesAt: CLOSES },
      now: BEFORE,
    });
    expect(one.title).toHaveLength(120);
    expect(one.rules).toEqual({ asks: 'sing', criteria: 'in tune', prize: 'a guitar' });
    /* Blank is absent, not an empty string somebody later prints. */
    expect(newCampaign({
      title: 'x', track: { kind: 'channel', id: 'c' },
      rules: { asks: 'sing', criteria: '  ', prize: '' },
      window: { respondable: true, opensAt: OPENS, closesAt: CLOSES },
      now: BEFORE,
    }).rules.criteria).toBeUndefined();
  });
});

describe('two answers, and they disagree on purpose', () => {
  /*
   * `state` IS WHERE SOMEBODY MOVED IT; `clockSays` IS WHERE ITS
   * WINDOW SAYS IT SHOULD BE. A surface showing only the first
   * says LIVE about a call that shut an hour ago; one showing
   * only the second cannot tell JUDGING from RESULTS, because the
   * clock has nothing to say about either.
   */
  it('reads the window without reading the state', () => {
    const one = call();
    expect(clockSays(one, BEFORE)).toBe('scheduled');
    expect(clockSays(one, DURING)).toBe('live');
    expect(clockSays(one, LAST)).toBe('closing');
    expect(clockSays(one, AFTER)).toBe('over');
    /* And the state has not moved at all. */
    expect(one.state).toBe('scheduled');
  });

  /* The last stretch is the organiser's length, not a constant. */
  it('measures the last stretch from the organiser’s own number', () => {
    const hour = call({ closingMinutes: 60 });
    expect(clockSays(hour, LAST)).toBe('live');
    expect(clockSays(hour, '2026-06-08T16:30:00.000Z')).toBe('closing');
  });

  /*
   * A CLOCK THAT CANNOT BE READ DOES NOT SHUT THE CALL, which is
   * V-1's decision about an unreadable date and is taken here for
   * its reason.
   */
  it('does not close a call because the clock is unreadable', () => {
    expect(clockSays(call(), 'not a time')).toBe('live');
  });

  /* And a call with no opening time is open from the beginning. */
  it('is live from the beginning where no opening was named', () => {
    const one = newCampaign({
      title: 'x', track: { kind: 'performance', id: 'p' },
      rules: { asks: 'sing' },
      window: { respondable: true, closesAt: CLOSES },
      now: BEFORE,
    });
    expect(clockSays(one, BEFORE)).toBe('live');
  });
});

describe('taking entries', () => {
  /*
   * BOTH HALVES HAVE TO AGREE. A call whose window is open but
   * which has been moved to JUDGING is shut — a judge looking at
   * the field must not have an entry arrive behind them. A call
   * in LIVE whose window has closed is shut too, which is the
   * ordinary case: nobody presses a button at midnight.
   */
  it('needs the state and the window to agree', () => {
    expect(takingEntries(at('live'), DURING)).toBe(true);
    expect(takingEntries(at('live'), AFTER)).toBe(false);
    expect(takingEntries(at('scheduled'), DURING)).toBe(false);
    expect(takingEntries(at('judging'), DURING)).toBe(false);
    expect(takingEntries(at('completed'), DURING)).toBe(false);
  });

  /* A call in its last stretch is still taking them. */
  it('still takes them in the last stretch', () => {
    expect(takingEntries(at('closing'), LAST)).toBe(true);
  });
});

describe('judging', () => {
  /*
   * NOT WHILE THE WINDOW IS OPEN, which is V-2's own judging
   * criterion and the one rule a competition cannot bend: a panel
   * that starts while entries are still arriving is judging a
   * different field from the one that entered.
   */
  it('cannot start while the call is still taking entries', () => {
    const one = at('live');
    expect(mayJudge(one, DURING)).toBe(false);
    expect(() => beginJudging(one, DURING)).toThrow(/still taking entries/);
    expect(one.state).toBe('live');
  });

  /*
   * AND `mayJudge` IS THE PREDICATE A SURFACE ASKS, so it has to
   * answer for the state as well as the clock on its own. A
   * button offered on a scheduled call whose window has passed is
   * a button that refuses the person who presses it — and the
   * state machine catching it afterwards is not the same as not
   * offering it.
   */
  it('answers for the state too, not only the clock', () => {
    expect(mayJudge(at('scheduled'), AFTER)).toBe(false);
    expect(mayJudge(at('judging'), AFTER)).toBe(false);
    expect(mayJudge(at('results'), AFTER)).toBe(false);
    expect(mayJudge(at('completed'), AFTER)).toBe(false);
    /* Only the two that are taking entries can stop taking them. */
    expect(mayJudge(at('live'), AFTER)).toBe(true);
    expect(mayJudge(at('closing'), AFTER)).toBe(true);
  });

  it('starts once the window has shut', () => {
    const one = at('live');
    expect(mayJudge(one, AFTER)).toBe(true);
    beginJudging(one, AFTER, 'the organiser');
    expect(one.state).toBe('judging');
    expect(one.history.at(-1)).toEqual({
      state: 'judging', at: AFTER, by: 'the organiser',
    });
  });

  it('starts from the last stretch too', () => {
    const one = at('closing');
    beginJudging(one, AFTER);
    expect(one.state).toBe('judging');
  });

  it('cannot start twice, or from an end', () => {
    expect(() => beginJudging(at('judging'), AFTER)).toThrow(CampaignError);
    expect(() => beginJudging(at('completed'), AFTER)).toThrow(CampaignError);
  });
});

describe('the clock and the state are kept together', () => {
  /*
   * AN ORGANISER WHO COULD PUT A CALL LIVE EARLY would have a
   * window that says one thing and a door that does another, and
   * the listing draws the window.
   */
  it('will not open a call before its window does', () => {
    expect(() => begin(call(), BEFORE)).toThrow(/does not open yet/);
    expect(() => begin(call(), AFTER)).toThrow(/already closed/);
  });

  /*
   * CLOSING IS A FACT ABOUT THE CLOCK AND NOT A MOOD. A call
   * marked closing with a week to run is a countdown nobody
   * believes the second time.
   */
  it('will not call it the last stretch before it is', () => {
    const one = at('live');
    expect(() => enterLastStretch(one, DURING)).toThrow(/not in its last stretch/);
    enterLastStretch(one, LAST);
    expect(one.state).toBe('closing');
  });

  it('will not take it out of the last stretch while it is in one', () => {
    const one = at('closing');
    expect(() => reopenToLive(one, LAST)).toThrow(/still in its last stretch/);
  });

  /*
   * AND MOVING THE DEADLINE MOVES THE STATE WITH IT. The two
   * answers must not be left to drift apart by the one change
   * that is about exactly the thing they disagree on.
   */
  it('follows the deadline when the deadline moves', () => {
    const one = at('closing');
    expect(one.state).toBe('closing');
    moveDeadline(one, '2026-07-01T17:00:00.000Z', LAST, 'the organiser');
    expect(one.state).toBe('live');
    expect(one.window.closesAt).toBe('2026-07-01T17:00:00.000Z');

    /* And back the other way. */
    const two = at('live');
    moveDeadline(two, '2026-06-03T18:00:00.000Z', DURING);
    expect(two.state).toBe('closing');
  });

  /*
   * NOT AFTER THE JUDGES HAVE SEEN THE FIELD. Extending a call
   * then would let somebody enter knowing what they are
   * competing against.
   */
  it('refuses to move a deadline once judging has begun', () => {
    expect(() => moveDeadline(at('judging'), '2026-07-01T17:00:00.000Z', AFTER))
      .toThrow(/no longer taking entries/);
  });

  it('refuses a deadline that is not a date', () => {
    expect(() => moveDeadline(at('live'), 'next Thursday', DURING))
      .toThrow(/not a date/);
  });
});

describe('every move is written down', () => {
  it('refuses a move the table does not allow, rather than ignoring it', () => {
    const one = call();
    expect(() => advanceCampaign(one, 'judging', DURING))
      .toThrow(/a scheduled call cannot become judging/);
    expect(one.state).toBe('scheduled');
    expect(one.history).toHaveLength(1);
  });

  it('keeps the whole walk, in order', () => {
    const one = at('completed');
    expect(one.history.map((row) => row.state)).toEqual([
      'scheduled', 'live', 'judging', 'results', 'completed',
    ]);
  });
});

describe('which call a request belongs to', () => {
  const other = () => newCampaign({
    title: 'Another call', track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'sing differently' },
    window: { respondable: true, access: 'anyone', opensAt: OPENS, closesAt: CLOSES },
    now: BEFORE,
  });

  it('is the one that is taking entries', () => {
    const live = at('live');
    expect(callFor([live], { kind: 'performance', id: 'perf_one' }, DURING))
      .toBe(live);
  });

  it('is nothing where the call is not open', () => {
    expect(callFor([at('scheduled')], { kind: 'performance', id: 'perf_one' }, DURING))
      .toBeNull();
    expect(callFor([at('live')], { kind: 'performance', id: 'perf_one' }, AFTER))
      .toBeNull();
  });

  it('is nothing for a different document', () => {
    expect(callFor([at('live')], { kind: 'performance', id: 'perf_two' }, DURING))
      .toBeNull();
    expect(callFor([at('live')], { kind: 'channel', id: 'perf_one' }, DURING))
      .toBeNull();
  });

  /*
   * WITH TWO LIVE, A STRANGER PRESSING "TAKE THIS SONG" HAS NOT
   * CHOSEN. The generic door names a document, not a call, and
   * guessing would put somebody's entry in a competition they
   * never read the rules of. [GO-VIRAL §3]
   */
  it('is nothing when two calls are open on one track', () => {
    const one = at('live');
    const two = other();
    begin(two, DURING);
    expect(callFor([one, two], { kind: 'performance', id: 'perf_one' }, DURING))
      .toBeNull();
  });
});

describe('what the inbox is looking at', () => {
  const entry = (id: string, campaign?: string) => ({
    id, ...(campaign ? { campaign: campaign as `camp_${string}` } : {}),
  });

  /*
   * A PRODUCER WHO OPENED A CALL TO THE PUBLIC HAS ONE THING TO
   * THINK ABOUT AND A HUNDRED THINGS TO LOOK AT. The same failure
   * B-3 found one layer down.
   */
  it('shows a hundred answers as one call', () => {
    const many = Array.from({ length: 100 }, (_one, n) => entry(`r${n}`, 'camp_x'));
    const groups = entriesIn(many);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.campaign).toBe('camp_x');
    expect(groups[0]!.requests).toHaveLength(100);
  });

  /*
   * AND A REQUEST ANSWERING NO CALL IS A GROUP OF ONE, not a
   * special case — which is every request this product has ever
   * issued.
   */
  it('leaves a request answering nothing exactly as it was', () => {
    expect(entriesIn([entry('a'), entry('b')]).map((g) => g.requests.map((r) => r.id)))
      .toEqual([['a'], ['b']]);
  });

  /*
   * ORDER IS THE ORDER THINGS CAME IN, with a call standing where
   * its FIRST answer stood: a producer who looked away must not
   * find the list reshuffled because the ninety-ninth arrived.
   */
  it('keeps a call where its first answer was', () => {
    const groups = entriesIn([
      entry('early'), entry('c1', 'camp_x'), entry('late'), entry('c2', 'camp_x'),
    ]);
    expect(groups.map((g) => g.requests.map((r) => r.id)))
      .toEqual([['early'], ['c1', 'c2'], ['late']]);
  });

  it('keeps two calls apart', () => {
    expect(entriesIn([
      entry('a1', 'camp_a'), entry('b1', 'camp_b'), entry('a2', 'camp_a'),
    ]).map((g) => [g.campaign, g.requests.length]))
      .toEqual([['camp_a', 2], ['camp_b', 1]]);
  });
});

describe('what a person is told', () => {
  it('says where each call has got to', () => {
    expect(campaignSays(at('scheduled'), BEFORE)).toMatch(/Not open yet/);
    expect(campaignSays(at('live'), DURING)).toMatch(/Open for takes/);
    expect(campaignSays(at('closing'), LAST)).toMatch(/last stretch/);
    expect(campaignSays(at('judging'), AFTER)).toMatch(/Being judged/);
    expect(campaignSays(at('results'), AFTER)).toMatch(/results are in/);
    expect(campaignSays(at('completed'), AFTER)).toMatch(/Over/);
  });

  /*
   * AND IT DOES NOT SAY "OPEN FOR TAKES" ABOUT A CALL WHOSE
   * WINDOW HAS SHUT. The state has not moved because nobody
   * pressed a button at midnight, and the sentence is read by
   * somebody deciding whether to record.
   */
  it('does not call a call open after its deadline', () => {
    expect(campaignSays(at('live'), AFTER)).toMatch(/deadline has passed/);
    expect(campaignSays(at('closing'), AFTER)).toMatch(/deadline has passed/);
  });

  it('says six different things', () => {
    const said = CAMPAIGN_STATES.map((state) => campaignSays(at(state), DURING));
    expect(new Set(said).size).toBe(6);
  });
});
