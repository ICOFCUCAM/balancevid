/**
 * The Performance: the document, the clock, and what may leave the building.
 * [Doctrine STUDIO-TWO §1–§15, S-1..S-9, INV-00, INV-14, INV-15]
 *
 * Stage one of Studio Two is deliberately the stage with no visible result,
 * because it is where the expensive mistakes are avoided. What is proved here:
 *
 *   the takes are PARALLEL and nothing about them is ordered;
 *   the music clock is in samples and survives a round trip;
 *   scenes are the primitive, and switching and dragging write the same one;
 *   a track the author has not said they may publish does not get published.
 */
import { describe, expect, it } from 'vitest';

import {
  type MasterTrack, type Performance, type PerformanceTake,
  coverage, covered, covers, effectiveOffset, masterToTake, mayPublish,
  masterCheck, orderedScenes, projectPerformance, renderProblems,
  sceneAt, stageNow, stagesOf, takeToMaster, coversSpan,
} from '../../src/domain/performance.js';
import {
  addPlate,
  addTake, classifyMaster, clearScenes, coverGap, moveScene, newPerformance, nudgeTake,
  realign, removeScene, removeTake, setAudioMode, setEnvironment, setScene, trimTake,
  coverWith, publishPerformance, setTransition, PerformanceEditError,
} from '../../src/domain/performanceEdit.js';
import {
  assertAlignmentInvariants, assertPerformanceRenderable, assertPublishable,
  InvariantViolation,
} from '../../src/domain/invariants.js';
import {
  HOUSE_FPS, HOUSE_SAMPLE_RATE, SYNC_TOLERANCE_SAMPLES,
  beatsToSamples, framesToSamples, samplesToFrames, secondsToSamples,
} from '../../src/domain/time.js';
import type { AssetId, TakeId } from '../../src/domain/document.js';
import { EXPORT_PROFILES, LAYOUTS, takeSlots } from '../../src/domain/presentation.js';
import { repairsFor } from '../../src/domain/takeRanking.js';

const AT = '2026-09-24T12:00:00.000Z';
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
    createdAt: AT,
    ...over,
  };
}

function performance(over: Partial<MasterTrack> = {}): Performance {
  return newPerformance('My Performance', master(over), AT);
}

/** A performance with five takes of the whole song, as §1 describes. */
function fiveTakes(): Performance {
  const p = performance();
  for (const label of ['living_room', 'studio', 'beach', 'stage', 'landscape']) {
    addTake(p, take(`take_${label}`, { label }));
  }
  return p;
}

describe('a Performance is not a Conversation (S-1, §13)', () => {
  it('its takes are parallel — all of them cover the same song', () => {
    /*
     * The structural claim the whole document rests on. A Conversation's
     * interventions are ordered by the source frame they are anchored to; a
     * Performance's takes all occupy the same stretch of the same clock, and
     * none of them is before or after another.
     */
    const p = fiveTakes();
    for (const t of p.takes) {
      expect(coverage(t)).toEqual({ fromSample: 0, toSample: SONG });
    }
  });

  it('and a new one holds nothing but the song', () => {
    const p = performance();
    expect(p.takes).toEqual([]);
    expect(p.scenes).toEqual([]);
    expect(p.audio.mode).toBe('music_and_mic');
    expect(covered(p)).toBe(0);
  });
});

describe('the music clock (S-2, INV-14)', () => {
  it('is samples, and survives a round trip', () => {
    for (const seconds of [0, 0.5, 1, 97.331, 240]) {
      const s = secondsToSamples(seconds);
      expect(Number.isInteger(s)).toBe(true);
      expect(Math.abs(s / HOUSE_SAMPLE_RATE - seconds)).toBeLessThan(1 / HOUSE_SAMPLE_RATE);
    }
  });

  it('and is finer than the picture clock by design', () => {
    // One frame is 1600 samples at 30fps / 48kHz. The whole reason the clock
    // exists is that a listener notices far less than a frame.
    expect(framesToSamples(1)).toBe(1600);
    expect(SYNC_TOLERANCE_SAMPLES).toBeLessThan(framesToSamples(1));
  });

  it('a cut lands on the frame that is on screen, not the nearest one', () => {
    /*
     * Rounded DOWN. Rounding to nearest would let a cut land on a frame still
     * showing the previous scene for up to half a frame — visible against a
     * beat, which is exactly where cuts in this studio land.
     */
    expect(samplesToFrames(0)).toBe(0);
    expect(samplesToFrames(1599)).toBe(0);
    expect(samplesToFrames(1600)).toBe(1);
    expect(samplesToFrames(3199)).toBe(1);
  });

  it('and bars are a musical distance, not a temporal one', () => {
    // Two bars of four at 120bpm is four seconds; at 60bpm it is eight.
    expect(beatsToSamples(8, 120)).toBe(secondsToSamples(4));
    expect(beatsToSamples(8, 60)).toBe(secondsToSamples(8));
  });
});

