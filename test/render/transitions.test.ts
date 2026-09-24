/**
 * How one shot becomes the next.  [Doctrine STUDIO-TWO §11, S-8, INV-02, INV-03]
 *
 * §11 lists eight transitions; S-8 said four earn their place and that *match
 * movement* is a research problem in a costume. What is built is Cut,
 * Dissolve and Fade — and Beat cut, which is a cut in the right place rather
 * than a fourth style.
 *
 * THE FIXTURES CARRY THEIR OWN GROUND TRUTH: red becomes blue, so the middle
 * of a dissolve is a pixel with both in it and the middle of a fade is a pixel
 * with neither. And the whole video is still exactly as long as the song,
 * because a transition is paid for out of the shots it joins rather than added
 * to them.
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
import {
  PerformanceEditError, newPerformance, setScene, setTransition,
} from '../../src/domain/performanceEdit.js';
import {
  PerformancePlanError, buildPerformancePlan,
} from '../../src/domain/performancePlan.js';
import { TRANSITIONS, overlapSplit, transitionFor } from '../../src/domain/transitions.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG } from '../../src/render/ffmpeg.js';

const run = promisify(execFile);
const SONG_SECONDS = 8;
const SONG = secondsToSamples(SONG_SECONDS);
const CUT_AT = 4;

let dir: string;
const asset = (name: string) => join(dir, `${name}.mp4`);

function take(id: string, over: Partial<PerformanceTake> = {}): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: id.replace('take_', '') as AssetId,
    label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    hasAudio: false,
    createdAt: '2026-09-24T12:00:00.000Z',
    ...over,
  };
}

function master(): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'The Long Way Round',
    class: 'own', durationSamples: SONG,
  };
}

/** Red for the first half, blue for the second, with a boundary to dress. */
function performance(transition?: string): Performance {
  const p = newPerformance('A Performance', master(), '2026-09-24T12:00:00.000Z');
  p.takes = [take('take_red'), take('take_blue')];
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
  setScene(p, secondsToSamples(CUT_AT), {
    layoutId: 'performance_full', takeIds: ['take_blue'],
  });
  if (transition) {
    const second = p.scenes.find((scene) => scene.fromSample > 0)!;
    setTransition(p, second.id, transition);
  }
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-transitions-'));
  for (const colour of ['red', 'blue']) {
    await run(FFMPEG, [
      '-y', '-f', 'lavfi',
      '-i', `color=c=${colour}:s=320x180:r=${HOUSE_FPS}:d=${SONG_SECONDS}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', asset(colour),
    ]);
  }
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SONG_SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 240_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/** The colour at one frame of the finished video. */
async function colourAtFrame(path: string, frame: number): Promise<[number, number, number]> {
  const png = join(dir, `probe-${frame}.png`);
  await run(FFMPEG, [
    '-y', '-i', path, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1',
    '-fps_mode', 'passthrough', png,
  ]);
  const { stdout } = await run(FFMPEG, [
    '-i', png, '-vf', 'crop=1:1:100:60,format=rgb24', '-f', 'rawvideo', '-',
  ], { encoding: 'buffer' as never, maxBuffer: 1024 * 1024 } as never);
  const bytes = stdout as unknown as Buffer;
  return [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0];
}

async function render(p: Performance, name: string): Promise<string> {
  const out = join(dir, `${name}.mp4`);
  await compose(buildPerformancePlan(p), {
    workDir: join(dir, `work-${name}`),
    outputPath: out,
    resolveAsset: (id) => asset(String(id)),
    masterAudioPath: join(dir, 'song.webm'),
  });
  return out;
}

describe('a transition is paid for out of the shots it joins (INV-03)', () => {
  it('leaves the song exactly as long as it was', () => {
    for (const style of Object.keys(TRANSITIONS)) {
      const plan = buildPerformancePlan(performance(style));
      const total = plan.shots.reduce((sum, shot) => sum + shot.durationFrames, 0);
      expect(total).toBe(SONG_SECONDS * HOUSE_FPS);
      expect(total).toBe(plan.totalOutputFrames);
    }
  });

  it('and the shots still tile the output clock with no gap (INV-02)', () => {
    const plan = buildPerformancePlan(performance('dissolve'));
    let frame = 0;
    for (const shot of plan.shots) {
      expect(shot.outputStartFrame).toBe(frame);
      frame += shot.durationFrames;
    }
    expect(frame).toBe(plan.totalOutputFrames);
  });

  it('taking half from each side, centred on the moment the author chose', () => {
    const plain = buildPerformancePlan(performance());
    const dissolved = buildPerformancePlan(performance('dissolve'));
    const style = transitionFor('dissolve');
    const { before, after } = overlapSplit(style);

    expect(dissolved.shots).toHaveLength(3);
    expect(dissolved.shots[1]!.kind).toBe('transition');
    expect(dissolved.shots[1]!.durationFrames).toBe(style.frames);
    expect(dissolved.shots[0]!.durationFrames)
      .toBe(plain.shots[0]!.durationFrames - before);
    expect(dissolved.shots[2]!.durationFrames)
      .toBe(plain.shots[1]!.durationFrames - after);
  });

  /*
   * The bug this test exists for: the shot hash is the address of the shot's
   * bytes on disk (U-16), and shortening a shot to pay for a dissolve changes
   * its bytes. Hashing before the adjustment would serve a cached file of the
   * old length — a video longer than its own song, from the cache, on the
   * second render only.
   */
  it('and a shortened shot is not the same shot as it was', () => {
    const plain = buildPerformancePlan(performance());
    const dissolved = buildPerformancePlan(performance('dissolve'));
    expect(dissolved.shots[0]!.hash).not.toBe(plain.shots[0]!.hash);
  });

  it('refuses a transition longer than what it joins, with the remedy', () => {
    const p = performance();
    // A scene one frame long cannot give up eight frames to a fade.
    setScene(p, SONG - 1600, { layoutId: 'performance_full', takeIds: ['take_red'] });
    const last = [...p.scenes].sort((a, b) => b.fromSample - a.fromSample)[0]!;
    setTransition(p, last.id, 'fade');
    expect(() => buildPerformancePlan(p)).toThrow(PerformancePlanError);
    expect(() => buildPerformancePlan(p)).toThrow(/shorten it to a cut/);
  });

  /*
   * During an overlap both performances are on screen — including the one
   * whose scene has ended. A take that stops at the boundary cannot dissolve
   * out of it, and the honest answer names the take.
   */
  it('refuses one whose takes do not reach across it', () => {
    const p = performance('dissolve');
    p.takes[0]!.useToSample = secondsToSamples(CUT_AT);
    expect(() => buildPerformancePlan(p)).toThrow(/does not reach that far|use a cut/);
  });

  it('and refuses a style nobody wrote, at the edit rather than the export', () => {
    const p = performance();
    const second = p.scenes.find((scene) => scene.fromSample > 0)!;
    expect(() => setTransition(p, second.id, 'match_movement'))
      .toThrow(PerformanceEditError);
    // S-8's judgement, in code: the four that work are offered and the rest
    // are not pretended at.
    expect(Object.keys(TRANSITIONS)).toEqual(['cut', 'dissolve', 'fade']);
  });
});

describe('the finished picture', () => {
  it('cuts hard when nothing was asked for', async () => {
    const out = await render(performance(), 'cut');
    const boundary = CUT_AT * HOUSE_FPS;
    const [rBefore] = await colourAtFrame(out, boundary - 2);
    const [rAfter, , bAfter] = await colourAtFrame(out, boundary + 2);
    expect(rBefore).toBeGreaterThan(150);
    expect(bAfter).toBeGreaterThan(150);
    expect(rAfter).toBeLessThan(90);
  }, 240_000);

  it('dissolves through a frame that is both performances at once (§11)', async () => {
    const out = await render(performance('dissolve'), 'dissolve');
    const middle = CUT_AT * HOUSE_FPS;

    // Halfway through a red-to-blue dissolve, a pixel is neither red nor blue
    // and is made of both — which is the only thing "dissolve" can mean.
    const [r, , b] = await colourAtFrame(out, middle);
    expect(r).toBeGreaterThan(40);
    expect(b).toBeGreaterThan(40);
    expect(Math.abs(r - b)).toBeLessThan(150);

    // And it is finished by the time the next section is properly under way.
    const [rLater, , bLater] = await colourAtFrame(out, middle + HOUSE_FPS);
    expect(bLater).toBeGreaterThan(150);
    expect(rLater).toBeLessThan(90);
  }, 240_000);

  it('and fades through black when that is what was asked for', async () => {
    const out = await render(performance('fade'), 'fade');
    const middle = CUT_AT * HOUSE_FPS;
    const [r, g, b] = await colourAtFrame(out, middle);
    // A breath between sections: at the middle there is nearly nothing there.
    expect(r + g + b).toBeLessThan(150);
  }, 240_000);
});
