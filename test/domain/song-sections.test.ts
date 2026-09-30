/**
 * The song as a list of the stretches the export uses.
 *   [TIMELINE B6a, B6b, B6k; D-23, U-25]
 *
 * "Split ... Remove section." Both are edits to the SHAPE of the song
 * rather than to its sound, and both are one idea: the song is a list
 * of its own stretches, laid end to end; dividing makes two where
 * there was one, and removing drops one.
 *
 * WHAT THIS FILE IS REALLY DEFENDING is that nothing else in the
 * document moves. The obvious implementation of "remove a section"
 * shifts every scene, take, lyric and sound after it back by the
 * length removed. That is destructive — putting the section back
 * cannot put them where they were, because by then the author has
 * moved some of them on purpose and nothing can tell which.
 */

import { describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import {
  MIN_SONG_SAMPLES,
  projectExport, songCut, songExportedAt, songLength, songSections,
  songSourceAt, songSpan, songTrimmed,
} from '../../src/domain/performance.js';
import {
  PerformanceEditError, addSound, addTake, newPerformance, removeSection,
  setScene, splitSong, trimSong,
} from '../../src/domain/performanceEdit.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import { HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';

const SONG = secondsToSamples(240);
const AT = '2026-09-30T00:00:00.000Z';
const s = (seconds: number) => secondsToSamples(seconds);

function master(): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId, title: 'The Ancient of Days',
    class: 'own', durationSamples: SONG,
  };
}

function take(id = 'take_one'): PerformanceTake {
  return {
    id: id as TakeId, assetId: `asset_${id}` as AssetId, label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG, hasAudio: true, createdAt: AT,
  };
}

function performance(): Performance {
  const p = newPerformance('A Performance', master(), AT);
  addTake(p, take());
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  return p;
}

describe('a song nobody has edited', () => {
  it('is one stretch, the whole of it, and says so', () => {
    const p = performance();
    expect(songSections(p.master)).toEqual([{ fromSample: 0, toSample: SONG }]);
    expect(songLength(p.master)).toBe(SONG);
    expect(songTrimmed(p.master)).toBe(false);
    expect(songCut(p.master)).toBe(false);
    /* And the list is not written down: a document that looks edited
       when it is not is a document nobody can read. */
    expect(p.master.sections).toBeUndefined();
  });

  it('maps every moment to itself, both ways', () => {
    const p = performance();
    for (const at of [0, 1, s(60), SONG - 1]) {
      expect(songSourceAt(p.master, at)).toBe(at);
      expect(songExportedAt(p.master, at)).toBe(at);
    }
  });
});

describe('dividing the song', () => {
  /*
   * A DIVISION CHANGES NOTHING ABOUT THE EXPORT, and that is the
   * point rather than a shortcoming: it is not an edit, it is a place
   * to edit FROM.
   */
  it('makes two stretches that together are the whole song', () => {
    const p = performance();
    splitSong(p, s(60));
    expect(songSections(p.master)).toEqual([
      { fromSample: 0, toSample: s(60) },
      { fromSample: s(60), toSample: SONG },
    ]);
    expect(songLength(p.master)).toBe(SONG);
    expect(songTrimmed(p.master)).toBe(false);
    expect(songCut(p.master)).toBe(true);
  });

  it('divides again, inside either half', () => {
    const p = performance();
    splitSong(p, s(60));
    splitSong(p, s(30));
    splitSong(p, s(120));
    expect(songSections(p.master).map((one) => one.fromSample))
      .toEqual([0, s(30), s(60), s(120)]);
  });

  /*
   * REFUSED WHERE IT WOULD DO NOTHING, rather than quietly doing
   * nothing: a control that appears to work and does not is worse
   * than one that says why. [U-04]
   */
  it('refuses to divide where the song is already divided', () => {
    const p = performance();
    splitSong(p, s(60));
    expect(() => splitSong(p, s(60))).toThrow(/already divided/);
    expect(() => splitSong(p, 0)).toThrow(/already divided/);
    expect(() => splitSong(p, SONG)).toThrow(/already divided/);
  });

  it('refuses to divide where there is no song', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    expect(() => splitSong(p, s(75))).toThrow(/nothing of the song there/);
  });

  it('does not change the plan’s length', () => {
    const plain = buildPerformancePlan(performance());
    const divided = performance();
    splitSong(divided, s(60));
    expect(buildPerformancePlan(divided).totalOutputFrames)
      .toBe(plain.totalOutputFrames);
  });
});