describe('alignment (S-3, §10)', () => {
  it('places a take on the song', () => {
    const t = take('take_1', {
      alignment: { offsetSamples: secondsToSamples(2), rateRatio: 1, method: 'measured' },
    });
    // The song's 3-second mark is this take's 1-second mark.
    expect(masterToTake(t.alignment, secondsToSamples(3))).toBe(secondsToSamples(1));
    expect(takeToMaster(t.alignment, secondsToSamples(1))).toBe(secondsToSamples(3));
  });

  it('and answers honestly about a moment the take does not reach', () => {
    // Negative is a real answer, not an error: a chorus-only take is asked
    // about the first verse every time the timeline is drawn.
    const t = take('take_1', {
      alignment: { offsetSamples: secondsToSamples(60), rateRatio: 1, method: 'measured' },
    });
    expect(masterToTake(t.alignment, 0)).toBeLessThan(0);
    expect(covers(t, 0)).toBe(false);
  });

  it('corrects drift across the whole take, not only at its start', () => {
    /*
     * The error that an offset alone cannot fix. A take running 100ppm fast
     * is 24ms out after four minutes — past the tolerance — and the ratio is
     * what makes that a correction rather than a defect.
     */
    const drifting = take('take_1', {
      alignment: { offsetSamples: 0, rateRatio: 1.0001, method: 'measured' },
    });
    const atEnd = masterToTake(drifting.alignment, SONG);
    expect(atEnd - SONG).toBeGreaterThan(SYNC_TOLERANCE_SAMPLES);
  });

  it('keeps the author\'s nudge apart from the measurement', () => {
    /*
     * Re-measuring must not discard a human's fix, and keeping the two apart
     * is the only way to see how far off the automatic answer was.
     */
    const p = performance();
    addTake(p, take('take_1'));
    nudgeTake(p, 'take_1', -480);
    realign(p, 'take_1', { offsetSamples: 9600, rateRatio: 1, method: 'calibrated' });

    const { alignment } = p.takes[0]!;
    expect(alignment.offsetSamples).toBe(9600);
    expect(alignment.nudgeSamples).toBe(-480);
    expect(effectiveOffset(alignment)).toBe(9120);
  });

  it('and never overwrites a placement made by hand', () => {
    const p = performance();
    addTake(p, take('take_1', {
      alignment: { offsetSamples: 1000, rateRatio: 1, method: 'manual' },
    }));
    expect(() => realign(p, 'take_1', {
      offsetSamples: 5, rateRatio: 1, method: 'measured',
    })).toThrow(/by hand/);
  });
});

describe('what INV-14 refuses', () => {
  const broken = (over: Partial<PerformanceTake>) => {
    const p = performance();
    addTake(p, take('take_1', over));
    return () => assertAlignmentInvariants(p);
  };

  it('an offset that is not a whole sample', () => {
    expect(broken({
      alignment: { offsetSamples: 10.5, rateRatio: 1, method: 'measured' },
    })).toThrow(InvariantViolation);
  });

  it('a take with no measured duration', () => {
    expect(broken({ durationSamples: 0 })).toThrow(/measured duration/);
  });

  it('and a rate ratio that is a resampling error wearing drift\'s clothes', () => {
    /*
     * Real clock drift is parts per million. A ratio of 1.09 is 44.1kHz media
     * that ingest failed to normalise, and catching it here turns a video
     * that slides out of sync over four minutes into an error at the moment
     * the take is added.
     */
    expect(broken({
      alignment: { offsetSamples: 0, rateRatio: 48000 / 44100, method: 'measured' },
    })).toThrow(/resampling error/);
    // While real drift passes.
    expect(broken({
      alignment: { offsetSamples: 0, rateRatio: 1.00002, method: 'measured' },
    })).not.toThrow();
  });
});

describe('partial takes (S-10)', () => {
  it('a take can cover only the chorus', () => {
    const p = performance();
    addTake(p, take('take_1'));
    trimTake(p, 'take_1', secondsToSamples(60), secondsToSamples(90));
    expect(coverage(p.takes[0]!)).toEqual({
      fromSample: secondsToSamples(60), toSample: secondsToSamples(90),
    });
    expect(covers(p.takes[0]!, secondsToSamples(30))).toBe(false);
    expect(covers(p.takes[0]!, secondsToSamples(75))).toBe(true);
  });

  it('and a trim is markers, so it widens again', () => {
    const p = performance();
    addTake(p, take('take_1'));
    trimTake(p, 'take_1', secondsToSamples(60), secondsToSamples(90));
    trimTake(p, 'take_1', null, null);
    expect(coverage(p.takes[0]!)).toEqual({ fromSample: 0, toSample: SONG });
  });

  it('but a trim that leaves nothing is refused', () => {
    const p = performance();
    addTake(p, take('take_1'));
    expect(() => trimTake(p, 'take_1', secondsToSamples(90), secondsToSamples(60)))
      .toThrow(/nothing of the take/);
  });
});

