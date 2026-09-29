/**
 * Cleaning up a take, and never the song.
 * [MASTER-EDIT §8, §12 P2; Doctrine STUDIO-TWO §9, S-7, U-16, U-18]
 *
 * `test/render/cleanup.test.ts` renders a recording with a fan in it and
 * measures what came out. This is the other half: that the setting reaches
 * the render at all, that it reaches only what it should, and that the
 * cache cannot serve yesterday's sound for today's setting.
 */
import { describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import { CLEANUPS, NO_CLEANUP, cleanupFor } from '../../src/domain/cleanup.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { planPerformanceAudio } from '../../src/domain/performanceAudio.js';
import {
  PerformanceEditError, addTake, newPerformance, setAudioMode, setCleanup,
  setScene,
} from '../../src/domain/performanceEdit.js';
import { secondsToSamples } from '../../src/domain/time.js';

const AT = '2026-09-29T12:00:00.000Z';
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

/** One take, over the whole song, with the mic audible. */
function sung(over: Partial<PerformanceTake> = {}): Performance {
  const p = newPerformance('My Performance', master(), AT);
  addTake(p, take('take_1', over));
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
  setAudioMode(p, 'music_and_mic', null);
  return p;
}

describe('choosing a cleanup', () => {
  it('records the row the author chose', () => {
    const p = sung();
    setCleanup(p, 'take_1', 'room');
    expect(p.takes[0]!.cleanup).toBe('room');
  });

  it('takes it off again', () => {
    const p = sung();
    setCleanup(p, 'take_1', 'heavy');
    setCleanup(p, 'take_1', null);
    expect(p.takes[0]!.cleanup).toBeUndefined();
    /* And `none` is the same answer said the way a form says it. */
    setCleanup(p, 'take_1', 'heavy');
    setCleanup(p, 'take_1', NO_CLEANUP);
    expect(p.takes[0]!.cleanup).toBeUndefined();
  });

  it('refuses a row nobody wrote', () => {
    const p = sung();
    expect(() => setCleanup(p, 'take_1', 'magic'))
      .toThrow(/unknown cleanup/);
    expect(() => setCleanup(p, 'nope', 'room')).toThrow(PerformanceEditError);
  });

  /*
   * A DENOISER ON SILENCE IS NOT HARMLESS. It is a control that appears to
   * work, and the author spends twenty minutes wondering why the cleanup
   * they chose did nothing to a take that never had any sound in it.
   */
  it('refuses a take that was recorded with no sound in it', () => {
    const p = sung({ hasAudio: false });
    expect(() => setCleanup(p, 'take_1', 'room'))
      .toThrow(/no sound in it/);
    expect(p.takes[0]!.cleanup).toBeUndefined();
  });
});

describe('what reaches the mixer', () => {
  /*
   * ON THE PIECE AND NOT LOOKED UP BY THE MIXER, because the mixer is handed
   * a plan and not a document — which is what makes the plan hashable and
   * the shot cache correct. [U-16]
   */
  it('carries the row on the take pieces', () => {
    const p = sung();
    setCleanup(p, 'take_1', 'voice');
    const pieces = planPerformanceAudio(p);
    const takes = pieces.filter((piece) => piece.kind === 'take');
    expect(takes.length).toBeGreaterThan(0);
    for (const piece of takes) expect(piece.cleanup).toBe('voice');
  });

  /*
   * THE SONG IS THE AUTHOR'S MUSIC, mastered by whoever mastered it.
   * Running a denoiser over it is damage done on their behalf, which is the
   * same argument `mayShowMasterPicture` is built on.
   */
  it('never puts one on the song', () => {
    const p = sung();
    setCleanup(p, 'take_1', 'heavy');
    for (const piece of planPerformanceAudio(p)) {
      if (piece.kind === 'master') expect(piece.cleanup).toBeUndefined();
    }
  });

  it('says nothing at all when no cleanup was chosen', () => {
    for (const piece of planPerformanceAudio(sung())) {
      expect(piece.cleanup).toBeUndefined();
    }
  });

  /*
   * THE CACHE MUST NOT SERVE YESTERDAY'S SOUND. A shot's hash is the address
   * of its bytes on disk (U-16); if the plan did not change when the cleanup
   * did, an author would choose Heavy, press Create, and be handed the file
   * they already had.
   */
  it('makes a different plan when the cleanup changes', () => {
    const plain = JSON.stringify(planPerformanceAudio(sung()));
    const p = sung();
    setCleanup(p, 'take_1', 'room');
    const cleaned = JSON.stringify(planPerformanceAudio(p));
    expect(cleaned).not.toBe(plain);

    const q = sung();
    setCleanup(q, 'take_1', 'heavy');
    expect(JSON.stringify(planPerformanceAudio(q))).not.toBe(cleaned);
  });
});

describe('the rows themselves', () => {
  it('are few, and each one says what is wrong rather than what it does', () => {
    const rows = Object.values(CLEANUPS);
    /* Four, for S-8's reason about transitions: one that works three times
       in five is worse than one the author never had. */
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const row of rows) {
      expect(row.hint.length, row.id).toBeGreaterThan(20);
      /* A hint naming an ffmpeg filter is a parameter wearing a label. */
      expect(row.hint, row.id).not.toMatch(/afftdn|highpass|speechnorm|dB|Hz/);
    }
  });

  it('resolves by id and answers nothing for none', () => {
    expect(cleanupFor('room')).toBe(CLEANUPS['room']);
    expect(cleanupFor(NO_CLEANUP)).toBeUndefined();
    expect(cleanupFor(undefined)).toBeUndefined();
  });
});
