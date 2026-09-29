/**
 * How long a join takes, and which shot pays for it.
 * [Doctrine STUDIO-TWO §11, S-8, INV-03, D-19; MASTER-EDIT §3, §12 P1]
 *
 * The transition inspector used to print `DURATION 0.40s ALIGNMENT centred`
 * as two readouts, under a paragraph explaining that neither was the
 * author's to set "because both depend on whether the two takes have picture
 * across the overlap". That was a true sentence and a bad conclusion: the
 * dependency is checkable, and the product already checks it twice — once in
 * MASTER CHECK and once in the planner.
 *
 * WHAT IS PROVED HERE:
 *
 *   the three alignments spend the same frames and hand the bill to
 *   different shots, and none of them lengthens the song (INV-03);
 *   an author's duration lives on the scene and never in the shared table;
 *   a length the neighbours cannot pay for is PUT BACK, with the reason;
 *   MASTER CHECK and the planner ask one function, so an odd-numbered
 *   duration cannot be ticked by one and refused by the other.
 */
import { describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import {
  type MasterTrack, type Performance, type PerformanceTake, type Scene,
  allProblems, joinProblems, joinRoom, joinSpan, masterCheck, orderedScenes,
} from '../../src/domain/performance.js';
import {
  PerformanceEditError, addTake, coverGap, moveBoundary, moveScene,
  newPerformance, setScene, setTransition, setTransitionTiming,
} from '../../src/domain/performanceEdit.js';
import {
  PerformancePlanError, buildPerformancePlan,
} from '../../src/domain/performancePlan.js';
import {
  MAX_TRANSITION_FRAMES, TRANSITIONS, overlapSplit, transitionOf,
  transitionAlignOf,
} from '../../src/domain/transitions.js';
import {
  HOUSE_FPS, framesToSamples, secondsToSamples,
} from '../../src/domain/time.js';
import { EXPORT_PROFILES } from '../../src/domain/presentation.js';

const AT = '2026-09-29T12:00:00.000Z';
/** Four minutes, which is a song. */
const SONG = secondsToSamples(240);

function master(over: Partial<MasterTrack> = {}): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId,
    title: 'The Long Way Round',
    artist: 'The Author',
    class: 'own',
    durationSamples: SONG,
    ...over,
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

/** Two takes of the whole song, cut between at a minute. */
function twoScenes(): { performance: Performance; join: Scene } {
  const p = newPerformance('My Performance', master(), AT);
  addTake(p, take('take_1'));
  addTake(p, take('take_2'));
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
  setScene(p, secondsToSamples(60),
    { layoutId: 'performance_full', takeIds: ['take_2'] });
  const join = orderedScenes(p)[1]!;
  setTransition(p, join.id, 'dissolve');
  return { performance: p, join };
}

describe('who pays for the overlap (INV-03)', () => {
  const dissolve = TRANSITIONS['dissolve']!;

  it('spends the same frames whichever shot pays', () => {
    for (const align of ['centred', 'before', 'after'] as const) {
      const { before, after } = overlapSplit(dissolve, align);
      expect(before + after, align).toBe(dissolve.frames);
    }
  });

  it('puts the whole bill on the shot the author named', () => {
    expect(overlapSplit(dissolve, 'before'))
      .toEqual({ before: dissolve.frames, after: 0 });
    expect(overlapSplit(dissolve, 'after'))
      .toEqual({ before: 0, after: dissolve.frames });
  });

  /*
   * The odd frame goes to the picture being LEFT, so a one-frame asymmetry
   * never lands on the shot the eye is travelling towards.
   */
  it('gives an odd frame to the shot being left', () => {
    const nine = { ...dissolve, frames: 9 };
    expect(overlapSplit(nine, 'centred')).toEqual({ before: 5, after: 4 });
  });

  it('defaults to centred when the scene has said nothing', () => {
    expect(transitionAlignOf({})).toBe('centred');
    expect(transitionAlignOf({ transitionAlign: 'nonsense' })).toBe('centred');
    expect(transitionAlignOf({ transitionAlign: 'after' })).toBe('after');
  });
});

describe("an author's duration", () => {
  /*
   * TRANSITIONS IS MODULE STATE SHARED BY EVERY PERFORMANCE IN THE PROCESS.
   * If the override were written into the table row, one author setting a
   * half-second dissolve would change the dissolve in everybody else's song,
   * and it would present as a render that came out wrong for no reason.
   */
  it('never reaches the shared table', () => {
    const was = TRANSITIONS['dissolve']!.frames;
    const mine = transitionOf({ transition: 'dissolve', transitionFrames: 44 });
    expect(mine.frames).toBe(44);
    expect(TRANSITIONS['dissolve']!.frames).toBe(was);
    expect(mine).not.toBe(TRANSITIONS['dissolve']);
  });

  it('is ignored on a cut, which is not a length of time', () => {
    expect(transitionOf({ transition: 'cut', transitionFrames: 44 }).frames).toBe(0);
  });

  it('falls back to the style when the scene has said nothing', () => {
    expect(transitionOf({ transition: 'dissolve' }).frames)
      .toBe(TRANSITIONS['dissolve']!.frames);
  });

  /*
   * A length chosen for a dissolve is not a length for a fade. Both are
   * frames, so keeping the number would type-check and be wrong.
   */
  it('goes back to the style default when the style changes', () => {
    const { performance, join } = twoScenes();
    setTransitionTiming(performance, join.id, 20, null);
    expect(join.transitionFrames).toBe(20);
    setTransition(performance, join.id, 'fade');
    expect(join.transitionFrames).toBeUndefined();
    expect(transitionOf(join).frames).toBe(TRANSITIONS['fade']!.frames);
  });
});

describe('setting the timing', () => {
  it('records the length and who pays', () => {
    const { performance, join } = twoScenes();
    setTransitionTiming(performance, join.id, 18, 'before');
    expect(join.transitionFrames).toBe(18);
    expect(join.transitionAlign).toBe('before');
    expect(joinSpan(join, SONG)).toMatchObject({ before: 18, after: 0 });
  });

  /*
   * The alignment buttons send an alignment and nothing else. If absent read
   * as "back to the default", pressing Centred would throw away the length
   * the author had just dialled in.
   */
  it('leaves the other one alone when it is not mentioned', () => {
    const { performance, join } = twoScenes();
    setTransitionTiming(performance, join.id, 18, undefined);
    expect(join.transitionAlign).toBeUndefined();
    setTransitionTiming(performance, join.id, undefined, 'before');
    expect(join.transitionFrames).toBe(18);
    expect(join.transitionAlign).toBe('before');
  });

  it('puts either one back to the style default when given null', () => {
    const { performance, join } = twoScenes();
    setTransitionTiming(performance, join.id, 18, 'after');
    setTransitionTiming(performance, join.id, null, null);
    expect(join.transitionFrames).toBeUndefined();
    expect(join.transitionAlign).toBeUndefined();
    expect(transitionOf(join).frames).toBe(TRANSITIONS['dissolve']!.frames);
  });

  it('refuses a length on a cut, because a cut has none', () => {
    const { performance, join } = twoScenes();
    setTransition(performance, join.id, 'cut');
    expect(() => setTransitionTiming(performance, join.id, 12, null))
      .toThrow(/a cut has no length/);
  });

  it('refuses the first scene, which nothing arrives from', () => {
    const { performance } = twoScenes();
    const first = orderedScenes(performance)[0]!;
    expect(() => setTransitionTiming(performance, first.id, 12, null))
      .toThrow(/nothing comes before/);
  });

  it('refuses a length that is not a whole number of frames', () => {
    const { performance, join } = twoScenes();
    expect(() => setTransitionTiming(performance, join.id, 12.5, null))
      .toThrow(/whole number of frames/);
    expect(() => setTransitionTiming(performance, join.id, 0, null))
      .toThrow(/at least one frame/);
  });

  it('refuses a mix so long it is a shot of its own', () => {
    const { performance, join } = twoScenes();
    expect(() => setTransitionTiming(
      performance, join.id, MAX_TRANSITION_FRAMES + 1, null,
    )).toThrow(/longest a transition may be/);
    /* And the one below it is fine, so the bound is the bound. */
    setTransitionTiming(performance, join.id, MAX_TRANSITION_FRAMES, null);
    expect(join.transitionFrames).toBe(MAX_TRANSITION_FRAMES);
  });

  it('refuses an alignment nobody wrote', () => {
    const { performance, join } = twoScenes();
    expect(() => setTransitionTiming(performance, join.id, null, 'sideways'))
      .toThrow(/unknown alignment/);
  });
});

/*
 * THE PART THAT MAKES IT SAFE. A length the neighbours cannot pay for is not
 * refused by a fourth copy of the arithmetic — it is applied, the same
 * question the render will ask is asked again, and anything worse is put
 * back. Which is what `coverGap` does, for the same reason.
 */
describe('a length the join cannot pay for', () => {
  /** A one-second section between two others: not much room either side. */
  function narrow(): { performance: Performance; join: Scene } {
    const p = newPerformance('My Performance', master(), AT);
    addTake(p, take('take_1'));
    addTake(p, take('take_2'));
    addTake(p, take('take_3'));
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_2'] });
    setScene(p, secondsToSamples(61),
      { layoutId: 'performance_full', takeIds: ['take_3'] });
    const join = orderedScenes(p)[1]!;
    setTransition(p, join.id, 'dissolve');
    return { performance: p, join };
  }

  it('says how much room each side has', () => {
    const { performance } = narrow();
    const scenes = orderedScenes(performance);
    /* One second at the house rate, less the frame a scene must keep. */
    expect(joinRoom(scenes, 1, SONG).after).toBe(HOUSE_FPS - 1);
    /* A minute on the way in. */
    expect(joinRoom(scenes, 1, SONG).before).toBe(60 * HOUSE_FPS - 1);
    /* And nothing at all before the first scene. */
    expect(joinRoom(scenes, 0, SONG)).toEqual({ before: 0, after: 0 });
  });

  it('is put back, with the reason, and the document is unchanged', () => {
    const { performance, join } = narrow();
    setTransitionTiming(performance, join.id, 12, null);
    /* Centred, this spends thirty frames on a section that has twenty-nine. */
    expect(() => setTransitionTiming(performance, join.id, MAX_TRANSITION_FRAMES, null))
      .toThrow(/longer than the sections it joins/);
    /* Not left holding the refused length, nor reset to the default. */
    expect(join.transitionFrames).toBe(12);
    expect(joinProblems(performance)).toEqual([]);
  });

  it('is put back when the alignment is what breaks it', () => {
    const { performance, join } = narrow();
    /* Centred, half of this fits in the one-second section. */
    setTransitionTiming(performance, join.id, HOUSE_FPS + 10, null);
    /* Paid entirely by the arriving shot, it does not. */
    expect(() => setTransitionTiming(performance, join.id, undefined, 'after'))
      .toThrow(/longer than the sections it joins/);
    expect(join.transitionAlign).toBeUndefined();
    /* And the length the alignment was refused over is still there. */
    expect(join.transitionFrames).toBe(HOUSE_FPS + 10);
  });

  /*
   * The precondition transitions.ts named: both takes must have picture
   * across the whole overlap, including the part outside their own scenes.
   */
  it('is put back when a take does not reach across the overlap', () => {
    const p = newPerformance('My Performance', master(), AT);
    addTake(p, take('take_1'));
    /* A take that reaches six frames back from the boundary and no further. */
    addTake(p, take('take_2', {
      useFromSample: secondsToSamples(60) - framesToSamples(6),
    }));
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_2'] });
    const join = orderedScenes(p)[1]!;
    setTransition(p, join.id, 'dissolve');
    /* The style's own length is covered: five frames back, and it has six. */
    expect(joinProblems(p)).toEqual([]);
    expect(() => setTransitionTiming(p, join.id, 20, null))
      .toThrow(/no picture across/);
    expect(join.transitionFrames).toBeUndefined();
  });

  it('is a PerformanceEditError, so the route answers 400 and not 404', () => {
    const { performance, join } = narrow();
    expect(() => setTransitionTiming(performance, join.id, MAX_TRANSITION_FRAMES, null))
      .toThrow(PerformanceEditError);
  });
});

/*
 * D-19, made into an assertion. The planner and MASTER CHECK used to work the
 * overlap out separately — `overlapSplit`'s asymmetric halves against
 * `ceil(frames/2)` on both sides. Those agree for an even length and differ
 * for an odd one, and both lengths in the table are even, so the two had
 * never disagreed and nobody knew they could.
 */
describe('the checklist and the render agree about a join', () => {
  const profiles = Object.fromEntries(Object.entries(EXPORT_PROFILES)
    .map(([id, p]) => [id, { width: p.width, height: p.height, fps: p.fps }]));

  /**
   * Does the PLANNER accept this join.
   *
   * NARROW ON PURPOSE. A bare try/catch here would answer "false" for a
   * mistyped import as readily as for a refused dissolve, and a comparison
   * where both sides can be wrong together proves nothing. The first draft
   * of this did exactly that and reported a disagreement that was a
   * TypeError. So anything that is not the planner refusing THIS join is
   * rethrown and fails the test as itself.
   */
  function plans(performance: Performance): boolean {
    try {
      buildPerformancePlan(performance, { exportProfileId: 'youtube_16x9' });
      return true;
    } catch (error) {
      if (error instanceof PerformancePlanError
        && /dissolve at|fade|on screen either side|longer than the sections/
          .test(error.message)) return false;
      throw error;
    }
  }

  function ticks(performance: Performance): boolean {
    return masterCheck(performance, 'youtube_16x9', profiles)
      .items.find((item) => item.id === 'transitions')!.ok;
  }

  /** One take that runs out three frames past the boundary, one that does not. */
  function edge(frames: number, align: string): Performance {
    const p = newPerformance('My Performance', master(), AT);
    addTake(p, take('take_1', {
      useToSample: secondsToSamples(60) + framesToSamples(3),
    }));
    addTake(p, take('take_2'));
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_2'] });
    const join = orderedScenes(p)[1]!;
    /* Written straight onto the scene: the EDIT refuses these, and what is
       being compared is what the two readers do with a document that has
       one, however it got there. */
    join.transition = 'dissolve';
    join.transitionFrames = frames;
    join.transitionAlign = align as Scene['transitionAlign'];
    return p;
  }

  /*
   * THE FIXTURE HAS TO BE ABLE TO SAY NO. A comparison where both sides
   * always agree because nothing ever fails is not a test of agreement, so
   * this pins the boundary first: three frames of headroom means a centred
   * seven-frame dissolve fits and a nine-frame one does not.
   */
  it('and the fixture discriminates, or the comparison below is empty', () => {
    expect(ticks(edge(7, 'centred'))).toBe(true);
    expect(ticks(edge(9, 'centred'))).toBe(false);
    expect(plans(edge(7, 'centred'))).toBe(true);
    expect(plans(edge(9, 'centred'))).toBe(false);
  });

  /*
   * Odd lengths are where the two copies came apart: `overlapSplit` pays
   * five and four, `ceil(frames/2)` asked for five and five.
   */
  it('for every odd length an author can now type', () => {
    for (const frames of [1, 3, 5, 7, 9, 11, 15, 21, 29]) {
      for (const align of ['centred', 'before', 'after'] as const) {
        const p = edge(frames, align);
        expect(ticks(p), `${frames} frames, ${align}`).toBe(plans(p));
      }
    }
  });
});

/*
 * TRIM, WHICH IS A BOUNDARY MOVE.  [MASTER-EDIT §2, §12 P1, INV-03]
 *
 * A Scene has a start and no end, so there is no out-point to set and the
 * honest operation is moving the boundary the next clip begins on. What has
 * to be proved is that the guard is real — `moveScene` will happily open a
 * hole, and the whole difference between switching and dragging is that the
 * author dragging is looking at the consequence and would rather be stopped.
 */
describe('trim', () => {
  /** Three clips, and a take under the middle one that does not reach far. */
  function three(): { performance: Performance; scenes: Scene[] } {
    const p = newPerformance('My Performance', master(), AT);
    addTake(p, take('take_1'));
    addTake(p, take('take_2', {
      useFromSample: secondsToSamples(60),
      useToSample: secondsToSamples(121),
    }));
    addTake(p, take('take_3'));
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_2'] });
    setScene(p, secondsToSamples(120),
      { layoutId: 'performance_full', takeIds: ['take_3'] });
    return { performance: p, scenes: orderedScenes(p) };
  }

  it('moves the boundary, and the clip before it grows by what this one lost', () => {
    const { performance, scenes } = three();
    const step = framesToSamples(5);
    const first = scenes[0]!;
    const middle = scenes[1]!;
    const wasFirst = middle.fromSample - first.fromSample;
    moveBoundary(performance, middle.id, middle.fromSample + step);
    expect(middle.fromSample - first.fromSample).toBe(wasFirst + step);
  });

  /*
   * There was a short-circuit here for the no-op case, and no mutation of it
   * could be made to fail: `moveScene` writing the same number is not
   * observable, so the branch was a saving nobody could measure guarding a
   * path nobody could test. It is gone. The property it claimed is still
   * worth pinning, which is what this is. [an assertion nobody has seen fail]
   */
  it('is nothing at all when the boundary is already there', () => {
    const { performance, scenes } = three();
    const middle = scenes[1]!;
    const was = allProblems(performance);
    moveBoundary(performance, middle.id, middle.fromSample);
    expect(allProblems(performance)).toEqual(was);
  });

  /*
   * THE DIFFERENCE FROM `moveScene`, which is the whole point. Dragging the
   * middle clip's start back past where its take begins is a stretch of song
   * with nothing on screen, and the author gets told rather than shown.
   */
  it('refuses a move that opens a hole, and puts the boundary back', () => {
    const { performance, scenes } = three();
    const middle = scenes[1]!;
    const was = middle.fromSample;
    const back = was - framesToSamples(30);
    /* The unguarded operation allows it — that is what it is for. */
    moveScene(performance, middle.id, back);
    expect(allProblems(performance).length).toBeGreaterThan(0);
    moveScene(performance, middle.id, was);

    expect(() => moveBoundary(performance, middle.id, back)).toThrow();
    expect(middle.fromSample).toBe(was);
    expect(allProblems(performance)).toEqual([]);
  });

  it('refuses a move that breaks a transition it is not even touching', () => {
    const { performance, scenes } = three();
    const last = scenes[2]!;
    setTransition(performance, last.id, 'fade');
    setTransitionTiming(performance, last.id, 40, null);
    expect(allProblems(performance)).toEqual([]);
    /*
     * Moving the LAST clip's start up to just after the middle one's leaves
     * the fade nowhere to be paid from on the way in.
     */
    expect(() => moveBoundary(
      performance, last.id, scenes[1]!.fromSample + framesToSamples(4),
    )).toThrow(/longer than the sections it joins/);
    expect(last.fromSample).toBe(secondsToSamples(120));
  });

  it('is a PerformanceEditError, so the route answers 400', () => {
    const { performance, scenes } = three();
    expect(() => moveBoundary(
      performance, scenes[1]!.id, scenes[1]!.fromSample - framesToSamples(30),
    )).toThrow(PerformanceEditError);
  });
});