describe('removing a stretch', () => {
  it('leaves what is on either side of it', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    expect(songSections(p.master)).toEqual([
      { fromSample: 0, toSample: s(60) },
      { fromSample: s(90), toSample: SONG },
    ]);
    expect(songLength(p.master)).toBe(SONG - s(30));
    expect(songCut(p.master)).toBe(true);
    expect(songTrimmed(p.master)).toBe(true);
  });

  /*
   * THE FIRST SAMPLE AFTER THE HOLE IS THE FIRST SAMPLE OF THE NEXT
   * STRETCH, not the one after the sample before it. Every reader
   * that turns an output position into a place to read from goes
   * through `songSourceAt`, and getting this wrong is a video whose
   * picture and sound drift apart by exactly the length removed.
   */
  it('maps the export onto the song across the hole', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    expect(songSourceAt(p.master, 0)).toBe(0);
    expect(songSourceAt(p.master, s(60) - 1)).toBe(s(60) - 1);
    expect(songSourceAt(p.master, s(60))).toBe(s(90));
    expect(songSourceAt(p.master, s(90))).toBe(s(120));
    /* Past the end is the end, which is what every clamp here says. */
    expect(songSourceAt(p.master, s(1000))).toBe(SONG);
  });

  /*
   * AND NOTHING FOR A MOMENT INSIDE THE HOLE, which is the honest
   * answer to "where does this lyric appear" for a lyric the author
   * cut out. A zero would put it at the top of the song.
   */
  it('answers nothing for a moment that was removed', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    expect(songExportedAt(p.master, s(30))).toBe(s(30));
    expect(songExportedAt(p.master, s(75))).toBeNull();
    expect(songExportedAt(p.master, s(90))).toBe(s(60));
    expect(songExportedAt(p.master, SONG)).toBe(SONG - s(30));
  });

  it('takes a stretch out of the middle of a stretch', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    removeSection(p, s(120), s(150));
    expect(songSections(p.master)).toEqual([
      { fromSample: 0, toSample: s(60) },
      { fromSample: s(90), toSample: s(120) },
      { fromSample: s(150), toSample: SONG },
    ]);
    expect(songLength(p.master)).toBe(SONG - s(60));
  });

  /* A removal spanning a division takes both halves of it. */
  it('takes whatever falls inside it, divisions and all', () => {
    const p = performance();
    splitSong(p, s(70));
    removeSection(p, s(60), s(90));
    expect(songSections(p.master)).toEqual([
      { fromSample: 0, toSample: s(60) },
      { fromSample: s(90), toSample: SONG },
    ]);
  });

  it('refuses an empty one, one outside the song, and one that leaves nothing', () => {
    const p = performance();
    expect(() => removeSection(p, s(60), s(60))).toThrow(/empty/);
    expect(() => removeSection(p, s(60), s(300))).toThrow(/outside the song/);
    expect(() => removeSection(p, 0, SONG)).toThrow(PerformanceEditError);
    expect(() => removeSection(p, 0, SONG)).toThrow(/shortest a video can be/);
    expect(p.master.sections).toBeUndefined();
  });

  /* One press puts everything back, holes included. [D-23, U-25] */
  it('is undone by using all of the song again', () => {
    const p = performance();
    splitSong(p, s(60));
    removeSection(p, s(90), s(120));
    trimSong(p, null, null);
    expect(p.master.sections).toBeUndefined();
    expect(songLength(p.master)).toBe(SONG);
  });
});

