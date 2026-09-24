/**
 * A Performance, rendered.  [Doctrine STUDIO-TWO §2, §5, §7, §14, INV-02, INV-03]
 *
 * "Never merge the individual takes into one irreversible video until the
 *  final master render." This is that render, and this file proves it puts the
 *  right performance on screen at the right moment of the song.
 *
 * THE FIXTURES CARRY THEIR OWN GROUND TRUTH. Each take is a flat colour, so a
 * decoded pixel says which take is on screen without anybody having to watch
 * anything. "The file exists" is not an assertion — this appendix has recorded
 * that once already, about thumbnails — so every claim here is read back out
 * of the rendered frames.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import {
  type MasterTrack, type Performance, type PerformanceTake,
} from '../../src/domain/performance.js';
import { newPerformance, setScene } from '../../src/domain/performanceEdit.js';
import {
  PerformancePlanError, buildPerformancePlan,
} from '../../src/domain/performancePlan.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG, FFPROBE } from '../../src/render/ffmpeg.js';

const run = promisify(execFile);
const SONG_SECONDS = 8;
const SONG = secondsToSamples(SONG_SECONDS);

let dir: string;
const asset = (name: string) => join(dir, `${name}.mp4`);

/** A take that is one flat colour, so a pixel names it. */
async function colouredTake(name: string, colour: string): Promise<void> {
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=${colour}:s=640x360:r=${HOUSE_FPS}:d=${SONG_SECONDS}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', asset(name),
  ]);
}

/** The colour at one moment of the finished video. */
async function colourAt(path: string, seconds: number): Promise<[number, number, number]> {
  const png = join(dir, `probe-${seconds}.png`);
  await run(FFMPEG, ['-y', '-ss', String(seconds), '-i', path, '-frames:v', '1', png]);
  // One pixel, as text, so the assertion is about a number and not about a
  // picture somebody has to look at.
  const { stdout } = await run(FFMPEG, [
    '-i', png, '-vf', 'crop=1:1:100:100,format=rgb24', '-f', 'rawvideo', '-',
  ], { encoding: 'buffer' as never, maxBuffer: 1024 * 1024 } as never);
  const bytes = stdout as unknown as Buffer;
  return [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0];
}

function take(id: string, colour: string): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: colour as AssetId,
    label: colour,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    createdAt: '2026-09-24T12:00:00.000Z',
  };
}

function master(over: Partial<MasterTrack> = {}): MasterTrack {
  return {
    assetId: 'song' as AssetId,
    title: 'The Long Way Round',
    class: 'own',
    durationSamples: SONG,
    ...over,
  };
}