describe('scenes are the primitive (S-4, §7, §8, §15)', () => {
  const switched = () => {
    const p = fiveTakes();
    // §7: the author presses 1 → 3 → 2 while the song plays.
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    setScene(p, secondsToSamples(60), { layoutId: 'performance_full', takeIds: ['take_beach'] });
    setScene(p, secondsToSamples(120), { layoutId: 'performance_full', takeIds: ['take_studio'] });
    return p;
  };

  it('live switching and timeline editing write the same thing', () => {
    /*
     * The resolution S-4 argues for. §7 appends scenes; §8 moves their
     * boundaries. One artefact, so the two can never disagree — the same
     * answer the Conversation Room reached about its stage history.
     */
    const p = switched();
    expect(p.scenes).toHaveLength(3);

    const middle = orderedScenes(p)[1]!;
    moveScene(p, middle.id, secondsToSamples(45));
    expect(orderedScenes(p)[1]!.fromSample).toBe(secondsToSamples(45));
    expect(p.scenes).toHaveLength(3);
  });

  it('order is derived from the clock, never stored', () => {
    const p = fiveTakes();
    setScene(p, secondsToSamples(120), { layoutId: 'performance_full', takeIds: ['take_studio'] });
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_beach'] });
    expect(orderedScenes(p).map((s) => s.fromSample))
      .toEqual([0, secondsToSamples(120)]);
  });

  it('switching twice at one instant is one decision, not two scenes', () => {
    // Two scenes at the same sample is a document whose order depends on a
    // tiebreak, which is a thing to prevent rather than to sort.
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_beach'] });
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_studio'] });
    expect(p.scenes).toHaveLength(1);
    expect(p.scenes[0]!.takeIds).toEqual(['take_studio']);
  });

  it('and a scene cannot be dragged onto another', () => {
    const p = switched();
    const first = orderedScenes(p)[0]!;
    expect(() => moveScene(p, first.id, secondsToSamples(60)))
      .toThrow(/already a scene/);
  });

  it('§6\'s four-way is a scene with four takes', () => {
    const p = fiveTakes();
    setScene(p, 0, {
      layoutId: 'performance_quad',
      takeIds: ['take_living_room', 'take_studio', 'take_beach', 'take_stage'],
    });
    expect(p.scenes[0]!.takeIds).toHaveLength(4);
  });

  it('and §5\'s Half Mode is a scene with two', () => {
    const p = fiveTakes();
    setScene(p, 0, {
      layoutId: 'performance_half', takeIds: ['take_beach', 'take_stage'],
    });
    expect(takeSlots(LAYOUTS['performance_half']!)).toBe(2);
  });

  it('but an arrangement will not hold more performances than it has panels', () => {
    /*
     * Asked when the scene is written, not discovered at render time. Three
     * takes in a two-panel scene is a panel that does not exist, and a
     * silently dropped performance is what an author finds after exporting.
     */
    const p = fiveTakes();
    expect(() => setScene(p, 0, {
      layoutId: 'performance_half',
      takeIds: ['take_beach', 'take_stage', 'take_studio'],
    })).toThrow(/holds 2 performances, not 3/);
    expect(() => setScene(p, 0, {
      layoutId: 'performance_quad', takeIds: ['take_beach'],
    })).toThrow(/holds 4 performances, not 1/);
  });

  it('but the same take cannot occupy two panels of one scene', () => {
    const p = fiveTakes();
    expect(() => setScene(p, 0, {
      layoutId: 'performance_full', takeIds: ['take_beach', 'take_beach'],
    })).toThrow(/two panels/);
  });

  it('and clearing the picture track keeps every recording', () => {
    // §7's switching is a performance in itself and the second attempt is
    // usually better. The recordings are what cost something to make.
    const p = switched();
    clearScenes(p);
    expect(p.scenes).toEqual([]);
    expect(p.takes).toHaveLength(5);
  });

  it('what is on screen at a moment is asked, not stored', () => {
    const p = switched();
    expect(sceneAt(p, secondsToSamples(30))?.takeIds).toEqual(['take_living_room']);
    expect(sceneAt(p, secondsToSamples(90))?.takeIds).toEqual(['take_beach']);
    expect(sceneAt(p, secondsToSamples(200))?.takeIds).toEqual(['take_studio']);
  });

  it('and removing a take removes it from every scene that named it', () => {
    // Silently leaving a scene pointing at a take that is gone would turn a
    // deletion into a render failure much later.
    const p = switched();
    removeTake(p, 'take_beach');
    expect(p.scenes.flatMap((s) => s.takeIds)).not.toContain('take_beach');
    expect(p.scenes).toHaveLength(3);
  });
});

describe('the timeline the scenes make (S-4)', () => {
  const full = () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    setScene(p, secondsToSamples(60), { layoutId: 'performance_full', takeIds: ['take_beach'] });
    return p;
  };

  it('a scene runs until the next one, and the last until the song ends', () => {
    const timeline = projectPerformance(full());
    expect(timeline.spans.map((s) => [s.fromSample, s.toSample])).toEqual([
      [0, secondsToSamples(60)],
      [secondsToSamples(60), SONG],
    ]);
    expect(timeline.gaps).toEqual([]);
  });

  it('and tiles the output clock exactly, in frames (INV-02)', () => {
    const timeline = projectPerformance(full());
    let expected = 0;
    for (const span of timeline.spans) {
      expect(span.outputStartFrame).toBe(expected);
      expected += span.durationFrames;
    }
    expect(expected).toBe(timeline.totalOutputFrames);
    expect(timeline.totalOutputFrames).toBe(240 * HOUSE_FPS);
  });

  it('song with nothing on it is a gap, which is legal while composing', () => {
    /*
     * A timeline that refused to exist until it was finished would be useless
     * while it was being made. The author is shown gaps; the renderer refuses
     * them.
     */
    const p = fiveTakes();
    setScene(p, secondsToSamples(60), { layoutId: 'performance_full', takeIds: ['take_beach'] });
    const timeline = projectPerformance(p);
    expect(timeline.gaps).toEqual([{ fromSample: 0, toSample: secondsToSamples(60) }]);
    expect(covered(p)).toBeCloseTo(0.75, 5);
  });

  it('and a take that does not reach a scene is reported, not dropped', () => {
    // A four-way that is quietly a three-way is exactly what an author
    // discovers after rendering.
    const p = fiveTakes();
    trimTake(p, 'take_beach', 0, secondsToSamples(60));
    setScene(p, 0, {
      layoutId: 'performance_half', takeIds: ['take_living_room', 'take_beach'],
    });
    setScene(p, secondsToSamples(60), {
      layoutId: 'performance_half', takeIds: ['take_living_room', 'take_beach'],
    });
    const timeline = projectPerformance(p);
    expect(timeline.spans[0]!.takes).toHaveLength(2);
    expect(timeline.spans[1]!.takes).toHaveLength(1);
    expect(timeline.spans[1]!.missing).toEqual(['take_beach']);
  });

  it('and a take that covers only the START of a scene is not in it', () => {
    /*
     * The one the first version of this got wrong. Asking whether a take
     * covers a span's first sample lets a take that runs out halfway through
     * pass as though it covered the whole scene, and the rest renders black
     * with nothing having complained.
     */
    const p = fiveTakes();
    trimTake(p, 'take_beach', 0, secondsToSamples(30));
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_beach'] });
    const timeline = projectPerformance(p);
    expect(timeline.spans[0]!.takes).toEqual([]);
    expect(timeline.spans[0]!.missing).toEqual(['take_beach']);
  });
});

