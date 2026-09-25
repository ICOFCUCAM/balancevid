/**
 * Footage: the sea, the birds, and everything nobody performed.
 * [Doctrine STUDIO-TWO §2, §5, §9, §14, S-29, INV-15]
 *
 * "Sometimes we would upload videos of the waves in the sea, birds moving and
 *  animals running to add with the music."
 *
 * Footage shares a take's slot and almost nothing else. What is proved here:
 *
 *   it occupies the same slots, so no layout has to ask what it is;
 *   it loops, and a looping ten seconds covers a four-minute song;
 *   it is never heard, in any audio mode, and can never be the vocal;
 *   it cannot be published until somebody says whose it is;
 *   a performance still plays once, because a singer who stopped has stopped.
 */
import { describe, expect, it } from 'vitest';

import {
  type MasterTrack, type Performance, type PerformanceTake,
  coverage, everythingMayBePublished, isFootage, unpublishableFootage,
} from '../../src/domain/performance.js';
import {
  PerformanceEditError,
  addTake, newPerformance, setAudioMode, setFootageRights, setLoop, setScene,
} from '../../src/domain/performanceEdit.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import { planPerformanceAudio } from '../../src/domain/performanceAudio.js';
import { HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';
import type { AssetId, TakeId } from '../../src/domain/document.js';

const AT = '2026-09-25T12:00:00.000Z';
/** Four minutes, which is a song. */
const SONG = secondsToSamples(240);
/** Ten seconds, which is a clip of waves. */
const CLIP = secondsToSamples(10);

function master(over: Partial<MasterTrack> = {}): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId,
    title: 'The Long Way Round',
    class: 'own',
    durationSamples: SONG,
    ...over,
  };
}

function singer(id = 'take_singer'): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: 'asset_singer' as AssetId,
    label: 'Living room',
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    hasAudio: true,
    createdAt: AT,
  };
}

function waves(over: Partial<PerformanceTake> = {}): PerformanceTake {
  return {
    id: 'take_waves' as TakeId,
    assetId: 'asset_waves' as AssetId,
    kind: 'footage',
    loop: true,
    label: 'Waves at dusk',
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'unplaced' },
    durationSamples: CLIP,
    /* The route sets this before a byte arrives: not ours to use. */
    hasAudio: false,
    createdAt: AT,
    ...over,
  };
}

function withBoth(over: Partial<PerformanceTake> = {}): Performance {
  const p = newPerformance('A performance', master(), AT);
  addTake(p, singer());
  addTake(p, waves(over));
  return p;
}

describe('footage is a take, and that is the point (§2, §5, S-29)', () => {
  /*
   * The whole design rests on this. Footage and performances occupy the same
   * slots in the same layouts, take the same number keys and are cut into the
   * same scenes — so a second entity would mean a second branch at every one
   * of those places, which is what U-18 forbids.
   */
  it('goes in a scene like anything else, with no special case', () => {
    const p = withBoth();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_singer'] });
    setScene(p, SONG / 2, { layoutId: 'performance_full', takeIds: ['take_waves'] });
    expect(p.scenes).toHaveLength(2);
    expect(p.scenes[1]!.takeIds).toEqual(['take_waves']);
  });

  it('and shares a quad with somebody performing', () => {
    const p = withBoth();
    setScene(p, 0, { layoutId: 'performance_half', takeIds: ['take_singer', 'take_waves'] });
    expect(p.scenes[0]!.takeIds).toEqual(['take_singer', 'take_waves']);
  });

  it('absent `kind` means a performance, so nothing made before this changed', () => {
    const p = withBoth();
    expect(isFootage(p.takes[0]!)).toBe(false);
    expect(isFootage(p.takes[1]!)).toBe(true);
  });
});

describe('ten seconds of waves cover a four-minute song (§5, S-29)', () => {
  /*
   * Its own length says nothing about where it can go. Asking "how long is
   * the clip" to decide "which part of the song may show it" is asking the
   * wrong file.
   */
  it('looping footage covers the whole song, not its own ten seconds', () => {
    const p = withBoth();
    expect(coverage(p.takes[1]!, SONG)).toEqual({ fromSample: 0, toSample: SONG });
  });

  it('and without looping it covers only what it is', () => {
    const p = withBoth({ loop: false });
    expect(coverage(p.takes[1]!, SONG)).toEqual({ fromSample: 0, toSample: CLIP });
  });

  it('a performance is never looped — a singer who stopped has stopped', () => {
    const p = withBoth();
    expect(() => setLoop(p, 'take_singer', true)).toThrow(PerformanceEditError);
    expect(p.takes[0]!.loop).toBeUndefined();
  });

  it('and turning looping off removes the field rather than storing false', () => {
    const p = withBoth();
    setLoop(p, 'take_waves', false);
    expect('loop' in p.takes[1]!).toBe(false);
  });

  /*
   * Asking where a scene at 1:30 sits inside a ten-second clip gives a frame
   * long past the end of the file. The clip is not on the song's clock at
   * all — scenery starts when you cut to it.
   */
  it('and the plan starts it at its own beginning, wherever the scene is', () => {
    const p = withBoth();
    /* INV-03: every moment of the song is somebody's, so the song opens on
       the performer and cuts to the sea at a minute and a half. */
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_singer'] });
    setScene(p, secondsToSamples(90), { layoutId: 'performance_full', takeIds: ['take_waves'] });
    const plan = buildPerformancePlan(p, { allowUnpublishable: true });
    const shot = plan.shots.find(
      (s) => s.kind === 'performance' && s.takes.some((t) => t.takeId === 'take_waves'),
    );
    const entry = (shot as { takes: { takeId: string; mediaInFrame: number;
      loop?: boolean }[] }).takes.find((t) => t.takeId === 'take_waves')!;
    expect(entry.mediaInFrame).toBe(0);
    expect(entry.loop).toBe(true);
  });

  it('while a performance in the same plan is placed on the song clock', () => {
    const p = withBoth();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_waves'] });
    setScene(p, secondsToSamples(90), { layoutId: 'performance_full', takeIds: ['take_singer'] });
    const plan = buildPerformancePlan(p, { allowUnpublishable: true });
    const shot = plan.shots.find(
      (s) => s.kind === 'performance' && s.takes.some((t) => t.takeId === 'take_singer'),
    );
    const entry = (shot as { takes: { takeId: string; mediaInFrame: number;
      loop?: boolean }[] }).takes.find((t) => t.takeId === 'take_singer')!;
    expect(entry.mediaInFrame).toBeGreaterThan(0);
    expect(entry.loop).toBeUndefined();
  });
});

