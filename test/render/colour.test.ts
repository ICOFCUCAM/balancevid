/**
 * Does the colour match actually match anything.
 * [MASTER-EDIT §6, §8, §12 P2; Doctrine U-02]
 *
 * `test/domain/colour.test.ts` proves the arithmetic against readings it
 * built itself. This proves the two ends the arithmetic sits between: that
 * `measureColour` reads a real file correctly, and that a take carrying a
 * match comes out of a REAL RENDER closer to its reference than it went in.
 *
 * The second of those exists because of what the cleanup work found a week
 * of commits ago: deleting the one line in the mixer that applied a cleanup
 * left every other test passing, because they all stopped at the plan. The
 * equivalent line here is `if (take.match)` in `compose.ts`, and nothing
 * short of rendering can tell you whether it is there.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import { matchLook } from '../../src/domain/colour.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import {
  addTake, matchColour, newPerformance, setColourReading, setScene,
} from '../../src/domain/performanceEdit.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG, run } from '../../src/render/ffmpeg.js';
import { measureColour } from '../../src/render/ingest.js';

/*
 * FOUR, NOT TWO. A two-second silent master makes the aac encoder produce
 * no frames at all and the final mux fails — which is a fixture problem and
 * not a colour one, and cost a confusing half-hour the first time.
 */
const SECONDS = 4;
const SONG = secondsToSamples(SECONDS);

/*
 * TWO TAKES OF THE SAME THING IN DIFFERENT LIGHT, which is the case the
 * feature exists for: one room, one song, two cameras that disagree. A
 * drawn rectangle on a ground gives both a spread to measure, so the
 * readings are not two flat colours that any arithmetic could match.
 */
const DARK = { ground: '0x203040', subject: '0x607080' };
const BRIGHT = { ground: '0x506070', subject: '0x90a0b0' };

let dir: string;

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function shoot(name: string, look: { ground: string; subject: string }) {
  const path = join(dir, `${name}.mp4`);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=${look.ground}:s=320x180:r=${HOUSE_FPS}:d=${SECONDS}`,
    '-vf', `drawbox=x=100:y=40:w=120:h=100:color=${look.subject}@1:t=fill`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path,
  ]);
  return path;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-colour-'));
  await shoot('dark', DARK);
  await shoot('bright', BRIGHT);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 180_000);

describe('measuring a take', () => {
  it('reads the brightness the camera actually recorded', async () => {
    const dark = await measureColour(join(dir, 'dark.mp4'), SECONDS);
    const bright = await measureColour(join(dir, 'bright.mp4'), SECONDS);
    expect(dark.frames).toBeGreaterThan(0);
    expect(bright.frames).toBeGreaterThan(0);
    expect(bright.y).toBeGreaterThan(dark.y + 20);
  }, 120_000);

  it('reads a spread, so there is contrast to match', async () => {
    const dark = await measureColour(join(dir, 'dark.mp4'), SECONDS);
    expect(dark.ySpread).toBeGreaterThan(5);
  }, 120_000);

  /*
   * A take with no picture in it is a legal document here — footage can be
   * audio-only — so this answers `frames: 0` rather than throwing, and the
   * domain reads that as "not asked" rather than "no difference".
   */
  it('says nothing was measured rather than failing on a soundtrack', async () => {
    const silent = join(dir, 'silent.m4a');
    await run(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SECONDS}`,
      '-c:a', 'aac', silent,
    ]);
    const reading = await measureColour(silent, SECONDS);
    expect(reading.frames).toBe(0);
  }, 120_000);
});

describe('the grade, applied', () => {
  it('brings the dark take towards the bright one', async () => {
    const dark = await measureColour(join(dir, 'dark.mp4'), SECONDS);
    const bright = await measureColour(join(dir, 'bright.mp4'), SECONDS);
    const look = matchLook(dark, bright)!;

    const graded = join(dir, 'graded.mp4');
    await run(FFMPEG, [
      '-y', '-i', join(dir, 'dark.mp4'),
      /*
       * `- 1` because `eq` wants an offset and a `ColourMatch` states
       * brightness the way an `EffectLook` does, where 1 is unchanged.
       * `effectChain` does the same subtraction; this is the one place in
       * the tests that speaks to `eq` directly, and getting it wrong here
       * is what a black render looks like.
       */
      '-vf', `eq=brightness=${(look.brightness - 1).toFixed(3)}`
        + `:contrast=${look.contrast.toFixed(3)}`
        + `:saturation=${look.saturation.toFixed(3)}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', graded,
    ]);
    const after = await measureColour(graded, SECONDS);

    const wasApart = Math.abs(bright.y - dark.y);
    const nowApart = Math.abs(bright.y - after.y);
    expect(nowApart, `${wasApart} apart -> ${nowApart} apart`)
      .toBeLessThan(wasApart / 2);
  }, 180_000);
});

/*
 * AND THROUGH THE REAL RENDERER, which is the test that cannot be passed by
 * a plan alone. `compose.ts` has one line that reaches for `take.match`;
 * delete it and every other test in this file and its domain twin still
 * passes.
 */
describe('a performance rendered with a match on it', () => {
  function master(): MasterTrack {
    return {
      assetId: 'song' as AssetId, title: 'The Long Way Round',
      class: 'own', durationSamples: SONG,
    };
  }

  function take(id: string, assetId: string): PerformanceTake {
    return {
      id: id as TakeId,
      assetId: assetId as AssetId,
      label: id,
      environment: { kind: 'original' },
      alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
      durationSamples: SONG,
      hasAudio: false,
      createdAt: '2026-09-29T12:00:00.000Z',
    };
  }

  async function render(p: Performance, name: string): Promise<string> {
    const out = join(dir, `${name}.mp4`);
    await compose(buildPerformancePlan(p), {
      workDir: join(dir, `work-${name}`),
      outputPath: out,
      resolveAsset: (assetId) => join(dir, `${assetId}.mp4`),
      resolveStill: (id) => join(dir, `${id}.png`),
      masterAudioPath: join(dir, 'song.webm'),
    });
    return out;
  }

  async function build(matched: boolean): Promise<Performance> {
    const p = newPerformance('A Performance', master(), '2026-09-29T12:00:00.000Z');
    addTake(p, take('take_dark', 'dark'));
    addTake(p, take('take_bright', 'bright'));
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_dark'] });
    setColourReading(p, 'take_dark', await measureColour(join(dir, 'dark.mp4'), SECONDS));
    setColourReading(p, 'take_bright', await measureColour(join(dir, 'bright.mp4'), SECONDS));
    if (matched) matchColour(p, 'take_dark', 'take_bright');
    return p;
  }

  it('comes out brighter than the same performance without one', async () => {
    const plain = await measureColour(await render(await build(false), 'plain'), SECONDS);
    const matched = await measureColour(await render(await build(true), 'matched'), SECONDS);
    const reference = await measureColour(join(dir, 'bright.mp4'), SECONDS);

    expect(matched.y, `plain ${plain.y} -> matched ${matched.y}`)
      .toBeGreaterThan(plain.y + 5);
    /* And towards the reference rather than merely away from where it was. */
    expect(Math.abs(reference.y - matched.y))
      .toBeLessThan(Math.abs(reference.y - plain.y));
  }, 300_000);
});
