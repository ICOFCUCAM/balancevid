/**
 * Does the stabiliser actually steady anything.
 * [MASTER-EDIT §5, §8, §12 P2; Doctrine INV-02, U-02]
 *
 * `test/domain/stabilize.test.ts` proves the rows and the refusals. This
 * proves the two things no arithmetic can:
 *
 *   THE PICTURE COMES OUT STEADIER, measured rather than believed. A
 *   stabiliser is easy to ship broken — the filter graph is accepted, the
 *   render succeeds, the file plays, and the shake is still there.
 *
 *   AND THE FRAME COUNT DID NOT MOVE. `vidstabtransform` moves each
 *   frame's contents and keeps the frame, which is the only reason this
 *   feature is allowed near a product built on INV-02. "Does not" is a
 *   claim about a filter; this counts.
 *
 * And it renders a whole performance through `compose`, because the cleanup
 * work established what happens otherwise: deleting the one line that
 * applies the thing leaves every plan-level test passing.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import {
  addTake, newPerformance, setScene, setStabilize,
} from '../../src/domain/performanceEdit.js';
import { STABILIZERS } from '../../src/domain/stabilize.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG, ffmpegCapture, run } from '../../src/render/ffmpeg.js';
import { detectShake } from '../../src/render/ingest.js';

const SECONDS = 4;
const SONG = secondsToSamples(SECONDS);

let dir: string;

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-stabilize-'));
  /*
   * A SHAKY TAKE, MADE BY SHAKING A STEADY ONE. The crop window walks on
   * two out-of-phase sinusoids, which is what handheld looks like to a
   * motion estimator: movement with no consistent direction. A single
   * sinusoid would be a pan, and a stabiliser is supposed to leave a pan
   * mostly alone.
   */
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `testsrc2=s=400x224:r=${HOUSE_FPS}:d=${SECONDS}`,
    '-vf', 'crop=320:180:40+10*sin(n/2.7):22+10*cos(n/3.1)',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'shaky.mp4'),
  ]);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 180_000);

/**
 * How much the picture moves, frame to frame.
 *
 * `signalstats` reports YDIF: the mean absolute difference between this
 * frame's luma and the last one's. On a still scene being shaken, that IS
 * the shake — there is nothing else in the picture changing. Averaged over
 * the take, it is one number that goes down when the shake comes out.
 */
async function movement(path: string): Promise<number> {
  const { stdout } = await ffmpegCapture([
    '-i', path, '-vf', 'signalstats,metadata=print:file=-', '-an', '-f', 'null', '-',
  ]);
  const found = [...stdout.matchAll(/lavfi\.signalstats\.YDIF=([\d.]+)/g)]
    .map((m) => Number(m[1]));
  /* The first frame has nothing to differ from. */
  const rest = found.slice(1);
  if (rest.length === 0) throw new Error('no YDIF in the output');
  return rest.reduce((sum, each) => sum + each, 0) / rest.length;
}

async function frames(path: string): Promise<number> {
  const { stderr } = await ffmpegCapture(['-i', path, '-f', 'null', '-']);
  const found = [...stderr.matchAll(/frame=\s*(\d+)/g)].map((m) => Number(m[1]));
  if (found.length === 0) throw new Error('no frame count');
  return found[found.length - 1]!;
}

describe('measuring the shake', () => {
  it('writes down where every frame moved', async () => {
    const trf = join(dir, 'shaky.trf');
    await detectShake(join(dir, 'shaky.mp4'), trf, STABILIZERS['gentle']!);
    const written = await stat(trf);
    expect(written.size).toBeGreaterThan(100);
  }, 120_000);
});

describe('a performance rendered with the stabiliser on', () => {
  function master(): MasterTrack {
    return {
      assetId: 'song' as AssetId, title: 'The Long Way Round',
      class: 'own', durationSamples: SONG,
    };
  }

  function take(): PerformanceTake {
    return {
      id: 'take_1' as TakeId,
      assetId: 'shaky' as AssetId,
      label: 'take_1',
      environment: { kind: 'original' },
      alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
      durationSamples: SONG,
      hasAudio: false,
      createdAt: '2026-09-29T12:00:00.000Z',
    };
  }

  function build(row: string | null): Performance {
    const p = newPerformance('A Performance', master(), '2026-09-29T12:00:00.000Z');
    addTake(p, take());
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
    if (row) setStabilize(p, 'take_1', row);
    return p;
  }

  async function render(p: Performance, name: string): Promise<string> {
    const out = join(dir, `${name}.mp4`);
    await compose(buildPerformancePlan(p), {
      workDir: join(dir, `work-${name}`),
      outputPath: out,
      resolveAsset: (assetId) => join(dir, `${assetId}.mp4`),
      resolveStill: (id) => join(dir, `${id}.png`),
      resolveTransforms: (id) => join(dir, `${id}.trf`),
      masterAudioPath: join(dir, 'song.webm'),
    });
    return out;
  }

  it('comes out steadier than the same performance without it', async () => {
    await detectShake(
      join(dir, 'shaky.mp4'), join(dir, 'shakystab.trf'), STABILIZERS['strong']!);

    const plain = await render(build(null), 'plain');
    const steady = await render(build('strong'), 'steady');

    const before = await movement(plain);
    const after = await movement(steady);
    expect(after, `${before} of movement -> ${after}`).toBeLessThan(before * 0.8);
  }, 300_000);

  /*
   * INV-02, ASKED OF THE ONE FILTER IN THIS PRODUCT THAT MOVES PICTURES
   * AROUND. A stabiliser that dropped a frame would move every cut after
   * it, and it would present as a video that drifts out of sync near the
   * end rather than as a stabiliser bug.
   */
  it('does not drop or add a single frame', async () => {
    await detectShake(
      join(dir, 'shaky.mp4'), join(dir, 'shakystab.trf'), STABILIZERS['strong']!);
    const plain = await frames(await render(build(null), 'plain2'));
    const steady = await frames(await render(build('strong'), 'steady2'));
    expect(plain).toBe(SECONDS * HOUSE_FPS);
    expect(steady).toBe(plain);
  }, 300_000);
});
