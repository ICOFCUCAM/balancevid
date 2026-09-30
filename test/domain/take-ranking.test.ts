/**
 * Which take, over this stretch, and why.
 * [MASTER-EDIT §12 P3; Doctrine STUDIO-TWO §7, §8, U-02, U-15, INV-06, D-19]
 *
 * P3 had four partials left on it — automatic repair suggestions, best-take
 * suggestions, automatic audio cleanup, and an AI first cut. Measured
 * against the product they are ONE missing piece wearing four names: every
 * one is a sentence of the form "over this stretch, this take rather than
 * that one, because ___".
 *
 * WHAT IS PROVED HERE:
 *
 *   the ranking is over MEASURED facts and nothing else, and every score
 *   carries the reasons an author would check it by;
 *   a take that does not cover the stretch is not a candidate, and says so
 *   rather than being silently absent;
 *   the repair, the best-take and the first cut all read the SAME ranking,
 *   so no two surfaces can recommend different takes;
 *   the first cut PROPOSES and never writes, and is not offered over work
 *   that already exists;
 *   the cleanup advice never proposes the row with a known cost.
 */
import { describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type { ColourReading } from '../../src/domain/colour.js';
import { NO_CLEANUP, adviseCleanup } from '../../src/domain/cleanup.js';
import type {
  MasterTrack, Performance, PerformanceTake, RenderProblem,
} from '../../src/domain/performance.js';
import {
  effectiveOffset, orderedScenes, renderProblems,
} from '../../src/domain/performance.js';
import {
  addTake, newPerformance, nudgeTake, setScene,
} from '../../src/domain/performanceEdit.js';
import {
  bestTake, proposeFirstCut, rankTakes, repairsFor, scoreTake, worthProposing,
} from '../../src/domain/takeRanking.js';
import { secondsToSamples } from '../../src/domain/time.js';
import { SILENT_FLOOR_DB, parseAstats } from '../../src/render/ingest.js';

const AT = '2026-09-29T12:00:00.000Z';
const SONG = secondsToSamples(240);

function master(): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId,
    title: 'The Long Way Round', artist: 'The Author',
    class: 'own', durationSamples: SONG,
  };
}

function reading(over: Partial<ColourReading> = {}): ColourReading {
  return { y: 128, ySpread: 100, u: 128, v: 128, saturation: 40, frames: 30, ...over };
}

function take(id: string, over: Partial<PerformanceTake> = {}): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: `asset_${id}` as AssetId,
    label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    hasAudio: true,
    createdAt: AT,
    ...over,
  };
}

function performance(takes: PerformanceTake[]): Performance {
  const p = newPerformance('My Performance', master(), AT);
  for (const each of takes) addTake(p, each);
  return p;
}

const WHOLE: [number, number] = [0, SONG];