/**
 * WHY A RENDER IS REFUSED, SAID ONCE.  [D-19, INV-03]
 *
 * The rule was written twice: properly in `assertPerformanceRenderable`, and
 * again — worse — in the console. The console's copy summed the gaps into
 * one duration and printed it with `formatMasterPosition`, which formats a
 * position, so an author read `00:01.248 of the song has nothing on screen`
 * and reasonably looked at 00:01.248. It meant "one and a quarter seconds,
 * somewhere in four minutes". And it never asked about `span.missing`, so the
 * button stayed lit for a performance the server would refuse.
 *
 * What is checked here is that there is now ONE answer, that it carries a
 * PLACE, and that the mechanical remedy refuses to pretend.
 */
describe('why a render is refused', () => {
  const uncovered = () => {
    const p = fiveTakes();
    /* A minute of song before the first scene: a hole, and the only shape a
       hole has in this model. */
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_beach'] });
    return p;
  };

  it('names where the hole is, not how much of it there is', () => {
    const [gap, ...rest] = renderProblems(uncovered());
    expect(rest).toEqual([]);
    expect(gap!.kind).toBe('gap');
    expect(gap!.fromSample).toBe(0);
    expect(gap!.toSample).toBe(secondsToSamples(60));
    /* The two ends of the stretch, on the clock. A total would be 01:00.000
       too, and mean something else entirely — which is the bug. */
    expect(gap!.say).toContain('00:00.000');
    expect(gap!.say).toContain('01:00.000');
  });

  it('and reports a scene whose take falls short, which the console never did',
    () => {
      const p = fiveTakes();
      setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
      trimTake(p, 'take_living_room', 0, secondsToSamples(30));
      const [problem, ...rest] = renderProblems(p);
      expect(rest).toEqual([]);
      expect(problem!.kind).toBe('short-takes');
      expect(problem!.takeIds).toEqual(['take_living_room']);
      expect(problem!.say).toContain('do not reach all of it');
    });

  it('all of them at once, because fixing one at a time is a worse day', () => {
    const p = fiveTakes();
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_beach'] });
    trimTake(p, 'take_beach', 0, secondsToSamples(90));
    expect(renderProblems(p).map((problem) => problem.kind))
      .toEqual(['gap', 'short-takes']);
  });

  it('a performance ready to render has nothing to say', () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    expect(renderProblems(p)).toEqual([]);
  });

  /*
   * THE INVARIANT AND THE CONSOLE NOW AGREE BY CONSTRUCTION, and this is the
   * test that keeps them agreeing: the sentence the author reads is the
   * sentence the renderer refuses with.
   */
  it('and the renderer refuses with the same sentence the console shows', () => {
    const p = uncovered();
    const [gap] = renderProblems(p);
    expect(() => assertPerformanceRenderable(p)).toThrow(gap!.say);
  });
});

describe('closing a hole in one action', () => {
  const uncovered = () => {
    const p = fiveTakes();
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_beach'] });
    return p;
  };

  it('offers the scene that starts where the hole ends', () => {
    const [gap] = renderProblems(uncovered());
    expect(gap!.extend?.fromSample).toBe(0);
  });

  it('and starting it there closes the hole', () => {
    const p = uncovered();
    const [gap] = renderProblems(p);
    coverGap(p, gap!.extend!.sceneId, gap!.extend!.fromSample);
    expect(renderProblems(p)).toEqual([]);
  });

  /*
   * THE ONE THAT MATTERS. A take trimmed to the second minute cannot cover
   * the first, so dragging its scene back turns "nothing is on screen here"
   * into "this take does not reach all of it" — the same render refused for
   * a different reason, after a button that said it would fix it. It is put
   * back, and the reason is said out loud.
   */
  it('and refuses when it would only trade one refusal for another', () => {
    const p = uncovered();
    trimTake(p, 'take_beach', secondsToSamples(60), secondsToSamples(240));
    const [gap] = renderProblems(p);
    const was = p.scenes[0]!.fromSample;
    expect(() => coverGap(p, gap!.extend!.sceneId, gap!.extend!.fromSample))
      .toThrow(PerformanceEditError);
    expect(() => coverGap(p, gap!.extend!.sceneId, gap!.extend!.fromSample))
      .toThrow(/do not reach all of it/);
    /* And left exactly as it was. A refused edit that half-applied would be
       worse than no button at all. */
    expect(p.scenes[0]!.fromSample).toBe(was);
  });

  it('and will not drag a scene forwards under the name of covering', () => {
    const p = uncovered();
    expect(() => coverGap(p, p.scenes[0]!.id, secondsToSamples(90)))
      .toThrow(/already starts at or before/);
  });
});

