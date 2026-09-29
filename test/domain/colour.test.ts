/**
 * Making two takes look like they were shot on the same day.
 * [MASTER-EDIT §6, §8, §12 P2; Doctrine U-02, U-19, D-19]
 *
 * In a sequencer, colour matching is a nicety: it cuts between shots of
 * different scenes, where a change of light reads as a change of place.
 * Here it cuts between takes of THE SAME PERFORMANCE, and a chorus that
 * jumps from warm to cool and back reads as a fault, because the viewer
 * knows it is one room and one song.
 *
 * WHAT IS PROVED HERE:
 *
 *   the grade goes the right way and is the right size;
 *   it is BOUNDED, so a take shot in the dark is not turned into grey
 *   noise on the way to matching one shot by a window — and the interface
 *   is told when the answer was clipped rather than left to look broken;
 *   an unmeasured pair is "not asked", not "no difference";
 *   the reference is stored and the grade derived, so re-measuring moves
 *   the grade rather than leaving a frozen correction;
 *   one hop, refused from both ends, so no cycle can be built.
 */
import { describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import {
  type ColourReading, MATCH_BOUNDS, isMeasured, matchLook, matchQuality,
} from '../../src/domain/colour.js';
import { EFFECT_LOOKS } from '../../src/domain/environment.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import {
  PerformanceEditError, addTake, matchColour, newPerformance,
  setColourReading, setEffect, setScene,
} from '../../src/domain/performanceEdit.js';
import { secondsToSamples } from '../../src/domain/time.js';

const AT = '2026-09-29T12:00:00.000Z';
const SONG = secondsToSamples(240);

/** A neutral, mid-grey reading: the thing everything else is measured from. */
function reading(over: Partial<ColourReading> = {}): ColourReading {
  return { y: 128, ySpread: 100, u: 128, v: 128, saturation: 40, frames: 30, ...over };
}

function master(): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId,
    title: 'The Long Way Round', artist: 'The Author',
    class: 'own', durationSamples: SONG,
  };
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

function twoTakes(): Performance {
  const p = newPerformance('My Performance', master(), AT);
  addTake(p, take('take_dark'));
  addTake(p, take('take_bright'));
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_dark'] });
  return p;
}

describe('the grade between two readings', () => {
  /*
   * ONE IS UNCHANGED, not zero, because `effectChain` subtracts one on the
   * way to `eq` — an `EffectLook` states brightness as a multiplier-shaped
   * number. Returning an offset here, which is the obvious reading and the
   * one `eq` itself uses, rendered the take BLACK and passed every test in
   * this file, because they were written against the same wrong convention.
   * Only the render caught it.
   */
  it('lifts a dark take towards a brighter one', () => {
    const look = matchLook(reading({ y: 90 }), reading({ y: 140 }))!;
    expect(look.brightness).toBeGreaterThan(1);
    expect(look.brightness).toBeCloseTo(1 + (140 - 90) / 255, 5);
  });

  it('pulls a bright take down towards a darker one', () => {
    const look = matchLook(reading({ y: 150 }), reading({ y: 120 }))!;
    expect(look.brightness).toBeLessThan(1);
  });

  /*
   * THE CONVENTION, PINNED AGAINST THE TABLE IT RIDES ON. If `EFFECT_LOOKS`
   * ever changes what 1 means, this fails here rather than in a render.
   */
  it('states brightness the way EFFECT_LOOKS does', () => {
    expect(EFFECT_LOOKS['lighting']!.brightness).toBeGreaterThan(1);
    expect(matchLook(reading(), reading())!.brightness).toBeCloseTo(1, 6);
  });

  it('opens up a flat take and flattens a contrasty one', () => {
    expect(matchLook(reading({ ySpread: 60 }), reading({ ySpread: 90 }))!.contrast)
      .toBeCloseTo(1.5, 5);
    expect(matchLook(reading({ ySpread: 120 }), reading({ ySpread: 90 }))!.contrast)
      .toBeCloseTo(0.75, 5);
  });

  /*
   * V CARRIES RED AND U CARRIES BLUE, so a warmer picture is V up and U
   * down. Half their DIFFERENCE, rather than either alone, is what stops a
   * take that is merely greener — both planes moving the same way — being
   * mistaken for one that is cooler.
   */
  it('warms a cool take and cools a warm one', () => {
    const cool = reading({ u: 140, v: 118 });
    const warm = reading({ u: 118, v: 140 });
    expect(matchLook(cool, warm)!.warmth).toBeGreaterThan(0);
    expect(matchLook(warm, cool)!.warmth).toBeLessThan(0);
  });

  it('does not mistake a green cast for a cool one', () => {
    /* Both planes up by the same amount: greener, not cooler. */
    const green = reading({ u: 138, v: 138 });
    expect(matchLook(green, reading())!.warmth).toBeCloseTo(0, 6);
  });

  it('says nothing when there is nothing to say', () => {
    const look = matchLook(reading(), reading())!;
    expect(look.brightness).toBeCloseTo(1, 6);
    expect(look.contrast).toBeCloseTo(1, 6);
    expect(look.saturation).toBeCloseTo(1, 6);
    expect(look.warmth).toBeCloseTo(0, 6);
  });

  /*
   * A FLAT TAKE HAS NO CONTRAST TO SCALE — a title card, a black frame, a
   * lens cap. The ratio would be an infinity that `eq` renders as a solid
   * colour, so it is left at one, which is the honest answer.
   */
  it('refuses to divide by a take with no spread in it', () => {
    const look = matchLook(reading({ ySpread: 0, saturation: 0 }), reading())!;
    expect(Number.isFinite(look.contrast)).toBe(true);
    expect(look.contrast).toBe(1);
    expect(look.saturation).toBe(1);
  });
});