describe('footage is never heard (§9, S-29)', () => {
  /*
   * A clip of the sea has surf on it, a clip of birds has birds, and a clip
   * of a stadium has a crowd cheering a different song. Mode B means the
   * performer's microphone; taking it to mean the seagulls would put them
   * over the chorus the first time anybody cut to a beach.
   */
  it('mode B takes nothing from a scene that is showing the sea', () => {
    const p = withBoth();
    p.audio = { mode: 'take_audio' };
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_waves'] });
    const pieces = planPerformanceAudio(p);
    expect(pieces.filter((piece) => piece.assetId === 'asset_waves')).toHaveLength(0);
  });

  it('but it does take the performer, in the same mode, from the next scene', () => {
    const p = withBoth();
    p.audio = { mode: 'take_audio' };
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_waves'] });
    setScene(p, SONG / 2, { layoutId: 'performance_full', takeIds: ['take_singer'] });
    const pieces = planPerformanceAudio(p);
    expect(pieces.some((piece) => piece.assetId === 'asset_singer')).toBe(true);
  });

  it('and the waves cannot be the vocal, which is mode C\'s whole promise', () => {
    const p = withBoth();
    expect(() => setAudioMode(p, 'master_vocal', 'take_waves'))
      .toThrow(PerformanceEditError);
    expect(p.audio.mode).not.toBe('master_vocal');
  });

  it('while the performer can', () => {
    const p = withBoth();
    setAudioMode(p, 'master_vocal', 'take_singer');
    expect(p.audio).toEqual({ mode: 'master_vocal', vocalTakeId: 'take_singer' });
  });
});

describe('whose footage it is (INV-15, §14, S-29)', () => {
  /*
   * The same question the master answers, asked again because it has the same
   * answer-shape and the same consequence. A product that refuses to publish
   * somebody else's SONG while publishing somebody else's PICTURE is not
   * being careful, it is being inconsistent.
   */
  it('footage with no rights class stops the whole performance publishing', () => {
    const p = withBoth();
    expect(p.master.class).toBe('own');
    expect(everythingMayBePublished(p)).toBe(false);
    expect(unpublishableFootage(p).map((t) => t.id)).toEqual(['take_waves']);
  });

  it('and saying you filmed it lets it through', () => {
    const p = withBoth();
    setFootageRights(p, 'take_waves', 'own');
    expect(everythingMayBePublished(p)).toBe(true);
    expect(unpublishableFootage(p)).toHaveLength(0);
  });

  it("somebody else's footage is refused however the song is classed", () => {
    const p = withBoth();
    setFootageRights(p, 'take_waves', 'third_party');
    expect(everythingMayBePublished(p)).toBe(false);
  });

  /*
   * A claim with nothing behind it is worse than no claim, because it looks
   * like one. This is the rule INV-15 already applies to the master.
   */
  it('a licence has to say what it is', () => {
    const p = withBoth();
    expect(() => setFootageRights(p, 'take_waves', 'licensed'))
      .toThrow(PerformanceEditError);
    setFootageRights(p, 'take_waves', 'licensed', 'Stock library, sync licence 4471');
    expect(p.takes[1]!.rightsNote).toContain('4471');
    expect(everythingMayBePublished(p)).toBe(true);
  });

  it('and a class this build does not know is refused rather than kept', () => {
    const p = withBoth();
    expect(() => setFootageRights(p, 'take_waves', 'probably_fine'))
      .toThrow(PerformanceEditError);
    expect(p.takes[1]!.rights).toBeUndefined();
  });

  it('a performance has no rights class to set — it is the author performing', () => {
    const p = withBoth();
    expect(() => setFootageRights(p, 'take_singer', 'own')).toThrow(PerformanceEditError);
  });

  /*
   * Written as "every one of them permits it" rather than "none of them
   * forbids it", the same way round `mayPublish` is written, so an
   * unrecognised class refuses.
   */
  it('and an unpublishable song is still unpublishable with cleared footage', () => {
    const p = withBoth();
    setFootageRights(p, 'take_waves', 'own');
    p.master.class = 'third_party';
    expect(everythingMayBePublished(p)).toBe(false);
  });
});

describe('what a clip of the sea is not (§4, INV-16, S-29)', () => {
  it('it lands unplaced, because nothing about it was measured', () => {
    const p = withBoth();
    expect(p.takes[1]!.alignment.method).toBe('unplaced');
  });

  it('and a song of any length still runs at its own rate', () => {
    const p = withBoth();
    expect(p.takes[1]!.alignment.rateRatio).toBe(1);
    expect(p.master.durationSamples).toBe(SONG);
    expect(SONG / HOUSE_SAMPLE_RATE).toBe(240);
  });
});