describe('scoring one take', () => {
  /*
   * `unplaced` IS THE ONLY BAD ANSWER, and the first version of this scored
   * it wrong. It rewarded `measured` alone — but `AlignmentMethod` says in
   * its own docstring that `calibrated` is better than measured, `heard` is
   * best, and `manual` "always wins, never overwritten". Only `unplaced` is
   * not a measurement: "it sits at zero because something has to, and zero
   * is not a measurement".
   */
  it('penalises a take nobody has placed, and nothing else', () => {
    const p = performance([
      take('placed'),
      take('adrift', {
        alignment: { offsetSamples: 0, rateRatio: 1, method: 'unplaced' },
      }),
    ]);
    const good = scoreTake(p, p.takes[0]!, ...WHOLE);
    const adrift = scoreTake(p, p.takes[1]!, ...WHOLE);
    expect(good.score).toBeGreaterThan(adrift.score);
    expect(adrift.says.join(' ')).toMatch(/nobody has placed it/);
  });

  it('does not penalise the methods that are better than measured', () => {
    const p = performance([
      take('measured'),
      take('calibrated', {
        alignment: { offsetSamples: 0, rateRatio: 1, method: 'calibrated' },
      }),
      take('heard', {
        alignment: { offsetSamples: 0, rateRatio: 1, method: 'heard' },
      }),
      take('manual', {
        alignment: { offsetSamples: 0, rateRatio: 1, method: 'manual' },
      }),
    ]);
    const scores = p.takes.map((each) => scoreTake(p, each, ...WHOLE));
    for (const entry of scores) {
      expect(entry.score, entry.label).toBe(scores[0]!.score);
      expect(entry.says.join(' '), entry.label).not.toMatch(/placed/);
    }
  });

  it('says when a take has no sound in it', () => {
    const p = performance([take('silent', { hasAudio: false })]);
    expect(scoreTake(p, p.takes[0]!, ...WHOLE).says.join(' '))
      .toMatch(/no sound in it/);
  });

  /*
   * CONTRAST AND EXPOSURE, AND NOTHING CLEVERER. These are the two things
   * a colour reading can honestly say about a picture. Anything further —
   * is it flattering, is it in focus — is not in the numbers, and
   * inventing it would be the ranking making things up.
   */
  it('prefers a picture with range in it', () => {
    const p = performance([
      take('open', { colour: reading({ ySpread: 110 }) }),
      take('flat', { colour: reading({ ySpread: 30 }) }),
    ]);
    const [first, second] = rankTakes(p, ...WHOLE);
    expect(first!.label).toBe('open');
    expect(second!.says.join(' ')).toMatch(/flat/);
  });

  it('notices a dark take and a nearly-clipped one', () => {
    const p = performance([
      take('dark', { colour: reading({ y: 40 }) }),
      take('hot', { colour: reading({ y: 220 }) }),
    ]);
    expect(scoreTake(p, p.takes[0]!, ...WHOLE).says.join(' ')).toMatch(/dark/);
    expect(scoreTake(p, p.takes[1]!, ...WHOLE).says.join(' ')).toMatch(/clipping/);
  });

  it('says when nothing has looked at the colour yet', () => {
    const p = performance([take('unknown')]);
    expect(scoreTake(p, p.takes[0]!, ...WHOLE).says.join(' '))
      .toMatch(/colour not measured/);
  });

  /*
   * A TAKE THAT DOES NOT REACH IS RETURNED, NOT FILTERED OUT. "This take
   * does not cover the chorus" is the most useful thing the list can tell
   * an author who was expecting it to.
   */
  it('keeps a take that does not reach, and says so', () => {
    const p = performance([
      take('short', { useToSample: secondsToSamples(30) }),
    ]);
    const entry = scoreTake(p, p.takes[0]!, ...WHOLE);
    expect(entry.covers).toBe(false);
    expect(entry.score).toBe(0);
    expect(entry.says.join(' ')).toMatch(/no picture from/);
  });

  /* Every score carries reasons, or the number is an oracle. [U-15] */
  it('never returns a score with nothing said about it', () => {
    const p = performance([take('plain', { colour: reading() })]);
    for (const entry of rankTakes(p, ...WHOLE)) {
      expect(entry.says.length, entry.label).toBeGreaterThan(0);
    }
  });

  /*
   * A RECOMMENDATION MADE ENTIRELY OF COMPLAINTS, which is what this
   * shipped as and what a screenshot caught: the interface prints the
   * take's name and then these lines, and every line it could print was
   * a FAULT. "Measures best here: Beach. dark." reads as an argument
   * against the take being recommended.
   *
   * Both of these are facts the reading already states and the score
   * already counts. Saying them changes no number.
   */
  it('says what recommends a take, not only what is wrong with it', () => {
    const p = performance([take('good', { colour: reading({ y: 128, ySpread: 110 }) })]);
    const said = scoreTake(p, p.takes[0]!, ...WHOLE).says.join(' · ');
    expect(said).toMatch(/plenty of contrast/);
    expect(said).toMatch(/well exposed/);
    expect(said).not.toMatch(/flat|dark|clipping/);
  });

  it('does not call a middling picture good', () => {
    const p = performance([take('middling', { colour: reading({ y: 168, ySpread: 65 }) })]);
    const said = scoreTake(p, p.takes[0]!, ...WHOLE).says.join(' · ');
    expect(said).not.toMatch(/plenty of contrast|well exposed/);
    expect(said).not.toMatch(/flat|dark|clipping/);
  });

  /*
   * "NOTHING MEASURED AGAINST IT" WAS ITS OWN OPPOSITE. It meant "no
   * measurement counts against this take" and read as "nothing was
   * measured", which is the one thing it is not: the colour reading is
   * there, it is unremarkable, and that is why the line is reached.
   */
  it('does not say a measured take was never measured', () => {
    const p = performance([take('middling', { colour: reading({ y: 168, ySpread: 65 }) })]);
    const said = scoreTake(p, p.takes[0]!, ...WHOLE).says.join(' · ');
    expect(said).toMatch(/nothing measured counts against it/);
    expect(said).not.toMatch(/colour not measured/);
  });
});