describe('the bounds, which stop it being a damage machine', () => {
  it('will not push brightness past what a grade can honestly give', () => {
    const look = matchLook(reading({ y: 20 }), reading({ y: 240 }))!;
    expect(look.brightness).toBe(1 + MATCH_BOUNDS.brightness);
  });

  it('will not crush or flatten past the bounds', () => {
    expect(matchLook(reading({ ySpread: 10 }), reading({ ySpread: 200 }))!.contrast)
      .toBe(MATCH_BOUNDS.contrast.max);
    expect(matchLook(reading({ ySpread: 200 }), reading({ ySpread: 10 }))!.contrast)
      .toBe(MATCH_BOUNDS.contrast.min);
  });

  /*
   * AND SAYS SO. An author who matches a take shot in the dark and sees it
   * still darker will conclude the feature does not work. Told the two are
   * further apart than a grade can close, they know to relight, to pick a
   * different reference, or to accept it. [U-19]
   */
  it('tells the interface when the answer was clipped, and which way', () => {
    const near = matchQuality(reading({ y: 120 }), reading({ y: 130 }))!;
    expect(near.matched).toBe(true);
    expect(near.says).toBe('matched');

    const far = matchQuality(reading({ y: 20 }), reading({ y: 240 }))!;
    expect(far.matched).toBe(false);
    expect(far.says).toMatch(/brighter/);
    expect(far.says).toMatch(/as close as a grade gets/);

    /*
     * AND IT READS AS ENGLISH. Every phrase is an adjective, because they
     * are joined into "needs to be ___ and ___ than grading can make it" —
     * the first version used the names of the controls and said "needs to
     * be contrast than grading can make it" in front of an author.
     */
    const flat = matchQuality(
      reading({ ySpread: 10 }), reading({ ySpread: 200 }))!;
    expect(flat.says).toMatch(/needs to be punchier than/);
    for (const pair of [
      [reading({ y: 240 }), reading({ y: 20 })],
      [reading({ ySpread: 200 }), reading({ ySpread: 10 })],
      [reading({ saturation: 10 }), reading({ saturation: 200 })],
      [reading({ u: 200, v: 60 }), reading({ u: 60, v: 200 })],
    ] as const) {
      const said = matchQuality(pair[0], pair[1])!.says;
      expect(said, said).not.toMatch(/\b(contrast|colour|saturation|warmth)\b/);
    }
  });

  /*
   * AN UNMEASURED PAIR IS A QUESTION NOBODY ASKED, not two takes that
   * happen to agree. Returning a no-op grade for it would make those the
   * same answer, and the interface could not tell an author to measure.
   */
  it('answers nothing at all when either side was never measured', () => {
    expect(matchLook(undefined, reading())).toBeNull();
    expect(matchLook(reading(), undefined)).toBeNull();
    expect(matchLook(reading({ frames: 0 }), reading())).toBeNull();
    expect(matchQuality(reading({ frames: 0 }), reading())).toBeNull();
    expect(isMeasured(reading({ frames: 0 }))).toBe(false);
    expect(isMeasured(reading())).toBe(true);
  });
});