describe('what does NOT move', () => {
  /*
   * THE WHOLE ARGUMENT FOR THE MODEL. A scene at 02:41 is still at
   * 02:41 after a stretch before it is removed. It appears EARLIER in
   * the finished video, because the video is shorter — but the
   * document was not rewritten, so putting the stretch back puts
   * everything exactly where it was.
   */
  it('leaves every scene, take and sound on the song’s own clock', () => {
    const p = performance();
    setScene(p, s(120), { layoutId: 'performance_full', takeIds: ['take_one'] });
    addSound(p, {
      id: 'snd_one', assetId: 'asset_clap' as AssetId, label: 'Applause',
      track: 'effect', fromSample: s(150), durationSamples: HOUSE_SAMPLE_RATE,
      createdAt: AT,
    });

    removeSection(p, s(30), s(60));

    expect(p.scenes.map((one) => one.fromSample)).toEqual([0, s(120)]);
    expect(p.sounds?.[0]?.fromSample).toBe(s(150));
    expect(p.takes[0]?.alignment.offsetSamples).toBe(0);
    expect(p.takes[0]?.alignment.nudgeSamples).toBeUndefined();
  });

  /* And the export IS shorter, which is the half a document that did
     not move would otherwise be missing. */
  it('makes the export shorter by exactly what was removed', () => {
    const plain = buildPerformancePlan(performance());
    const cut = performance();
    removeSection(cut, s(30), s(60));
    const after = buildPerformancePlan(cut);
    expect(after.totalOutputFrames)
      .toBe(plain.totalOutputFrames - Math.round(30 * 30));
  });

  /* A shorter export is a different plan, or the cache serves the
     version with the removed bars still in it. [U-16] */
  it('changes the plan hash', () => {
    const cut = performance();
    removeSection(cut, s(30), s(60));
    expect(buildPerformancePlan(cut).planHash)
      .not.toBe(buildPerformancePlan(performance()).planHash);
  });
});

describe('the sound, laid end to end', () => {
  /*
   * THE SECOND STRETCH LANDS AFTER THE FIRST, and its media is read
   * from where it actually is in the song. A piece that thought it
   * started at its place in the SONG would play the last chorus over
   * the first verse — which is what the first version of the plan
   * did, before the sections were given an origin.
   */
  it('puts the second stretch after the first, read from its own place', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    const pieces = (buildPerformancePlan(p).performanceAudio ?? [])
      .filter((one) => one.kind === 'master')
      .sort((a, b) => a.fromSample - b.fromSample);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({
      fromSample: 0, toSample: s(60), mediaFromSample: 0,
    });
    expect(pieces[1]).toMatchObject({
      fromSample: s(60), toSample: SONG - s(30), mediaFromSample: s(90),
    });
  });

  /* The two pieces tile the export with no gap and no overlap, which
     is the property a click at the join would come from. */
  it('tiles the export exactly', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    removeSection(p, s(120), s(150));
    const pieces = (buildPerformancePlan(p).performanceAudio ?? [])
      .filter((one) => one.kind === 'master')
      .sort((a, b) => a.fromSample - b.fromSample);
    let at = 0;
    for (const piece of pieces) {
      expect(piece.fromSample).toBe(at);
      at = piece.toSample;
    }
    expect(at).toBe(songLength(p.master));
  });
});

describe('trimming a song that has already been cut', () => {
  /*
   * WHAT IS LEFT, NOT THE DISTANCE BETWEEN THE MARKS. A song already
   * cut in the middle has less between two marks than the marks
   * suggest, and measuring the distance would let a trim leave a
   * two-second export while reporting ten.
   */
  it('counts what is left, not the distance between the marks', () => {
    const p = performance();
    /* 0–1s and 239–240s survive: two seconds of song, with 238 of
       nothing between them. */
    removeSection(p, s(1), s(239));
    expect(songLength(p.master)).toBe(s(2));

    /*
     * A TRIM WHOSE MARKS ARE 239 SECONDS APART AND WHICH LEAVES ONE.
     * Measuring `to - from` would call this a 239-second export and
     * allow it; what is actually left is half a second at each end.
     */
    expect(() => trimSong(p, s(0.5), s(239.5))).toThrow(/shortest a video/);
    expect(() => trimSong(p, s(0.5), s(239.5))).toThrow(/leaves 1.0s of song/);
    /* And a removal is measured the same way. */
    expect(() => removeSection(p, s(0.5), s(1))).toThrow(/shortest a video/);
  });

  it('keeps the holes inside the window it leaves', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    trimSong(p, s(30), s(180));
    expect(songSections(p.master)).toEqual([
      { fromSample: s(30), toSample: s(60) },
      { fromSample: s(90), toSample: s(180) },
    ]);
    expect(songLength(p.master)).toBe(s(120));
  });

  it('still reports the outer bounds as the span', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    expect(songSpan(p.master)).toEqual({ fromSample: 0, toSample: SONG });
  });
});