describe('the best take', () => {
  it('is the one that measures best and covers the stretch', () => {
    const p = performance([
      take('a', { colour: reading({ ySpread: 40 }) }),
      take('b', { colour: reading({ ySpread: 110 }) }),
    ]);
    expect(bestTake(p, ...WHOLE)?.label).toBe('b');
  });

  it('is nothing when nothing covers it', () => {
    const p = performance([take('short', { useToSample: secondsToSamples(10) })]);
    expect(bestTake(p, ...WHOLE)).toBeNull();
  });

  /*
   * THE SAME QUESTION ASKED TWICE GIVES THE SAME ANSWER. A ranking whose
   * order depends on which take was uploaded first is a ranking an author
   * cannot learn.
   */
  it('breaks a tie the same way every time', () => {
    const one = performance([take('zeta'), take('alpha')]);
    const other = performance([take('alpha'), take('zeta')]);
    expect(rankTakes(one, ...WHOLE).map((e) => e.label))
      .toEqual(rankTakes(other, ...WHOLE).map((e) => e.label));
    expect(bestTake(one, ...WHOLE)?.label).toBe('alpha');
  });
});

/*
 * ONE RANKING, FOUR CALLERS — which is the whole reason these four P3
 * partials are one change. A repair that recommends one take while the
 * scene beside it recommends another is two opinions in one product.
 */
describe('the repair reads the same ranking', () => {
  it('names which take, not merely how many', () => {
    const p = performance([
      take('grainy', { colour: reading({ ySpread: 30 }) }),
      take('clean', { colour: reading({ ySpread: 110 }) }),
    ]);
    /* A hole at the top: the first scene starts a minute in. */
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['clean'] });
    const gap = renderProblems(p).find((problem) => problem.kind === 'gap')!;
    const choose = repairsFor(p, gap).find((repair) => repair.id === 'choose')!;

    expect(choose.available).toBe(true);
    expect(choose.says).toMatch(/"clean" measures best/);
    /* And it agrees with what best-take would say on its own. */
    expect(bestTake(p, gap.fromSample!, gap.toSample!)?.label).toBe('clean');
  });

  it('still says nothing reaches when nothing does', () => {
    const p = performance([
      take('short', { useFromSample: secondsToSamples(120) }),
    ]);
    setScene(p, secondsToSamples(120),
      { layoutId: 'performance_full', takeIds: ['short'] });
    const gap = renderProblems(p).find((problem) => problem.kind === 'gap')!;
    const choose = repairsFor(p, gap).find((repair) => repair.id === 'choose')!;
    expect(choose.available).toBe(false);
    expect(choose.says).toMatch(/no take reaches/);
  });
});

