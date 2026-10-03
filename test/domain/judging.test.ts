/**
 * Judging is people, and every score carries its reason.
 *   [GO-VIRAL V-5; Doctrine U-15, D-19]
 *
 * > **Judged on:** *"The result recomputes exactly from the stored
 * > judgements; no score exists without a reason; and a criterion
 * > cannot be added after LIVE."*
 *
 * THE THIRD CLAUSE IS THE ONE WITH ARITHMETIC BEHIND IT. Every
 * total in a result is out of the sum of the criteria, so adding
 * one after entries exist does not merely change the rules — it
 * silently re-scales every judgement already made. The test for
 * it is at the state boundary, not near it.
 *
 * AND `takeRanking` IS NOT IMPORTED HERE, in either direction.
 * *"A panel handed a machine's score has been anchored by a
 * measurement that cannot hear."*
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type Campaign, beingJudged, judgementsOf, panelOf, scorecardOf,
} from '../../src/domain/campaign.js';
import {
  CampaignError, addCriterion, addJudge, begin, beginJudging, announce,
  newCampaign, recordJudgement, removeCriterion,
} from '../../src/domain/campaignEdit.js';
import {
  MARK_OUT_OF, type Criterion, type Judgement, judgementProblem, resultsFor,
  verdictSays,
} from '../../src/domain/judging.js';

const OPENED = '2026-06-01T09:00:00.000Z';
const CLOSED = '2026-07-01T09:00:00.000Z';
const NOW = '2026-06-02T09:00:00.000Z';
const AFTER = '2026-07-02T09:00:00.000Z';

function aCall(): Campaign {
  return newCampaign({
    title: 'Sing the second verse',
    track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'Sing it outdoors', criteria: 'Tuning, feel, and whether it sounds like you' },
    window: { respondable: true, access: 'anyone', opensAt: OPENED, closesAt: CLOSED },
    now: OPENED,
  });
}

/** A call being judged, with two criteria and two judges. */
function aPanel(): {
  call: Campaign; tuning: Criterion; feel: Criterion; ada: string; ben: string;
} {
  const call = aCall();
  const tuning = addCriterion(call, 'Tuning');
  const feel = addCriterion(call, 'Feel', 5);
  begin(call, NOW);
  const ada = addJudge(call, 'Ada').id;
  const ben = addJudge(call, 'Ben').id;
  beginJudging(call, AFTER);
  return { call, tuning, feel, ada, ben };
}

const mark = (criterion: Criterion, score: number) => ({ criterion: criterion.id, score });

describe('what a call is marked on', () => {
  it('starts empty, which is a call judged by somebody\'s eye', () => {
    const call = aCall();
    expect(scorecardOf(call)).toEqual([]);
    expect(call.scorecard).toBeUndefined();
  });

  it('is published out of ten unless the organiser says otherwise', () => {
    const call = aCall();
    expect(addCriterion(call, 'Tuning').outOf).toBe(MARK_OUT_OF);
    expect(addCriterion(call, 'Feel', 5).outOf).toBe(5);
    expect(scorecardOf(call).map((one) => one.says)).toEqual(['Tuning', 'Feel']);
  });

  it('refuses a criterion with no wording, or a scale that is not one', () => {
    const call = aCall();
    expect(() => addCriterion(call, '  ')).toThrow(CampaignError);
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => addCriterion(call, 'Tuning', bad), String(bad))
        .toThrow(CampaignError);
    }
    expect(scorecardOf(call)).toEqual([]);
  });

  /*
   * THE THIRD JUDGING CLAUSE, AT THE BOUNDARY AND NOT NEAR IT.
   * Scheduled is the last moment; LIVE is the first refusal. A
   * fixture that only tried during JUDGING would pass a guard
   * written for the wrong state.
   */
  it('cannot be added once the call has opened', () => {
    const call = aCall();
    addCriterion(call, 'Tuning');
    begin(call, NOW);
    expect(() => addCriterion(call, 'Feel')).toThrow(CampaignError);
    expect(() => removeCriterion(call, scorecardOf(call)[0]!.id))
      .toThrow(CampaignError);
    expect(scorecardOf(call).map((one) => one.says)).toEqual(['Tuning']);
  });

  it('can be taken off again while it is still a draft', () => {
    const call = aCall();
    const tuning = addCriterion(call, 'Tuning');
    addCriterion(call, 'Feel');
    removeCriterion(call, tuning.id);
    expect(scorecardOf(call).map((one) => one.says)).toEqual(['Feel']);
    expect(() => removeCriterion(call, tuning.id)).toThrow(CampaignError);
  });

  /* And the paragraph an entrant reads is a different field. */
  it('leaves the published paragraph alone', () => {
    const call = aCall();
    addCriterion(call, 'Tuning');
    expect(call.rules.criteria).toContain('Tuning, feel, and whether');
  });
});