describe('what a renderable performance must be', () => {
  const ready = () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    return p;
  };

  it('a full one passes', () => {
    expect(() => assertPerformanceRenderable(ready())).not.toThrow();
  });

  it('one with no scenes does not', () => {
    expect(() => assertPerformanceRenderable(performance()))
      .toThrow(/no scenes/);
  });

  it('nor one with song left uncovered', () => {
    const p = fiveTakes();
    setScene(p, secondsToSamples(60), { layoutId: 'performance_full', takeIds: ['take_beach'] });
    expect(() => assertPerformanceRenderable(p)).toThrow(/no performance on them/);
  });

  it('nor one whose scene names a take that does not reach all of it', () => {
    const p = ready();
    trimTake(p, 'take_living_room', 0, secondsToSamples(30));
    // And it says which take, and what to do about it — "names no take"
    // would be accurate and useless, because they did name one.
    expect(() => assertPerformanceRenderable(p))
      .toThrow(/take_living_room do not reach all of it/);
    expect(() => assertPerformanceRenderable(p)).toThrow(/move the scene boundary/);
  });

  it('and the master vocal mode needs a vocal', () => {
    const p = ready();
    expect(() => setAudioMode(p, 'master_vocal')).toThrow(/needs a take/);
    setAudioMode(p, 'master_vocal', 'take_studio');
    expect(() => assertPerformanceRenderable(p)).not.toThrow();
  });

  it('which is remembered through a change of mode', () => {
    // Switching to hear the room and back should not lose which take was the
    // voice.
    const p = ready();
    setAudioMode(p, 'master_vocal', 'take_studio');
    setAudioMode(p, 'take_audio');
    setAudioMode(p, 'master_vocal');
    expect(p.audio.vocalTakeId).toBe('take_studio');
  });

  it('and a take that is the vocal cannot be removed out from under it', () => {
    const p = ready();
    setAudioMode(p, 'master_vocal', 'take_studio');
    expect(() => removeTake(p, 'take_studio')).toThrow(/master vocal/);
  });
});

describe('what may leave the building (S-9, INV-15)', () => {
  it('a track the author owns publishes', () => {
    expect(mayPublish(master({ class: 'own' }))).toBe(true);
    expect(() => assertPublishable(performance({ class: 'own' }))).not.toThrow();
  });

  it('a commercial recording does not', () => {
    /*
     * The judgement this whole field exists for. Studio One's rights posture
     * is transformative commentary; performing over a commercial recording is
     * not commentary, and a publish button over it is a problem shipped as a
     * feature. INV-01's shape, applied to music.
     */
    expect(mayPublish(master({ class: 'third_party' }))).toBe(false);
    expect(() => assertPublishable(performance({ class: 'third_party' })))
      .toThrow(InvariantViolation);
    expect(() => assertPublishable(performance({ class: 'third_party' })))
      .toThrow(/you may publish/);
  });

  it('and a licensed one has to say what permits it', () => {
    expect(() => assertPublishable(performance({ class: 'licensed' })))
      .toThrow(/Name the licence/);
    expect(() => assertPublishable(performance({
      class: 'licensed', licence: 'Sync licence 2026-0041',
    }))).not.toThrow();
  });

  it('an openly licensed one likewise, because attribution is the condition', () => {
    expect(() => assertPublishable(performance({ class: 'open' })))
      .toThrow(/Name the licence/);
    expect(() => assertPublishable(performance({ class: 'open', licence: 'CC BY 4.0' })))
      .not.toThrow();
  });

  it('an unrecognised class is refused, and is not publishable (INV-15)', () => {
    /*
     * `mayPublish` used to read `class !== 'third_party'`, so every value that
     * was not that one could be published — including one nobody defined. A
     * request carrying `class: "neon"` got past it and past INV-15 with it.
     * An allowlist is the only safe default for a question about somebody
     * else's rights.
     */
    const p = performance();
    expect(() => classifyMaster(p, { class: 'neon' as never }))
      .toThrow(/unknown class of music/);
    expect(mayPublish({ ...master(), class: 'neon' as never })).toBe(false);
    expect(() => assertPublishable({
      ...performance(), master: { ...master(), class: 'neon' as never },
    })).toThrow(InvariantViolation);
  });

  it('and the classification can change, because a licence can be bought', () => {
    // An author who records against a placeholder and then licenses it should
    // not have to start again.
    const p = performance({ class: 'third_party' });
    expect(mayPublish(p.master)).toBe(false);
    classifyMaster(p, { class: 'licensed', licence: 'Sync licence 2026-0041' });
    expect(mayPublish(p.master)).toBe(true);
    expect(() => assertPublishable(p)).not.toThrow();
  });
});