describe('a first cut', () => {
  /*
   * A PROPOSAL AND NOT AN EDIT. The cut IS the authorship in this studio,
   * so an arrangement written into the document by a heuristic is the
   * machine editing somebody's performance. [U-15]
   */
  it('changes nothing about the performance', () => {
    const p = performance([take('a'), take('b')]);
    const was = JSON.stringify(p);
    const cut = proposeFirstCut(p);
    expect(cut.scenes.length).toBeGreaterThan(1);
    expect(JSON.stringify(p)).toBe(was);
    expect(orderedScenes(p)).toEqual([]);
  });

  it('alternates where there is anything to alternate with', () => {
    const cut = proposeFirstCut(performance([take('a'), take('b')]));
    for (let i = 1; i < cut.scenes.length; i += 1) {
      expect(cut.scenes[i]!.takeId, `section ${i}`)
        .not.toBe(cut.scenes[i - 1]!.takeId);
    }
  });

  it('uses the one take there is rather than refusing', () => {
    const cut = proposeFirstCut(performance([take('only')]));
    expect(cut.scenes.every((scene) => scene.takeId === 'only')).toBe(true);
  });

  it('covers the song end to end, with no gap between sections', () => {
    const cut = proposeFirstCut(performance([take('a'), take('b')]));
    expect(cut.scenes[0]!.fromSample).toBe(0);
    expect(cut.scenes[cut.scenes.length - 1]!.toSample).toBe(SONG);
    for (let i = 1; i < cut.scenes.length; i += 1) {
      expect(cut.scenes[i]!.fromSample).toBe(cut.scenes[i - 1]!.toSample);
    }
  });

  /*
   * ONLY AN ACCEPTED GRID COUNTS. A detected tempo is a suggestion until a
   * human says yes, and cutting on a period nobody confirmed is the
   * product acting on its own guess. [INV-06]
   */
  it('ignores a beat grid nobody has accepted, and says it divided evenly', () => {
    const p = performance([take('a'), take('b')]);
    p.beats = {
      bpm: 120, phaseSamples: 0, confidence: 0.9,
      detector: 'test', detectedAt: AT,
    };
    expect(proposeFirstCut(p).says).toMatch(/even sections/);

    p.beats.acceptedBy = 'the author';
    p.beats.acceptedAt = AT;
    expect(proposeFirstCut(p).says).toMatch(/beat grid you accepted/);
  });

  it('refuses, with the reason, when there is nothing to cut', () => {
    expect(proposeFirstCut(performance([])).refused).toMatch(/no takes/);
    const short = performance([
      take('short', { useToSample: secondsToSamples(1) }),
    ]);
    expect(proposeFirstCut(short).refused).toMatch(/no take has picture/);
  });

  /*
   * NOT OFFERED OVER WORK THAT ALREADY EXISTS. A first cut proposed over
   * an arrangement an author has made is the product asking to throw it
   * away.
   */
  it('is only worth offering when there is nothing to lose', () => {
    const p = performance([take('a'), take('b')]);
    expect(worthProposing(p)).toBe(true);
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['a'] });
    expect(worthProposing(p)).toBe(false);
  });
});