describe('who marks', () => {
  it('is nobody until somebody is named', () => {
    expect(panelOf(aCall())).toEqual([]);
  });

  it('may be named while the call is running', () => {
    const call = aCall();
    begin(call, NOW);
    expect(addJudge(call, 'Ada').name).toBe('Ada');
    beginJudging(call, AFTER);
    expect(addJudge(call, 'Ben').name).toBe('Ben');
    expect(panelOf(call).map((one) => one.name)).toEqual(['Ada', 'Ben']);
  });

  /*
   * AND NOT ONCE THE RESULT IS OUT. A judgement recorded then
   * would change a standing people have already read.
   */
  it('cannot be named once the result is announced', () => {
    const { call } = aPanel();
    announce(call, AFTER);
    expect(() => addJudge(call, 'Cleo')).toThrow(CampaignError);
  });

  it('refuses a judge with no name', () => {
    expect(() => addJudge(aCall(), '   ')).toThrow(CampaignError);
  });
});

describe('why a judgement cannot be recorded', () => {
  const { call, tuning, feel, ada } = aPanel();
  const good = {
    criteria: scorecardOf(call), panel: panelOf(call), by: ada,
    marks: [mark(tuning, 8), mark(feel, 4)], says: 'In tune and it moved.',
  };

  it('is nothing when it is right', () => {
    expect(judgementProblem(good)).toBe('');
  });

  it('refuses a call with nothing published to mark against', () => {
    expect(judgementProblem({ ...good, criteria: [] }))
      .toBe('this call has nothing published to mark against');
  });

  it('refuses somebody who is not on the panel', () => {
    expect(judgementProblem({ ...good, by: 'judge_nobody' }))
      .toContain('not somebody on this call\'s panel');
  });

  /* The second judging clause: no score exists without a reason. */
  it('refuses a score with no reason', () => {
    expect(judgementProblem({ ...good, says: '   ' }))
      .toBe('a score without a reason is not a judgement');
  });

  /*
   * EVERY CRITERION, EXACTLY ONCE. A judgement missing a mark is
   * a judgement of a different competition from the one beside
   * it, and a mean of the two compares a total out of fifteen
   * with a total out of ten.
   */
  it('refuses a form that misses one', () => {
    expect(judgementProblem({ ...good, marks: [mark(tuning, 8)] }))
      .toBe('every criterion has to be marked');
  });

  it('refuses one marked twice', () => {
    expect(judgementProblem({
      ...good, marks: [mark(tuning, 8), mark(tuning, 2)],
    })).toBe('that criterion was marked twice');
  });

  it('refuses a criterion this call does not have', () => {
    expect(judgementProblem({
      ...good,
      marks: [mark(tuning, 8), { criterion: 'crit_elsewhere' as never, score: 1 }],
    })).toContain('not one of this call\'s criteria');
  });

  /*
   * AND THE SCALE IS THE CRITERION'S OWN, which is why the
   * fixture has two different ones: a bound read off the first
   * criterion would let 8 through on a criterion marked out of 5.
   */
  it('refuses a mark outside that criterion\'s own scale', () => {
    expect(judgementProblem({ ...good, marks: [mark(tuning, 8), mark(feel, 6)] }))
      .toBe('Feel is marked out of 5');
    expect(judgementProblem({ ...good, marks: [mark(tuning, 11), mark(feel, 4)] }))
      .toBe('Tuning is marked out of 10');
    expect(judgementProblem({ ...good, marks: [mark(tuning, -1), mark(feel, 4)] }))
      .toBe('Tuning is marked out of 10');
    expect(judgementProblem({ ...good, marks: [mark(tuning, NaN), mark(feel, 4)] }))
      .toBe('Tuning is marked out of 10');
  });

  /* And the top of the scale is in it, which is where a limit is tested. */
  it('takes the top mark and the bottom one', () => {
    expect(judgementProblem({ ...good, marks: [mark(tuning, 10), mark(feel, 5)] }))
      .toBe('');
    expect(judgementProblem({ ...good, marks: [mark(tuning, 0), mark(feel, 0)] }))
      .toBe('');
  });
});

