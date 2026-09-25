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
  orderedScenes, projectPerformance, sceneAt, takeToMaster,
  coversSpan,
} from '../../src/domain/performance.js';
import {
  addPlate,
  addTake, classifyMaster, clearScenes, moveScene, newPerformance, nudgeTake, realign,
  removeScene, removeTake, setAudioMode, setEnvironment, setScene, trimTake,
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
import { LAYOUTS, takeSlots } from '../../src/domain/presentation.js';

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