describe('advising a cleanup', () => {
  const heard = (over: Partial<Parameters<typeof adviseCleanup>[0] & object> = {}) => ({
    noiseFloorDb: -60, rmsDb: -20, peakDb: -3, windows: 1, ...over,
  });

  it('leaves a clean recording alone, and says the number', () => {
    const advice = adviseCleanup(heard())!;
    expect(advice.id).toBe(NO_CLEANUP);
    expect(advice.says).toMatch(/40 dB below the voice/);
  });

  /*
   * THE MEASUREMENT IS THE HEADROOM, not the floor. −40 dBFS under a loud
   * vocal is silence; the same floor under a whispered one is a fan.
   */
  it('hears a fan as a floor close to the voice', () => {
    expect(adviseCleanup(heard({ noiseFloorDb: -30 }))!.id).toBe('room');
    expect(adviseCleanup(heard({ noiseFloorDb: -30 }))!.says)
      .toMatch(/10 dB below the voice/);
  });

  it('levels a quiet recording as well as cleaning a noisy one', () => {
    expect(adviseCleanup(heard({ peakDb: -20 }))!.id).toBe('voice');
    expect(adviseCleanup(heard({ noiseFloorDb: -30, peakDb: -20 }))!.id)
      .toBe('voice');
  });

  /*
   * IT NEVER PROPOSES `heavy`. That row costs a swirl behind the vocal and
   * the control says so; a machine choosing the row with a known cost on
   * the author's behalf is exactly the trade U-15 says is theirs.
   */
  it('never proposes the row with a cost attached', () => {
    for (const floor of [-10, -18, -25, -40, -70]) {
      for (const peak of [-1, -8, -20, -35]) {
        expect(adviseCleanup(heard({ noiseFloorDb: floor, peakDb: peak }))!.id,
          `${floor}/${peak}`).not.toBe('heavy');
      }
    }
  });

  it('says nothing at all when nothing was measured', () => {
    expect(adviseCleanup(undefined)).toBeNull();
    expect(adviseCleanup({ noiseFloorDb: 0, rmsDb: 0, peakDb: 0, windows: 0 }))
      .toBeNull();
  });
});

/*
 * WHAT THE FIRST REAL TAKE FOUND.  [U-02]
 *
 * `astats` reports a noise floor of `-inf` when some stretch of a take is
 * digital silence, and the first version of `parseAstats` threw the whole
 * reading away for it under an "all three or none" rule. Every synthetic
 * fixture has noise everywhere, so nothing here caught it; the first real
 * mezzanine did, and the advice silently never appeared.
 *
 * `-inf` on the FLOOR is the cleanest possible answer. `-inf` on the RMS
 * or the peak means there is no sound in the file at all, which is a
 * different thing and really is nothing to advise on.
 */
describe('a floor of minus infinity', () => {
  const overall = (keys: Record<string, string>) => Object.entries(keys)
    .map(([key, value]) => `lavfi.astats.Overall.${key}=${value}`).join('\n');

  it('is a clean recording, not a failed measurement', () => {
    const reading = parseAstats(overall({
      Noise_floor: '-inf', RMS_level: '-17.3', Peak_level: '0.44',
    }));
    expect(reading.windows).toBe(1);
    expect(reading.noiseFloorDb).toBe(SILENT_FLOOR_DB);
    expect(adviseCleanup(reading)?.id).toBe(NO_CLEANUP);
  });

  it('is nothing to advise on when the whole track is silent', () => {
    expect(parseAstats(overall({
      Noise_floor: '-inf', RMS_level: '-inf', Peak_level: '-inf',
    })).windows).toBe(0);
  });

  it('is nothing to advise on when astats printed nothing', () => {
    expect(parseAstats('').windows).toBe(0);
  });
});

/*
 * AND THE LAST BLOCK, NOT THE FIRST.
 *
 * `astats` with `reset=0` prints a CUMULATIVE Overall block on every frame
 * — three hundred and forty-three of them for a seven-second take — and
 * only the last is the figure for the whole file. The first is computed
 * from a few hundred samples and is routinely `-inf`.
 *
 * The synthetic text these tests were first written against had exactly
 * one block, so nothing here could tell first from last. The real
 * mezzanine had 343, and the advice silently never appeared.
 */
describe('reading the figures for the whole file', () => {
  it('takes the last cumulative block and not the first', () => {
    const early = 'lavfi.astats.Overall.Noise_floor=-inf\n'
      + 'lavfi.astats.Overall.RMS_level=-inf\n'
      + 'lavfi.astats.Overall.Peak_level=-inf\n';
    const later = 'lavfi.astats.Overall.Noise_floor=-58.2\n'
      + 'lavfi.astats.Overall.RMS_level=-17.3\n'
      + 'lavfi.astats.Overall.Peak_level=-0.4\n';
    const reading = parseAstats(early + later + later);
    expect(reading.windows).toBe(1);
    expect(reading.rmsDb).toBeCloseTo(-17.3, 6);
    expect(reading.noiseFloorDb).toBeCloseTo(-58.2, 6);
    expect(reading.peakDb).toBeCloseTo(-0.4, 6);
  });
});