describe('choosing a take to match', () => {
  function measured(): Performance {
    const p = twoTakes();
    setColourReading(p, 'take_dark', reading({ y: 90 }));
    setColourReading(p, 'take_bright', reading({ y: 140 }));
    return p;
  }

  it('records which take, and not the grade', () => {
    const p = measured();
    matchColour(p, 'take_dark', 'take_bright');
    const take_ = p.takes.find((t) => t.id === 'take_dark')!;
    expect(take_.matchTo).toBe('take_bright');
    /* The numbers are nowhere in the document. */
    expect(JSON.stringify(take_)).not.toMatch(/brightness/);
  });

  it('lets it be taken off again', () => {
    const p = measured();
    matchColour(p, 'take_dark', 'take_bright');
    matchColour(p, 'take_dark', null);
    expect(p.takes.find((t) => t.id === 'take_dark')!.matchTo).toBeUndefined();
  });

  it('refuses a take matching itself', () => {
    const p = measured();
    expect(() => matchColour(p, 'take_dark', 'take_dark'))
      .toThrow(/already looks like itself/);
  });

  it('refuses until both sides have been measured', () => {
    const p = twoTakes();
    expect(() => matchColour(p, 'take_dark', 'take_bright'))
      .toThrow(/measured/);
    setColourReading(p, 'take_dark', reading());
    expect(() => matchColour(p, 'take_dark', 'take_bright'))
      .toThrow(/measured/);
  });

  /*
   * ONE HOP, REFUSED FROM BOTH ENDS. Matching A to B while B matches C
   * would make "what will A look like" depend on traversal order, and a
   * cycle would have no answer at all. The planner follows no chain; these
   * two refusals are what stop one being built.
   */
  it('refuses to match to a take that is itself matched', () => {
    const p = measured();
    addTake(p, take('take_third'));
    setColourReading(p, 'take_third', reading({ y: 100 }));
    matchColour(p, 'take_bright', 'take_third');
    expect(() => matchColour(p, 'take_dark', 'take_bright'))
      .toThrow(/itself matched/);
  });

  it('refuses to match a take that something else is matched to', () => {
    const p = measured();
    addTake(p, take('take_third'));
    setColourReading(p, 'take_third', reading({ y: 100 }));
    matchColour(p, 'take_bright', 'take_dark');
    expect(() => matchColour(p, 'take_dark', 'take_third'))
      .toThrow(/unmatch it first/);
  });

  it('is a PerformanceEditError, so the route answers 400', () => {
    const p = measured();
    expect(() => matchColour(p, 'take_dark', 'take_dark'))
      .toThrow(PerformanceEditError);
  });
});

describe('what reaches the renderer', () => {
  function planned(build: (p: Performance) => void) {
    const p = twoTakes();
    setColourReading(p, 'take_dark', reading({ y: 90 }));
    setColourReading(p, 'take_bright', reading({ y: 140 }));
    build(p);
    const plan = buildPerformancePlan(p, { exportProfileId: 'youtube_16x9' });
    const shot = plan.shots.find((s) => s.kind !== 'transition')!;
    return (shot as { takes: { takeId: string; match?: unknown; effect?: unknown }[] })
      .takes.find((t) => t.takeId === 'take_dark')!;
  }

  it('carries the grade, resolved, so the renderer never learns what a match is', () => {
    const entry = planned((p) => matchColour(p, 'take_dark', 'take_bright'));
    expect(entry.match).toMatchObject({ id: 'match' });
    expect((entry.match as { brightness: number }).brightness).toBeGreaterThan(1);
  });

  it('carries nothing when no reference was chosen', () => {
    expect(planned(() => undefined).match).toBeUndefined();
  });

  /*
   * A MATCH AND A LOOK ARE DIFFERENT THINGS AND BOTH SURVIVE. A match says
   * "agree with that camera"; a look says "now make it warmer than either".
   * Folding them into one set of numbers would be arithmetic that is only
   * approximately right, because contrast multiplies around a midpoint the
   * brightness before it has already moved.
   */
  it('keeps a named look alongside the match', () => {
    const entry = planned((p) => {
      matchColour(p, 'take_dark', 'take_bright');
      setEffect(p, 'take_dark', 'colour');
    });
    expect(entry.match).toBeDefined();
    expect(entry.effect).toMatchObject({ id: 'colour' });
  });

  /*
   * DERIVED, NOT STORED. Re-measure either take and the grade moves; a
   * frozen correction would stay wrong. This is the reason the document
   * holds a reference rather than four numbers.
   */
  it('changes when the measurement does', () => {
    const before = planned((p) => matchColour(p, 'take_dark', 'take_bright'));
    const after = planned((p) => {
      matchColour(p, 'take_dark', 'take_bright');
      setColourReading(p, 'take_bright', reading({ y: 200 }));
    });
    expect((after.match as { brightness: number }).brightness)
      .toBeGreaterThan((before.match as { brightness: number }).brightness);
  });
});