describe('coverage is asked in frames, because frames are what render (U-08)', () => {
  /*
   * The recorder begins a few hundred samples either side of the song's own
   * zero — a third of a frame, invisible, and unrepresentable in an export.
   * Asked in samples, such a take "does not reach" a scene starting at zero
   * and the whole performance is refused for being nine thousandths of a
   * second short. That happened the moment the browser's measurement started
   * reaching the document, with a message telling the author to extend a take
   * that was already long enough.
   */
  it('a take that begins inside the first frame covers a scene starting at zero', () => {
    const p = performance();
    addTake(p, take('take_1', {
      alignment: { offsetSamples: 896, rateRatio: 1, method: 'measured' },
    }));
    expect(coversSpan(p.takes[0]!, 0, SONG)).toBe(true);
  });

  it('and one that begins a whole frame late does not', () => {
    const p = performance();
    addTake(p, take('take_1', {
      alignment: { offsetSamples: 1601, rateRatio: 1, method: 'measured' },
    }));
    expect(coversSpan(p.takes[0]!, 0, SONG)).toBe(false);
  });

  /*
   * The end is strict, and the asymmetry is the point: a take that runs out
   * inside the last frame is a frame short, and a frame short is a black
   * frame. A take that starts inside the first frame is not missing anything.
   */
  it('but a take that runs out inside the last frame is still short', () => {
    const p = performance();
    addTake(p, take('take_1', { durationSamples: SONG - 1 }));
    expect(coversSpan(p.takes[0]!, 0, SONG)).toBe(false);
  });
});

describe('the environment is a field, never pixels (S-6, §4)', () => {
  /** A performance whose room has been measured, so a matte can exist. */
  function measured(): Performance {
    const p = performance();
    addPlate(p, {
      assetId: 'plate_1' as AssetId,
      noise: 0.01, quality: 0.9, width: 1280, height: 720, capturedAt: AT,
    });
    addTake(p, take('take_1', { plateAssetId: 'plate_1' as AssetId }));
    return p;
  }

  it('changing it is a field change, and the recording is untouched', () => {
    const p = measured();
    const { assetId } = p.takes[0]!;
    setEnvironment(p, 'take_1', { kind: 'space', spaceId: 'recording_studio' });
    expect(p.takes[0]!.environment).toEqual({ kind: 'space', spaceId: 'recording_studio' });
    expect(p.takes[0]!.assetId).toBe(assetId);

    // Bedroom → Studio → Beach, without recording the song again.
    setEnvironment(p, 'take_1', { kind: 'space', spaceId: 'beach' });
    expect(p.takes[0]!.environment.spaceId).toBe('beach');
  });

  it('and a space has to say which one', () => {
    const p = measured();
    expect(() => setEnvironment(p, 'take_1', { kind: 'space' })).toThrow(/which one/);
    expect(() => setEnvironment(p, 'take_1', { kind: 'custom' })).toThrow(/a picture/);
  });

  /*
   * INV-16. A background is only as good as the matte, and there is no matte
   * without a measured plate — so the answer to "put me on a stage" in a room
   * nobody has measured is the remedy, not an approximation of a silhouette.
   */
  it('refuses any background at all where no room was measured (INV-16)', () => {
    const p = performance();
    addTake(p, take('take_1'));
    expect(() => setEnvironment(p, 'take_1', { kind: 'blur' }))
      .toThrow(/three seconds of the empty room/);
    expect(p.takes[0]!.environment.kind).toBe('original');
  });
});

describe('the document round-trips', () => {
  it('through JSON unchanged, which is how it is stored', () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_beach'], label: 'Verse 1' });
    setScene(p, secondsToSamples(60), {
      layoutId: 'performance_full', takeIds: ['take_stage'], label: 'Chorus',
    });
    nudgeTake(p, 'take_beach', -240);
    setAudioMode(p, 'master_vocal', 'take_studio');

    const back = JSON.parse(JSON.stringify(p)) as Performance;
    expect(back).toEqual(p);
    expect(projectPerformance(back)).toEqual(projectPerformance(p));
    expect(orderedScenes(back).map((s) => s.label)).toEqual(['Verse 1', 'Chorus']);
  });

  it('and removing a scene leaves the rest where they were', () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_beach'] });
    setScene(p, secondsToSamples(60), { layoutId: 'performance_full', takeIds: ['take_stage'] });
    const [first] = orderedScenes(p);
    removeScene(p, first!.id);
    expect(orderedScenes(p).map((s) => s.fromSample)).toEqual([secondsToSamples(60)]);
  });
});


/**
 * WHERE THE WORK HAS GOT TO.  [§2, §14, U-04, D-14]
 *
 * The four acts Studio Two already performed and never named: takes are
 * recorded, scenes are directed over them, one file is made, versions of it
 * go out. What is proved here is that the readout is DERIVED — it cannot
 * say something the document does not — and that it goes BACKWARDS when the
 * work does, which is the property a progress bar usually gets wrong.
 */