describe('the hole at the top of the song', () => {
  /*
   * THE FAULT THAT PROMPTED THE WHOLE BRIEF.  [TIMELINE B11]
   *
   * "There is a 1.248 second gap at the beginning of the master
   * video... [Align first take to 00:00]". A performer who started
   * singing a second late leaves a hole at the top, and the honest
   * remedy is not to stretch somebody else's scene over it — it is to
   * move the take back to where it was meant to begin.
   *
   * This became possible the day the nudge got a control. Before that
   * the arithmetic existed and nothing could press it.
   */
  const LATE = secondsToSamples(1.248);

  function late(): Performance {
    const p = performance([
      take('early', {
        alignment: { offsetSamples: LATE, rateRatio: 1, method: 'measured' },
      }),
    ]);
    return p;
  }

  const hole = (from: number, to: number): RenderProblem => ({
    kind: 'gap', say: 'nothing on screen', fromSample: from, toSample: to,
  });

  it('offers to move the first take back, by exactly its own offset', () => {
    const found = repairsFor(late(), hole(0, LATE))
      .find((repair) => repair.id === 'align-first');
    expect(found?.available).toBe(true);
    expect(found?.takeId).toBe('early');
    expect(found?.nudgeSamples).toBe(-LATE);
    expect(found?.says).toMatch(/begins 00:01\.248 into the song/);
  });

  /*
   * ONLY AT THE VERY START, because that is the only place the
   * argument holds. A gap in the middle is not somebody starting
   * late, and moving a take to close it would pull everything they
   * sang out of time with the song — the one thing this product
   * exists to keep.
   */
  it('is not offered for a hole in the middle', () => {
    const middle = repairsFor(late(), hole(secondsToSamples(30), secondsToSamples(40)));
    expect(middle.find((repair) => repair.id === 'align-first')).toBeUndefined();
  });

  it('is greyed, with the reason, when the take already starts on time', () => {
    const onTime = performance([take('punctual')]);
    const found = repairsFor(onTime, hole(0, secondsToSamples(2)))
      .find((repair) => repair.id === 'align-first');
    expect(found?.available).toBe(false);
    expect(found?.says).toMatch(/already begins with the song/);
  });

  it('says so rather than offering nothing when there is no take at all', () => {
    const empty = newPerformance('Empty', master(), AT);
    const found = repairsFor(empty, hole(0, 100))
      .find((repair) => repair.id === 'align-first');
    expect(found?.available).toBe(false);
    expect(found?.says).toBe('there is no take to align');
  });

  /*
   * THE FIRST TAKE IS THE ONE THAT BEGINS EARLIEST, not the first in
   * the list: takes are added in upload order and the one nearest the
   * start of the song is the one whose lateness makes the hole.
   */
  it('picks the take that begins earliest, not the first uploaded', () => {
    const p = performance([
      take('later', {
        alignment: { offsetSamples: secondsToSamples(9), rateRatio: 1, method: 'measured' },
      }),
      take('earlier', {
        alignment: { offsetSamples: LATE, rateRatio: 1, method: 'measured' },
      }),
    ]);
    const found = repairsFor(p, hole(0, LATE))
      .find((repair) => repair.id === 'align-first');
    expect(found?.takeId).toBe('earlier');
  });

  /* And it writes the NUDGE, so the measurement stays readable and a
     re-measure does not discard the fix. [S-3, INV-14] */
  it('moves it with the push, never with the measurement', () => {
    const p = late();
    const found = repairsFor(p, hole(0, LATE))
      .find((repair) => repair.id === 'align-first');
    nudgeTake(p, found!.takeId!, found!.nudgeSamples!);
    expect(effectiveOffset(p.takes[0]!.alignment)).toBe(0);
    expect(p.takes[0]!.alignment.offsetSamples).toBe(LATE);
  });
});
