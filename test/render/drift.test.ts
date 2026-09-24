/**
 * A take whose clock is not the song's, rendered.
 * [Doctrine STUDIO-TWO §10, S-3, INV-14, INV-03]
 *
 * The correction is a RATIO, so the test has to be about where something
 * appears in time rather than about a number in a plan. The fixture's picture
 * changes colour at a known moment of its own media; at a ratio of two the
 * change has to arrive at half that moment of the song, and the finished video
 * still has to be exactly as long as the music.
 *
 * The ratio is exaggerated on purpose. Real drift is twenty parts per million
 * and invisible in eight seconds of test footage — which is exactly why a
 * correction applied the wrong way round would pass a gentler test.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { newPerformance, setScene } from '../../src/domain/performanceEdit.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import { planPerformanceAudio } from '../../src/domain/performanceAudio.js';
import { mixGraph } from '../../src/render/mix.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG, FFPROBE } from '../../src/render/ffmpeg.js';

const run = promisify(execFile);
const SONG_SECONDS = 8;
const SONG = secondsToSamples(SONG_SECONDS);
/**
 * The take is longer than the song, because a take whose clock runs at twice
 * the song's needs twice as much of itself to cover it — which is the model
 * being right rather than the fixture being generous: `coverage` divides the
 * take's own length by the ratio, so an eight-second take at a ratio of two
 * covers four seconds of song and INV-03 refuses to render the rest.
 */
const TAKE_SECONDS = 16;
/** The take's picture turns from red to blue here, in ITS OWN media. */
const TURNS_AT = 4;

let dir: string;

function take(rateRatio: number): PerformanceTake {
  return {
    id: 'take_one' as TakeId,
    assetId: 'shot' as AssetId,
    label: 'Take one',
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio, method: 'heard' },
    durationSamples: secondsToSamples(TAKE_SECONDS),
    hasAudio: false,
    createdAt: '2026-09-24T12:00:00.000Z',
  };
}

function performance(rateRatio: number): Performance {
  const p = newPerformance('A Performance', {
    assetId: 'song' as AssetId, title: 'The Long Way Round',
    class: 'own', durationSamples: SONG,
  } as MasterTrack, '2026-09-24T12:00:00.000Z');
  p.takes = [take(rateRatio)];
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-drift-'));
  // Red, then blue at exactly four seconds of the take's own media.
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=red:s=320x180:r=${HOUSE_FPS}:d=${TAKE_SECONDS}`,
    '-vf', `drawbox=x=0:y=0:w=iw:h=ih:color=blue@1:t=fill:enable='gte(t,${TURNS_AT})'`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'shot.mp4'),
  ]);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SONG_SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 240_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function colourAt(path: string, seconds: number): Promise<'red' | 'blue' | 'other'> {
  const png = join(dir, `probe-${seconds}-${Math.random()}.png`);
  await run(FFMPEG, ['-y', '-ss', String(seconds), '-i', path, '-frames:v', '1', png]);
  const { stdout } = await run(FFMPEG, [
    '-i', png, '-vf', 'crop=1:1:960:540,format=rgb24', '-f', 'rawvideo', '-',
  ], { encoding: 'buffer' as never, maxBuffer: 1024 * 1024 } as never);
  const bytes = stdout as unknown as Buffer;
  const [r, , b] = [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0];
  if (r > 140 && b < 90) return 'red';
  if (b > 140 && r < 90) return 'blue';
  return 'other';
}

async function frames(path: string): Promise<number> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path,
  ]);
  return Number(String(stdout).trim());
}

async function render(p: Performance, name: string): Promise<string> {
  const out = join(dir, `${name}.mp4`);
  await compose(buildPerformancePlan(p), {
    workDir: join(dir, `work-${name}`),
    outputPath: out,
    resolveAsset: () => join(dir, 'shot.mp4'),
    masterAudioPath: join(dir, 'song.webm'),
  });
  return out;
}

describe('the plan carries the ratio only where it was measured', () => {
  it('leaves it out entirely for a take nothing measured', () => {
    const shot = buildPerformancePlan(performance(1)).shots[0]!;
    if (shot.kind !== 'performance') throw new Error('expected a performance shot');
    expect(shot.takes[0]!.rateRatio).toBeUndefined();
  });

  it('and carries it, to the renderer and to the mixer, when it did', () => {
    const p = performance(1.0002);
    const shot = buildPerformancePlan(p).shots[0]!;
    if (shot.kind !== 'performance') throw new Error('expected a performance shot');
    expect(shot.takes[0]!.rateRatio).toBe(1.0002);

    p.takes[0]!.hasAudio = true;
    const graph = mixGraph(planPerformanceAudio(p), () => 0, SONG);
    expect(graph).toContain('atempo=1.000200000');
  });
});

describe('the finished picture', () => {
  it('plays a take at its own clock when nothing was measured', async () => {
    const out = await render(performance(1), 'plain');
    expect(await colourAt(out, TURNS_AT - 1)).toBe('red');
    expect(await colourAt(out, TURNS_AT + 1)).toBe('blue');
    expect(await frames(out)).toBe(SONG_SECONDS * HOUSE_FPS);
  }, 240_000);

  /*
   * A ratio of two means the take's clock ran at twice the song's: two of its
   * samples per one of the song's. So the song reaches the take's four-second
   * mark after two seconds — and if the correction were inverted, the change
   * would arrive at eight instead and this test would see red throughout.
   */
  it('and plays a fast take fast, so its moments land where the song is', async () => {
    const out = await render(performance(2), 'fast');
    expect(await colourAt(out, 1)).toBe('red');
    expect(await colourAt(out, TURNS_AT / 2 + 1)).toBe('blue');
    // And the video is still exactly as long as the song. [INV-03]
    expect(await frames(out)).toBe(SONG_SECONDS * HOUSE_FPS);
  }, 240_000);
});