describe('where the work has got to', () => {
  const AT = '2026-09-24T12:00:00.000Z';
  const doneRender = (profileId = 'youtube_16x9') =>
    ({ state: 'done', payload: { exportProfileId: profileId } });

  const composed = () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    return p;
  };

  it('an empty performance has done nothing', () => {
    expect(stagesOf(performance(), []).map((stage) => stage.done))
      .toEqual([false, false, false, false]);
  });

  it('takes are performing; scenes over them are composing', () => {
    expect(stagesOf(fiveTakes(), []).map((stage) => stage.done))
      .toEqual([true, false, false, false]);
    expect(stagesOf(composed(), []).map((stage) => stage.done))
      .toEqual([true, true, false, false]);
  });

  /*
   * THE ONE THAT MATTERS. Composing is not "there are scenes" — it is
   * "there are scenes a renderer would accept", which is the same question
   * `renderProblems` answers for the console and the invariant. A song with
   * a hole in it is still being composed. [D-19, INV-03]
   */
  it('and a song with a hole in it is still being composed', () => {
    const p = fiveTakes();
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_beach'] });
    expect(p.scenes.length).toBe(1);
    expect(stagesOf(p, []).map((stage) => stage.done))
      .toEqual([true, false, false, false]);
  });

  it('the wide render is the master; any other is a delivery', () => {
    expect(stagesOf(composed(), [doneRender()]).map((stage) => stage.done))
      .toEqual([true, true, true, false]);
    expect(stagesOf(composed(), [doneRender(), doneRender('vertical_9x16')])
      .map((stage) => stage.done)).toEqual([true, true, true, true]);
    /*
     * AND A VERSION IS NOT A MASTER. The case that distinguishes the rule
     * from "any render at all": a vertical cut exists, the wide one does
     * not, and MASTER is the one that is not done. Counting renders rather
     * than asking which profile passed every other assertion here.
     */
    expect(stagesOf(composed(), [doneRender('vertical_9x16')])
      .map((stage) => stage.done)).toEqual([true, true, false, true]);
  });

  it('and a published performance has delivered, with or without versions', () => {
    const p = composed();
    publishPerformance(p, { planHash: 'abc123', publishedAt: AT });
    expect(stagesOf(p, [doneRender()]).map((stage) => stage.done))
      .toEqual([true, true, true, true]);
  });

  /*
   * A render that is still running has not produced a file, and a readout
   * that counted it would be telling an author the master exists while they
   * watch the percentage climb.
   */
  it('and a render in flight has not made anything', () => {
    expect(stagesOf(composed(), [{ state: 'running', payload: {} }])
      .map((stage) => stage.done)).toEqual([true, true, false, false]);
  });

  /*
   * IT GOES BACKWARDS. "The furthest stage reached" is the tempting
   * reading and the wrong one: a mastered performance that has a hole cut
   * back into it is at COMPOSE again, and a readout still saying DELIVER
   * would be describing the past.
   */
  it('and says where the work IS, not how far it once got', () => {
    const p = composed();
    const renders = [doneRender(), doneRender('vertical_9x16')];
    expect(stageNow(stagesOf(p, renders))).toBe(3);
    /* Cut the first minute back out from under it. */
    moveScene(p, p.scenes[0]!.id, secondsToSamples(60));
    expect(stageNow(stagesOf(p, renders))).toBe(1);
  });
});


/**
 * MASTER CHECK.  [MASTER-EDIT §13, §12 P0]
 *
 * A LIST OF TICKS IS A PROMISE. The one thing it must never do is tick
 * something it did not check — a green line printed because the product
 * hopes so teaches an author to trust the list, and then spends that trust
 * on the render where it mattered. So what is proved here is not that the
 * checks pass on a good performance (easy, and nearly worthless) but that
 * each one FAILS when its own fact is false.
 */