describe('a document written before there were sections', () => {
  /*
   * `use` SAID THE SAME THING FOR ONE STRETCH, so it is read as one
   * — and the reader answers it whether or not the store has
   * migrated the document yet, because a reader that depends on a
   * migration having run is a reader that is wrong in a test.
   */
  it('is read as one stretch', () => {
    const old = master();
    old.use = { fromSample: s(30), toSample: s(90) };
    expect(songSections(old)).toEqual([{ fromSample: s(30), toSample: s(90) }]);
    expect(songLength(old)).toBe(s(60));
  });

  it('is overridden by sections where a document somehow has both', () => {
    const both = master();
    both.use = { fromSample: s(30), toSample: s(90) };
    both.sections = [{ fromSample: 0, toSample: s(10) }];
    expect(songSections(both)).toEqual([{ fromSample: 0, toSample: s(10) }]);
  });

  /* A list that says nothing usable is not a reason to refuse: the
     reader answers something sane and the refusals live at the edit. */
  it('answers the whole song for a list that says nothing', () => {
    const broken = master();
    broken.sections = [];
    expect(songSections(broken)).toEqual([{ fromSample: 0, toSample: SONG }]);
    broken.sections = [{ fromSample: s(90), toSample: s(60) }];
    expect(songSections(broken)).toEqual([{ fromSample: 0, toSample: SONG }]);
  });

  it('puts an out-of-order list in order', () => {
    const jumbled = master();
    jumbled.sections = [
      { fromSample: s(90), toSample: SONG },
      { fromSample: 0, toSample: s(60) },
    ];
    expect(songSections(jumbled).map((one) => one.fromSample)).toEqual([0, s(90)]);
  });
});

describe('the projection', () => {
  /*
   * FRAMES ACCUMULATED, NOT RECOMPUTED FROM SAMPLES. Each stretch's
   * own frame count is what its shots tile; converting the summed
   * samples once would round differently and leave the plan's tiling
   * check a frame short — the check that exists because a video one
   * frame longer than its song was found forty minutes into a render.
   */
  it('tiles the output clock with no gap and no overlap', () => {
    const p = performance();
    setScene(p, s(100), { layoutId: 'performance_full', takeIds: ['take_one'] });
    /*
     * CUT ONE SAMPLE PAST A FRAME, DELIBERATELY AND EXACTLY HERE.
     *
     * 1600 samples is a frame and `samplesToFrames` floors, so most
     * cuts give the same answer whichever way the frames are counted
     * — a first version of this test used 61.015s to 97.005s and a
     * mutation that recomputed the total from the summed samples
     * survived it. At 61s to 97s+1 the two disagree by one frame:
     * summing each stretch's own count gives 6120, converting the
     * summed samples once gives 6119, and 6120 is what the shots
     * tile.
     */
    removeSection(p, s(61), s(97) + 1);
    const timeline = projectExport(p);
    let frame = 0;
    for (const span of timeline.spans) {
      expect(span.outputStartFrame).toBe(frame);
      frame += span.durationFrames;
    }
    expect(frame).toBe(timeline.totalOutputFrames);
    /* And it is the sum of the stretches' own counts, which is the
       number that differs from the other way of getting it. */
    expect(timeline.totalOutputFrames).toBe(6120);
  });

  /*
   * AND THE PLAN'S OWN TILING CHECK AGREES, which is the check that
   * exists because a video one frame longer than its song was found
   * forty minutes into a render. Building the plan at all is the
   * assertion: it throws when the shots do not tile. [INV-02, INV-03]
   */
  it('builds a plan whose shots tile, with the cut between frames', () => {
    const p = performance();
    setScene(p, s(100), { layoutId: 'performance_full', takeIds: ['take_one'] });
    removeSection(p, s(61), s(97) + 1);
    const plan = buildPerformancePlan(p);
    let frame = 0;
    for (const shot of plan.shots) {
      expect(shot.outputStartFrame).toBe(frame);
      frame += shot.durationFrames;
    }
    expect(frame).toBe(plan.totalOutputFrames);
  });

  it('is the whole song when nothing has been cut', () => {
    const p = performance();
    expect(projectExport(p).totalSamples).toBe(SONG);
    expect(projectExport(p).totalOutputFrames).toBe(240 * 30);
  });

  /* A clip is a window on the song's OWN clock, whatever has been cut
     out of the verse before it. [§14] */
  it('intersects a clip window with the stretches that remain', () => {
    const p = performance();
    removeSection(p, s(60), s(90));
    const clip = projectExport(p, { fromSample: s(30), toSample: s(120) });
    expect(clip.totalSamples).toBe(s(60));
  });

  it('is at least the shortest thing worth exporting', () => {
    expect(MIN_SONG_SAMPLES).toBe(2 * HOUSE_SAMPLE_RATE);
  });
});