describe('recording one', () => {
  it('is refused unless the call is being judged', () => {
    const call = aCall();
    const tuning = addCriterion(call, 'Tuning');
    begin(call, NOW);
    const ada = addJudge(call, 'Ada').id;
    expect(() => recordJudgement(call, {
      entry: 'sub_1', by: ada, marks: [mark(tuning, 8)], says: 'good', now: NOW,
    })).toThrow(CampaignError);
    expect(judgementsOf(call)).toEqual([]);
    expect(beingJudged(call)).toBe(false);
  });

  it('writes the marks, the reason and who said it', () => {
    const { call, tuning, feel, ada } = aPanel();
    const made = recordJudgement(call, {
      entry: 'sub_1', by: ada, marks: [mark(tuning, 8), mark(feel, 4)],
      says: '  In tune and it moved.  ', now: AFTER,
    });
    expect(made.says).toBe('In tune and it moved.');
    expect(made.by).toBe(ada);
    expect(made.at).toBe(AFTER);
    expect(judgementsOf(call)).toHaveLength(1);
  });

  /*
   * A JUDGE MAY CORRECT THEIR OWN MARK AND IT REPLACES. The
   * alternative is one judge's opinion counted twice in the mean.
   */
  it('replaces that judge\'s own earlier mark on the same entry', () => {
    const { call, tuning, feel, ada, ben } = aPanel();
    const spec = { entry: 'sub_1', marks: [mark(tuning, 2), mark(feel, 1)], now: AFTER };
    recordJudgement(call, { ...spec, by: ada, says: 'first thoughts' });
    recordJudgement(call, {
      ...spec, by: ada, marks: [mark(tuning, 9), mark(feel, 5)],
      says: 'listened again',
    });
    recordJudgement(call, { ...spec, by: ben, says: 'ben thinks' });

    expect(judgementsOf(call)).toHaveLength(2);
    const mine = judgementsOf(call).filter((one) => one.by === ada);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.says).toBe('listened again');
  });

  /* And a second entry by the same judge is a second judgement. */
  it('keeps one judgement per judge per entry', () => {
    const { call, tuning, feel, ada } = aPanel();
    for (const entry of ['sub_1', 'sub_2']) {
      recordJudgement(call, {
        entry, by: ada, marks: [mark(tuning, 7), mark(feel, 3)],
        says: 'said something', now: AFTER,
      });
    }
    expect(judgementsOf(call)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ *
 *  THE FIRST JUDGING CLAUSE.
 * ------------------------------------------------------------------ */

describe('what it adds up to', () => {
  const tuning = { id: 'crit_t' as never, says: 'Tuning', outOf: 10 };
  const feel = { id: 'crit_f' as never, says: 'Feel', outOf: 5 };
  const criteria = [tuning, feel];

  const judgement = (
    entry: string, by: string, t: number, f: number, says = 'because',
  ): Judgement => ({
    id: `judg_${entry}_${by}` as never,
    entry,
    by: by as never,
    at: AFTER,
    marks: [{ criterion: tuning.id, score: t }, { criterion: feel.id, score: f }],
    says,
  });

  it('is nothing where nobody marked anything', () => {
    expect(resultsFor(criteria, [])).toEqual([]);
  });

  /*
   * THE MEAN OF THE JUDGES AND NOT THE SUM, which is the one
   * decision in this function. The fixture is built so the two
   * disagree: `sub_a` is marked by two judges and `sub_b` by one
   * with a higher total, so a sum would rank them the other way.
   */
  it('averages the judges rather than adding them up', () => {
    const results = resultsFor(criteria, [
      judgement('sub_a', 'judge_ada', 10, 5),
      judgement('sub_a', 'judge_ben', 8, 3),
      judgement('sub_b', 'judge_ada', 9, 5),
    ]);
    expect(results.map((one) => one.entry)).toEqual(['sub_b', 'sub_a']);
    expect(results[0]!.score).toBe(14);
    expect(results[0]!.judges).toBe(1);
    expect(results[1]!.score).toBe(13);
    expect(results[1]!.judges).toBe(2);
    expect(results[0]!.outOf).toBe(15);
  });

  it('breaks the standing down by criterion, in the published order', () => {
    const [verdict] = resultsFor(criteria, [
      judgement('sub_a', 'judge_ada', 10, 5),
      judgement('sub_a', 'judge_ben', 7, 2),
    ]);
    expect(verdict!.byCriterion).toEqual([
      { criterion: tuning.id, says: 'Tuning', score: 8.5 },
      { criterion: feel.id, says: 'Feel', score: 3.5 },
    ]);
  });

  /* Every reason, in the order they were given. A result is words. */
  it('carries every reason', () => {
    const [verdict] = resultsFor(criteria, [
      judgement('sub_a', 'judge_ada', 10, 5, 'extraordinary'),
      judgement('sub_a', 'judge_ben', 7, 2, 'flat in the chorus'),
    ]);
    expect(verdict!.says).toEqual(['extraordinary', 'flat in the chorus']);
  });

  /*
   * ROUNDED TO ONE PLACE, because it is printed. Three judges
   * totalling 22 is 7.333… and nobody reads that.
   */
  it('rounds a mean to one place', () => {
    const [verdict] = resultsFor(criteria, [
      judgement('sub_a', 'judge_a', 8, 0),
      judgement('sub_a', 'judge_b', 7, 0),
      judgement('sub_a', 'judge_c', 7, 0),
    ]);
    expect(verdict!.score).toBe(7.3);
  });

  /*
   * TIES KEEP THE ORDER THEY ARRIVED IN. Inventing a tiebreak —
   * earlier, longer, more judges — would be this module having an
   * opinion about a competition it is not judging.
   */
  it('leaves equals in the order they were entered', () => {
    const results = resultsFor(criteria, [
      judgement('sub_first', 'judge_a', 5, 2),
      judgement('sub_second', 'judge_a', 5, 2),
    ]);
    expect(results.map((one) => one.entry)).toEqual(['sub_first', 'sub_second']);
    expect(results[0]!.score).toBe(results[1]!.score);
  });

  /*
   * THE FIRST JUDGING CLAUSE, DRIVEN. *"The result recomputes
   * exactly from the stored judgements."* Not *a stored result
   * matches* — there is no stored result, and this asserts that
   * the same judgements produce the same standing and that
   * changing one moves it.
   */
  it('recomputes exactly, and moves when a mark is corrected', () => {
    const given = [
      judgement('sub_a', 'judge_ada', 6, 2),
      judgement('sub_b', 'judge_ada', 7, 2),
    ];
    expect(resultsFor(criteria, given)).toEqual(resultsFor(criteria, given));
    expect(resultsFor(criteria, given).map((one) => one.entry))
      .toEqual(['sub_b', 'sub_a']);

    const corrected = [judgement('sub_a', 'judge_ada', 10, 5), given[1]!];
    expect(resultsFor(criteria, corrected).map((one) => one.entry))
      .toEqual(['sub_a', 'sub_b']);
  });

  it('says what a standing is, in one line', () => {
    const [one] = resultsFor(criteria, [judgement('sub_a', 'judge_a', 8, 4)]);
    expect(verdictSays(one!)).toBe('12 out of 15, from 1 judge.');
    const [two] = resultsFor(criteria, [
      judgement('sub_a', 'judge_a', 8, 4), judgement('sub_a', 'judge_b', 8, 4),
    ]);
    expect(verdictSays(two!)).toBe('12 out of 15, from 2 judges.');
  });
});

/* ------------------------------------------------------------------ *
 *  THE ONE THING THIS STAGE MUST NOT TOUCH.
 * ------------------------------------------------------------------ */

describe('the machine that ranks takes', () => {
  const ROOT = join(import.meta.dirname, '..', '..');
  const read = (...where: string[]) => readFileSync(join(ROOT, ...where), 'utf8');

  /*
   * **MUST NOT TOUCH.** *"`takeRanking.ts`, in either direction.
   * It must not score people, and judging must not seed itself
   * from it: a panel handed a machine's number has been anchored
   * by a measurement that cannot hear."*
   *
   * BOTH DIRECTIONS, AND THEY FAIL DIFFERENTLY. `takeRanking`
   * reaching into judging would be a measurement given authority
   * over people; judging reaching into `takeRanking` would be a
   * panel shown a number before it listened. The second is the
   * likelier mistake and the quieter one.
   *
   * EVERY FILE OF THE STAGE, DERIVED. Naming three by hand would
   * pass the moment a fourth was added — which is the failure
   * the import-graph guard was rewritten over. [V-3]
   */
  it('is not reached by anything that judges people', () => {
    const mine = [
      join('src', 'domain', 'judging.ts'),
      join('src', 'domain', 'campaignEdit.ts'),
      join('src', 'domain', 'campaign.ts'),
      ...readdirSync(join(ROOT, 'app', 'calls'), { withFileTypes: true })
        .filter((one) => one.isFile() && one.name.endsWith('.tsx'))
        .map((one) => join('app', 'calls', one.name)),
      ...readdirSync(join(ROOT, 'app', 'api', 'campaigns'), { recursive: true })
        .filter((one) => String(one).endsWith('route.ts'))
        .map((one) => join('app', 'api', 'campaigns', String(one))),
    ];
    /* And the walk found the files it is about. [V-1] */
    expect(mine.length).toBeGreaterThanOrEqual(6);
    expect(mine.some((one) => one.endsWith('Desk.tsx'))).toBe(true);

    /*
     * IMPORTS AND NOT THE WORD, which this test learned by
     * failing on its own first draft: `judging.ts` NAMES
     * `takeRanking` in the paragraph explaining why it does not
     * use it, and a check for the string called that a
     * violation. A test that reads prose is a test of the prose.
     * [T-1]
     */
    const offenders = mine.filter(
      (one) => /from '[^']*takeRanking\.js'/.test(read(one)));
    expect(offenders,
      'a panel handed a machine\'s number has been anchored by a '
      + 'measurement that cannot hear').toEqual([]);
  });

  /* And it does not reach the other way either. */
  it('does not reach into judging', () => {
    const body = read('src', 'domain', 'takeRanking.ts');
    expect(body).not.toMatch(/from '[^']*(judging|campaign|campaignEdit)\.js'/);
    expect(body, 'and knows nothing of the nouns')
      .not.toMatch(/\bJudgement\b|\bVerdict\b|\bCriterion\b/);
  });
});