describe('master check', () => {
  const ready = () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    return p;
  };
  const run = (p: Performance) => masterCheck(p, 'youtube_16x9', EXPORT_PROFILES);
  const of = (p: Performance, id: string) =>
    run(p).items.find((item) => item.id === id)!;

  it('passes a performance that is ready, and says what it compared', () => {
    const { items, ready: ok } = run(ready());
    expect(ok).toBe(true);
    expect(items.map((item) => item.id)).toEqual([
      'song', 'covers', 'gaps', 'overlaps', 'sources', 'transitions',
      'captions', 'audio', 'frames', 'resolution', 'aspect',
    ]);
    /* Every line says what it measured, or the tick means nothing. */
    for (const item of items) expect(item.says.length, item.id).toBeGreaterThan(0);
  });

  /*
   * THE ONE ADVISORY LINE, AND IT HAS TO STAY THE ONLY ONE.
   * [INV-07, MASTER-EDIT §12 P3]
   *
   * `captions` is shown and counts for nothing, because INV-07 asks every
   * export to carry them and a performance made before there was a field
   * for lyrics cannot — failing the list would make the invariant a thing
   * enforced against the author rather than for the viewer.
   *
   * The moment `advisory` becomes a way to demote an inconvenient check,
   * the list stops being a promise. So this asserts the census, not the
   * flag: exactly one line carries it, and it is that one.
   */
  it('has exactly one line that is a warning rather than a gate', () => {
    const { items } = run(ready());
    expect(items.filter((entry) => entry.advisory).map((entry) => entry.id))
      .toEqual(['captions']);
  });

  it('does not let a missing caption track stop a render', () => {
    const performance = ready();
    expect(performance.master.lyrics).toBeUndefined();
    const { items, ready: ok } = run(performance);
    expect(items.find((entry) => entry.id === 'captions')?.ok).toBe(false);
    expect(ok).toBe(true);
  });

  it('and each check fails on its own fact', () => {
    /* Coverage and gaps: a song with nothing at the front. */
    const holed = fiveTakes();
    setScene(holed, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_beach'] });
    expect(of(holed, 'gaps').ok).toBe(false);
    expect(of(holed, 'covers').ok).toBe(false);
    expect(of(holed, 'gaps').problems?.[0]?.fromSample).toBe(0);
    /* And the rest of the list is still green — a failure is not a mood. */
    expect(of(holed, 'sources').ok).toBe(true);
    expect(of(holed, 'resolution').ok).toBe(true);

    /* Sources: a take a scene names, taken away. */
    const orphan = ready();
    removeTake(orphan, 'take_beach');
    expect(of(orphan, 'sources').ok).toBe(true);

    /* Audio: the vocal mode with a take that recorded none. */
    const mute = fiveTakes();
    mute.takes[1]!.hasAudio = false;
    setScene(mute, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    setAudioMode(mute, 'master_vocal', 'take_living_room');
    expect(of(mute, 'audio').ok).toBe(true);
    mute.audio.vocalTakeId = mute.takes[1]!.id;
    expect(of(mute, 'audio').ok).toBe(false);
    expect(of(mute, 'audio').says).toMatch(/no sound/);

    /*
     * Frames: a segment shorter than one frame renders nothing. The first
     * version of this check asked whether every cut landed exactly ON a
     * frame, which fails for any cut placed from a playhead — 120000
     * samples is 62.5 frames and is an ordinary position. A checklist that
     * cries wolf is worse than no checklist.
     */
    const sliver = ready();
    expect(of(sliver, 'frames').ok).toBe(true);
    setScene(sliver, 100, { layoutId: 'performance_full', takeIds: ['take_studio'] });
    expect(of(sliver, 'frames').ok).toBe(false);
    expect(of(sliver, 'frames').says).toMatch(/shorter than a frame/);

    /* And an ordinary mid-frame cut is not a failure. */
    const normal = ready();
    setScene(normal, 120000, { layoutId: 'performance_full', takeIds: ['take_studio'] });
    expect(of(normal, 'frames').ok).toBe(true);

    /* Resolution: a profile nobody wrote. */
    expect(masterCheck(ready(), 'imax_70mm', EXPORT_PROFILES)
      .items.find((item) => item.id === 'resolution')!.ok).toBe(false);
  });

  /*
   * THE ONE THAT CLOSES A KNOWN HOLE. `transitions.ts` has said since it was
   * written that a mix "has a precondition the planner has to check: both
   * takes must have picture across the whole overlap, including the part
   * that lies outside their own scenes" — and nothing checked it. A
   * dissolve whose neighbour runs out mid-mix dips to black.
   */
  it('and catches a dissolve whose neighbour has no picture under it', () => {
    const p = fiveTakes();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living_room'] });
    const second = setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_beach'] });
    expect(of(p, 'transitions').ok).toBe(true);

    setTransition(p, second.id, 'dissolve');
    expect(of(p, 'transitions').ok).toBe(true);

    /* Now take the first take away from under the overlap. */
    trimTake(p, 'take_living_room', 0, secondsToSamples(59));
    expect(of(p, 'transitions').ok).toBe(false);
    expect(of(p, 'transitions').says).toMatch(/no picture across the dissolve/);

    /* A cut needs no overlap, so it is fine where a dissolve is not. */
    setTransition(p, second.id, 'cut');
    expect(of(p, 'transitions').ok).toBe(true);
  });
});

/**
 * AND THE REPAIRS OFFER ONLY WHAT WOULD REPAIR.  [MASTER-EDIT §13]
 *
 * The brief lists five remedies. Two cannot apply to a hole at the start of
 * a song — there is no previous take to extend and no previous frame to
 * freeze — and offering all five and failing on three is how a repair menu
 * teaches somebody to stop reading it.
 */
describe('repairing a hole', () => {
  const holed = () => {
    const p = fiveTakes();
    setScene(p, secondsToSamples(60),
      { layoutId: 'performance_full', takeIds: ['take_beach'] });
    return p;
  };

  it('offers the next take and a choice, and says why not the other two', () => {
    const p = holed();
    const [gap] = renderProblems(p);
    const repairs = repairsFor(p, gap!);
    expect(repairs.map((repair) => `${repair.id}:${repair.available}`)).toEqual([
      'use-next:true', 'choose:true',
      /*
       * `align-first` joined this list when the nudge finally got a
       * control [TIMELINE B11]. It is FALSE here because this hole is
       * in the middle of the song, and moving a take to close a hole
       * in the middle would pull everything the performer sang out of
       * time with the music.
       */
      'align-first:false',
      'use-previous:false', 'freeze:false',
    ]);
    for (const repair of repairs) expect(repair.says.length).toBeGreaterThan(0);
  });

  /*
   * AND "CHOOSE A TAKE" LISTS ONLY TAKES THAT REACH. A picker offering one
   * that does not cover the stretch has moved the error, not fixed it.
   */
  it('and lists only the takes with picture across all of it', () => {
    const p = holed();
    trimTake(p, 'take_studio', secondsToSamples(30), secondsToSamples(240));
    const [gap] = renderProblems(p);
    const choose = repairsFor(p, gap!).find((repair) => repair.id === 'choose')!;
    expect(choose.takeIds).not.toContain('take_studio');
    expect(choose.takeIds).toContain('take_living_room');
  });

  it('and putting one on closes the hole', () => {
    const p = holed();
    const [gap] = renderProblems(p);
    coverWith(p, gap!.fromSample!, gap!.toSample!, 'take_living_room');
    expect(renderProblems(p)).toEqual([]);
  });

  it('and refuses a take that would not cover it', () => {
    const p = holed();
    trimTake(p, 'take_studio', secondsToSamples(30), secondsToSamples(240));
    const [gap] = renderProblems(p);
    const was = p.scenes.length;
    expect(() => coverWith(p, gap!.fromSample!, gap!.toSample!, 'take_studio'))
      .toThrow(/no picture across all of that stretch/);
    /* And left exactly as it was. */
    expect(p.scenes.length).toBe(was);
  });
});
