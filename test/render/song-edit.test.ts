/**
 * The song is not an immutable background track.
 *   [TIMELINE B6a, B6c, B6d, B6e, B6f; INV-03, U-16, U-25]
 *
 * "The master song shouldn't be treated as an immutable background
 * track." It was one: an asset, a measured length, and every export was
 * the whole of it.
 *
 * THE FOUR THINGS PROVED HERE ARE THE FOUR THAT CAN BE MEASURED OFF A
 * RENDER — how long it is, and how loud it is at three moments — which
 * is why this is a render test and not a domain one. A trim that only
 * the planner knew about would pass every assertion about the plan and
 * export four minutes.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { songSpan, songTrimmed } from '../../src/domain/performance.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import {
  MIN_SONG_SAMPLES, PerformanceEditError, addTake, newPerformance, setScene,
  setSongSound, trimSong,
} from '../../src/domain/performanceEdit.js';
import { MUTED_DB } from '../../src/domain/performanceAudio.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG, FFPROBE, run } from '../../src/render/ffmpeg.js';
import { measureSound } from '../../src/render/ingest.js';

const SECONDS = 8;
const SONG = secondsToSamples(SECONDS);

let dir: string;
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/*
 * A SONG IN TWO HALVES: A TONE, THEN SILENCE.
 *
 * The first draft made one half loud and the other quiet, and the
 * render disproved the test rather than the code: every export is
 * mastered to a loudness target (INV-11), so a quiet half rendered on
 * its own comes back at the same level as a loud one. Mastering scales
 * whatever it is given.
 *
 * Silence is the one thing it cannot put back. So "which half did the
 * trim take" is answerable from the output at any target, and a trim
 * that took the wrong half is as visible as one that did nothing.
 */
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-song-'));
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=220:r=48000:d=${SECONDS}`,
    '-af', `volume='if(lt(t,${SECONDS / 2}),5,0)':eval=frame`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=0x304050:s=320x180:r=${HOUSE_FPS}:d=${SECONDS}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'take.mp4'),
  ]);
}, 180_000);

function master(): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'Two Halves',
    class: 'own', durationSamples: SONG,
  };
}

function take(): PerformanceTake {
  return {
    id: 'take_one' as TakeId, assetId: 'take' as AssetId, label: 'take_one',
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG, hasAudio: false,
    createdAt: '2026-09-30T00:00:00.000Z',
  };
}

function performance(): Performance {
  const p = newPerformance('A Performance', master(), '2026-09-30T00:00:00.000Z');
  addTake(p, take());
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  return p;
}

async function render(p: Performance, name: string): Promise<string> {
  const out = join(dir, `${name}.mp4`);
  await compose(buildPerformancePlan(p), {
    workDir: join(dir, `work-${name}`),
    outputPath: out,
    resolveAsset: () => join(dir, 'take.mp4'),
    resolveStill: (id) => join(dir, `${id}.png`),
    masterAudioPath: join(dir, 'song.webm'),
  });
  return out;
}

async function seconds(path: string): Promise<number> {
  const out = await run(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nk=1:nw=1', path,
  ]);
  return Number(out.trim());
}

describe('trimming the song', () => {
  it('is a window, and the whole song is no window at all', () => {
    const p = performance();
    expect(songTrimmed(p.master)).toBe(false);
    trimSong(p, 0, SONG);
    expect(p.master.use).toBeUndefined();
    trimSong(p, secondsToSamples(2), SONG);
    expect(songSpan(p.master)).toEqual({
      fromSample: secondsToSamples(2), toSample: SONG,
    });
    expect(songTrimmed(p.master)).toBe(true);
  });

  it('is taken off again', () => {
    const p = performance();
    trimSong(p, secondsToSamples(2), secondsToSamples(6));
    trimSong(p, null, null);
    expect(p.master.use).toBeUndefined();
  });

  /*
   * NOTHING ELSE IN THE DOCUMENT MOVES. A scene at 02:41 is still at
   * 02:41 after the first minute is trimmed away — renumbering the
   * master clock would mean re-timing every scene, take and lyric
   * against an edit that can be undone with one press.
   */
  it('moves no scene, no take and no lyric', () => {
    const p = performance();
    setScene(p, secondsToSamples(5), {
      layoutId: 'performance_full', takeIds: ['take_one'],
    });
    const before = JSON.stringify(p.scenes) + JSON.stringify(p.takes);
    trimSong(p, secondsToSamples(2), secondsToSamples(6));
    expect(JSON.stringify(p.scenes) + JSON.stringify(p.takes)).toBe(before);
  });

  it('refuses a trim that leaves no video', () => {
    const p = performance();
    expect(() => trimSong(p, 0, MIN_SONG_SAMPLES - 1))
      .toThrow(PerformanceEditError);
    expect(() => trimSong(p, 0, MIN_SONG_SAMPLES - 1))
      .toThrow(/shortest a video can be/);
    expect(p.master.use).toBeUndefined();
  });

  it('refuses a trim outside the song', () => {
    const p = performance();
    /* Negative is refused by `assertSamples` before this function has
       an opinion, which is the right layer for "that is not a sample
       count at all". Past the end is this function's own. */
    expect(() => trimSong(p, -1, SONG)).toThrow();
    expect(() => trimSong(p, 0, SONG + 1)).toThrow(/outside the song/);
    expect(p.master.use).toBeUndefined();
  });

  /*
   * AND A CLIP OF A TRIMMED SONG IS THE INTERSECTION. A clip of the
   * chorus from a song trimmed to its second half is the chorus — not
   * the chorus plus a minute nobody asked to export.
   */
  it('narrows a clip rather than widening it', () => {
    const p = performance();
    trimSong(p, secondsToSamples(4), SONG);
    const plan = buildPerformancePlan(p, {
      span: { fromSample: 0, toSample: secondsToSamples(6) },
    });
    const first = plan.performanceAudio?.[0];
    expect(first?.mediaFromSample).toBe(secondsToSamples(4));
    /* Two seconds of overlap, at thirty frames. */
    expect(plan.totalOutputFrames).toBe(2 * HOUSE_FPS);
  });
});

describe('a render of a trimmed song', () => {
  it('is as long as what was kept', async () => {
    expect(await seconds(await render(performance(), 'whole')))
      .toBeGreaterThan(SECONDS - 0.2);
    const half = performance();
    trimSong(half, secondsToSamples(SECONDS / 2), SONG);
    expect(await seconds(await render(half, 'half')))
      .toBeLessThan(SECONDS / 2 + 0.3);
  }, 300_000);

  /*
   * AND IT IS THE HALF THAT WAS ASKED FOR, which is the assertion the
   * length alone cannot make: a window that took the wrong four
   * seconds renders exactly as long as one that took the right four.
   */
  it('is the half that was asked for, and not the other one', async () => {
    const second = performance();
    trimSong(second, secondsToSamples(SECONDS / 2), SONG);
    const silent = await measureSound(await render(second, 'second-half'));

    const first = performance();
    trimSong(first, 0, secondsToSamples(SECONDS / 2));
    const sounding = await measureSound(await render(first, 'first-half'));

    /*
     * NOT "SILENT", BUT UNMISTAKABLY THE OTHER HALF. Mastering lifts
     * whatever it is given, so four seconds of encoded silence comes
     * back as the encoder's own floor rather than as nothing — around
     * -31 dB here. What it cannot do is invent the tone: the half
     * with music in it measures tens of decibels above it, and that
     * difference is the assertion.
     */
    expect(sounding.rmsDb - silent.rmsDb,
      `first ${sounding.rmsDb} vs second ${silent.rmsDb}`).toBeGreaterThan(10);
    expect(sounding.rmsDb, `first half ${sounding.rmsDb}`).toBeGreaterThan(-25);
  }, 300_000);
});

describe('the song’s own sound', () => {
  it('refuses a gain no fader has', () => {
    const p = performance();
    expect(() => setSongSound(p, { gainDb: 30 })).toThrow(/24 dB/);
    expect(() => setSongSound(p, { gainDb: Number.NaN })).toThrow(/not a number/);
    expect(p.master.sound).toBeUndefined();
  });

  it('refuses a fade longer than the song it is in', () => {
    const p = performance();
    expect(() => setSongSound(p, { fadeInSamples: SONG * 2 }))
      .toThrow(/longer than the song/);
  });

  it('keeps nothing when nothing is set', () => {
    const p = performance();
    setSongSound(p, { gainDb: -6 });
    expect(p.master.sound).toEqual({ gainDb: -6 });
    setSongSound(p, { gainDb: null });
    expect(p.master.sound).toBeUndefined();
  });

  /*
   * MUTE IS A GAIN OF SILENCE, NOT A MISSING PIECE. The song is the
   * clock (INV-03), and a master piece that vanished when somebody
   * pressed mute would take the length of the video with it.
   */
  it('mutes by silencing the piece, not by removing it', () => {
    const p = performance();
    setSongSound(p, { muted: true });
    const pieces = buildPerformancePlan(p).performanceAudio ?? [];
    const song = pieces.filter((piece) => piece.kind === 'master');
    expect(song.length).toBeGreaterThan(0);
    expect(song[0]!.gainDb).toBe(MUTED_DB);
    expect(buildPerformancePlan(p).totalOutputFrames)
      .toBe(buildPerformancePlan(performance()).totalOutputFrames);
  });

  /* The author's own fade wins over the hairline that stops a click. */
  it('carries the author’s fades to the ends of the export', () => {
    const p = performance();
    setSongSound(p, {
      fadeInSamples: secondsToSamples(2), fadeOutSamples: secondsToSamples(1),
    });
    const pieces = (buildPerformancePlan(p).performanceAudio ?? [])
      .filter((piece) => piece.kind === 'master');
    expect(pieces[0]!.fadeInSamples).toBe(secondsToSamples(2));
    expect(pieces.at(-1)!.fadeOutSamples).toBe(secondsToSamples(1));
  });

  /* A different sound is a different plan, or the cache serves the old
     mix for the new decision. [U-16] */
  it('changes the plan hash, so nothing stale is served', () => {
    const plain = buildPerformancePlan(performance()).planHash;
    const quiet = performance();
    setSongSound(quiet, { gainDb: -6 });
    expect(buildPerformancePlan(quiet).planHash).not.toBe(plain);
  });
});

describe('a render with the song turned down', () => {
  /*
   * WHAT THE FADER ACTUALLY DOES, discovered by a render that
   * disproved the test.
   *
   * Turning the song down by 12 dB and rendering it alone produced a
   * file measuring 0.004 dB quieter — because every export is
   * mastered to a loudness target (INV-11) and the mastering put back
   * exactly what the fader took off. The feature was working; the
   * assertion was wrong about what it is for.
   *
   * The fader is a BALANCE between the song and the voices over it,
   * and a balance survives mastering because mastering scales the
   * mix. With nothing to balance against, it does nothing at all —
   * which the control now says, because an author who turns the music
   * down on an instrumental and hears no difference has been lied to
   * by a working feature.
   */
  it('changes the mix and not the output level, on a song with no voice', async () => {
    const loud = await measureSound(await render(performance(), 'loud'));
    const quiet = performance();
    setSongSound(quiet, { gainDb: -12 });
    const measured = await measureSound(await render(quiet, 'quiet'));
    expect(Math.abs(loud.rmsDb - measured.rmsDb),
      `${loud.rmsDb} -> ${measured.rmsDb}`).toBeLessThan(1.5);
  }, 300_000);

  it('comes out silent when it is muted, and still as long', async () => {
    const silent = performance();
    setSongSound(silent, { muted: true });
    const out = await render(silent, 'muted');
    const measured = await measureSound(out);
    expect(measured.rmsDb).toBeLessThan(-60);
    expect(await seconds(out)).toBeGreaterThan(SECONDS - 0.3);
  }, 300_000);
});