function performance(over: Partial<MasterTrack> = {}): Performance {
  const p = newPerformance('A Performance', master(over), '2026-09-24T12:00:00.000Z');
  p.takes = [take('take_red', 'red'), take('take_blue', 'blue')];
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-perf-render-'));
  await colouredTake('red', 'red');
  await colouredTake('blue', 'blue');
  // The song. Silent is fine: what is being proved is where the picture cuts.
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SONG_SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 180_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('the plan a Performance renders from', () => {
  it('is one shot per scene, tiling the song exactly (INV-02, INV-03)', () => {
    const p = performance();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
    setScene(p, secondsToSamples(4), {
      layoutId: 'performance_full', takeIds: ['take_blue'],
    });

    const plan = buildPerformancePlan(p);
    expect(plan.shots).toHaveLength(2);
    let expected = 0;
    for (const shot of plan.shots) {
      expect(shot.outputStartFrame).toBe(expected);
      expected += shot.durationFrames;
    }
    expect(expected).toBe(plan.totalOutputFrames);
    expect(plan.totalOutputFrames).toBe(SONG_SECONDS * HOUSE_FPS);
  });

  it('and carries the music in its attribution, generated (U-21, INV-07)', () => {
    const p = performance({ artist: 'The Author', licence: 'CC BY 4.0', class: 'open' });
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
    const plan = buildPerformancePlan(p);
    expect(plan.attribution.text).toContain('The Long Way Round');
    expect(plan.attribution.text).toContain('The Author');
    expect(plan.attribution.text).toContain('CC BY 4.0');
  });

  it('refuses a track the author has not said they may publish (INV-15)', () => {
    /*
     * At the point an exportable artefact is DESCRIBED, not at the point a
     * button is drawn — an interface check is one refactor away from not
     * being in the path.
     */
    const p = performance({ class: 'third_party' });
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
    expect(() => buildPerformancePlan(p)).toThrow(PerformancePlanError);
    // But a private copy of your own rehearsal is not publishing.
    expect(() => buildPerformancePlan(p, { allowUnpublishable: true })).not.toThrow();
  });

  it('and refuses a song with stretches nothing is on', () => {
    const p = performance();
    setScene(p, secondsToSamples(4), {
      layoutId: 'performance_full', takeIds: ['take_red'],
    });
    expect(() => buildPerformancePlan(p)).toThrow(/no performance on them/);
  });

  it('a moved boundary changes one shot, not both (U-16)', () => {
    // The shot cache is why a change of mind is cheap. Identical hash means
    // identical bytes means no re-render.
    const before = (() => {
      const p = performance();
      setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
      setScene(p, secondsToSamples(4), { layoutId: 'performance_full', takeIds: ['take_blue'] });
      return buildPerformancePlan(p);
    })();
    const after = (() => {
      const p = performance();
      setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
      setScene(p, secondsToSamples(5), { layoutId: 'performance_full', takeIds: ['take_blue'] });
      return buildPerformancePlan(p);
    })();
    expect(after.shots[0]!.hash).not.toBe(before.shots[0]!.hash);
    expect(after.planHash).not.toBe(before.planHash);
  });
});

describe('the master video itself', () => {
  it('cuts from one performance to the other at the moment the scene says', async () => {
    /*
     * THE CLAIM OF THE WHOLE STUDIO, read back out of the pixels. Red for the
     * first half of the song, blue for the second, because the author said so
     * by pressing a number.
     */
    const p = performance();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
    setScene(p, secondsToSamples(4), { layoutId: 'performance_full', takeIds: ['take_blue'] });

    const plan = buildPerformancePlan(p);
    const out = join(dir, 'master.mp4');
    const result = await compose(plan, {
      workDir: join(dir, 'work'),
      outputPath: out,
      resolveAsset: (id) => asset(String(id)),
      masterAudioPath: join(dir, 'song.webm'),
    });

    expect(result.totalOutputFrames).toBe(SONG_SECONDS * HOUSE_FPS);

    const [r1, g1, b1] = await colourAt(out, 1);
    expect(r1).toBeGreaterThan(150);
    expect(b1).toBeLessThan(90);

    const [r2, , b2] = await colourAt(out, 6);
    expect(b2).toBeGreaterThan(150);
    expect(r2).toBeLessThan(90);
  }, 240_000);

  it('and runs exactly as long as the song (INV-03)', async () => {
    const { stdout } = await run(FFPROBE, [
      '-v', 'error', '-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0',
      join(dir, 'master.mp4'),
    ]);
    expect(Number(stdout.trim())).toBe(SONG_SECONDS * HOUSE_FPS);
  }, 120_000);

  it('with the song under it, unbroken (S-7)', async () => {
    // One continuous audio stream, not one per cut: the picture cuts, the
    // music does not.
    const { stdout } = await run(FFPROBE, [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0', join(dir, 'master.mp4'),
    ]);
    expect(stdout.trim().split('\n').filter(Boolean)).toEqual(['audio']);
  }, 120_000);

  it('and two performances share the frame when the scene says so (§5)', async () => {
    const p = performance();
    setScene(p, 0, {
      layoutId: 'performance_half', takeIds: ['take_red', 'take_blue'],
    });
    const plan = buildPerformancePlan(p);
    const out = join(dir, 'half.mp4');
    await compose(plan, {
      workDir: join(dir, 'work-half'),
      outputPath: out,
      resolveAsset: (id) => asset(String(id)),
      masterAudioPath: join(dir, 'song.webm'),
    });

    // Red on the left half of the canvas, blue on the right.
    const png = join(dir, 'half.png');
    await run(FFMPEG, ['-y', '-ss', '2', '-i', out, '-frames:v', '1', png]);
    const sample = async (x: number) => {
      const { stdout } = await run(FFMPEG, [
        '-i', png, '-vf', `crop=1:1:${x}:540,format=rgb24`, '-f', 'rawvideo', '-',
      ], { encoding: 'buffer' as never, maxBuffer: 1024 * 1024 } as never);
      const bytes = stdout as unknown as Buffer;
      return [bytes[0] ?? 0, bytes[2] ?? 0];
    };
    const [leftR, leftB] = await sample(480);
    const [rightR, rightB] = await sample(1440);
    expect(leftR!).toBeGreaterThan(leftB! + 60);
    expect(rightB!).toBeGreaterThan(rightR! + 60);
  }, 240_000);
});
