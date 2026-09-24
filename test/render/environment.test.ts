/**
 * The environment, and the matte it needs.
 * [Doctrine STUDIO-TWO §4, S-6, INV-16, D-16]
 *
 * "You can record in your bedroom while the finished performance makes it look
 *  as though you are in a studio" — and the raw recording is never touched.
 *
 * THE FIXTURES CARRY THEIR OWN GROUND TRUTH, as everywhere else in this
 * appendix. The room is one flat colour, the performer is a rectangle of
 * another, and the plate is the room with the rectangle absent. A pixel then
 * says which of the three things is on screen without anybody watching
 * anything: the performer must survive, the room must not.
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
import {
  type RoomPlate, MATTE_NOISE_MULTIPLE, SPACE_LOOKS,
  matteThreshold, needsMatte, plateVerdict,
} from '../../src/domain/environment.js';
import {
  PerformanceEditError, addPlate, newPerformance, setEnvironment, setScene, usePlate,
} from '../../src/domain/performanceEdit.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import { InvariantViolation, assertPerformanceRenderable } from '../../src/domain/invariants.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG } from '../../src/render/ffmpeg.js';
import { buildPlateStill, measurePlate } from '../../src/render/plate.js';

const run = promisify(execFile);
const SONG_SECONDS = 4;
const SONG = secondsToSamples(SONG_SECONDS);

/** The room, and the performer standing in it. */
const ROOM = '0x30507a';
const PERFORMER = '0xdd2222';

let dir: string;

function plate(over: Partial<RoomPlate> = {}): RoomPlate {
  return {
    assetId: 'plate_room' as AssetId,
    noise: 0.01,
    quality: 0.9,
    width: 640,
    height: 360,
    capturedAt: '2026-09-24T12:00:00.000Z',
    ...over,
  };
}

function take(id: string, over: Partial<PerformanceTake> = {}): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: 'shot' as AssetId,
    label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
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

/** A performance with one take, one plate, and the take shot against it. */
function performance(): Performance {
  const p = newPerformance('A Performance', master(), '2026-09-24T12:00:00.000Z');
  addPlate(p, plate());
  p.takes = [take('take_one', { plateAssetId: 'plate_room' as AssetId })];
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-environment-'));

  // The take: the room, with a performer standing in the middle of it.
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=${ROOM}:s=640x360:r=${HOUSE_FPS}:d=${SONG_SECONDS}`,
    '-vf', `drawbox=x=240:y=80:w=160:h=200:color=${PERFORMER}@1:t=fill`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'shot.mp4'),
  ]);

  // The plate: the same room, with nobody in it.
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=${ROOM}:s=640x360:r=${HOUSE_FPS}:d=1`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'plate.mp4'),
  ]);
  await buildPlateStill(join(dir, 'plate.mp4'), join(dir, 'plate_room.png'));

  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SONG_SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 180_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/** What is on screen at this point of the finished video. */
async function colourAt(
  path: string, seconds: number, x: number, y: number,
): Promise<[number, number, number]> {
  const png = join(dir, `probe-${seconds}-${x}-${y}.png`);
  await run(FFMPEG, ['-y', '-ss', String(seconds), '-i', path, '-frames:v', '1', png]);
  const { stdout } = await run(FFMPEG, [
    '-i', png, '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-',
  ], { encoding: 'buffer' as never, maxBuffer: 1024 * 1024 } as never);
  const bytes = stdout as unknown as Buffer;
  return [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0];
}

async function renderWith(p: Performance, name: string): Promise<string> {
  setScene(p, 0, { layoutId: 'performance_full', takeIds: [p.takes[0]!.id] });
  const out = join(dir, `${name}.mp4`);
  await compose(buildPerformancePlan(p), {
    workDir: join(dir, `work-${name}`),
    outputPath: out,
    resolveAsset: () => join(dir, 'shot.mp4'),
    resolveStill: (id) => join(dir, `${id}.png`),
    masterAudioPath: join(dir, 'song.webm'),
  });
  return out;
}

describe('the plate, measured', () => {
  it('reports a still room as quiet, and the threshold follows it', async () => {
    const measured = await measurePlate(join(dir, 'plate.mp4'), join(dir, 'scratch'));
    // A synthetic flat colour is as still as a room can be.
    expect(measured.noise).toBeLessThan(0.01);
    expect(measured.quality).toBeGreaterThan(0.9);
    expect(measured.frames).toBeGreaterThan(1);
    expect(measured.width).toBe(640);
  }, 60_000);

  it('refuses a plate too short to say anything about the room', async () => {
    await run(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', `color=c=${ROOM}:s=64x64:d=0.03`,
      '-frames:v', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      join(dir, 'blink.mp4'),
    ]);
    await expect(measurePlate(join(dir, 'blink.mp4'), join(dir, 'scratch')))
      .rejects.toThrow(/a few seconds/);
  }, 60_000);

  it('turns the measurement into a threshold, never a typed number', () => {
    const quiet = matteThreshold(plate({ noise: 0.004 }));
    const noisy = matteThreshold(plate({ noise: 0.05 }));
    expect(noisy).toBeGreaterThan(quiet);
    expect(noisy).toBe(Math.round(0.05 * 255 * MATTE_NOISE_MULTIPLE));
    // Clamped at both ends: a perfect measurement must not produce a key that
    // fires on a rounding error, nor a hopeless one a key that fires on nothing.
    expect(matteThreshold(plate({ noise: 0 }))).toBeGreaterThan(0);
    expect(matteThreshold(plate({ noise: 1 }))).toBeLessThanOrEqual(96);
  });

  it('and says in words when a room will not do it', () => {
    expect(plateVerdict(plate({ quality: 0.92 })).ok).toBe(true);
    const bad = plateVerdict(plate({ quality: 0.2 }));
    expect(bad.ok).toBe(false);
    expect(bad.text).toMatch(/light|wall/);
  });
});

describe('INV-16 — no composited environment without a measured matte', () => {
  it('refuses a background on a take with no plate, and says what to do', () => {
    const p = newPerformance('P', master(), '2026-09-24T12:00:00.000Z');
    p.takes = [take('take_one')];
    expect(() => setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'church' }))
      .toThrow(PerformanceEditError);
    try {
      setEnvironment(p, 'take_one', { kind: 'blur' });
    } catch (error) {
      expect((error as Error).message).toMatch(/three seconds of the empty room/);
    }
    expect(p.takes[0]!.environment.kind).toBe('original');
  });

  it('accepts one where a plate was measured', () => {
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'concert_stage' });
    expect(p.takes[0]!.environment.spaceId).toBe('concert_stage');
    expect(needsMatte(p.takes[0]!.environment)).toBe(true);
  });

  it('refuses a space nobody drew', () => {
    const p = performance();
    expect(() => setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'volcano' }))
      .toThrow(/unknown space/);
  });

  /*
   * Dropping the plate takes the environment with it. Leaving a take set to
   * "Concert Stage" with nothing to matte against would be a document that
   * describes a video it cannot produce, found at render time.
   */
  it('putting a take back in its own room takes the background with it', () => {
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'church' });
    usePlate(p, 'take_one', null);
    expect(p.takes[0]!.environment.kind).toBe('original');
    expect(p.takes[0]!.plateAssetId).toBeUndefined();
  });

  it('is checked over the takes on screen, not the ones in the rail', () => {
    const p = performance();
    p.takes.push(take('take_two', { plateAssetId: 'plate_room' as AssetId }));
    setEnvironment(p, 'take_two', { kind: 'space', spaceId: 'church' });
    // Take two is in an impossible state — but it is not on screen.
    delete p.takes[1]!.plateAssetId;
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
    expect(() => assertPerformanceRenderable(p)).not.toThrow();

    setScene(p, secondsToSamples(2), {
      layoutId: 'performance_full', takeIds: ['take_two'],
    });
    expect(() => assertPerformanceRenderable(p)).toThrow(InvariantViolation);
    try {
      assertPerformanceRenderable(p);
    } catch (error) {
      expect((error as InvariantViolation).invariant).toBe('INV-16');
    }
  });
});

describe('the plan carries the matte, and the renderer decides nothing', () => {
  it('resolves the plate, the threshold and the feather into the shot', () => {
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'concert_stage' });
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });

    const shot = buildPerformancePlan(p).shots[0]!;
    if (shot.kind !== 'performance') throw new Error('expected a performance shot');
    const backdrop = shot.takes[0]!.backdrop!;
    expect(backdrop.kind).toBe('space');
    expect(backdrop.spaceId).toBe('concert_stage');
    expect(backdrop.plateAssetId).toBe('plate_room');
    expect(backdrop.threshold).toBe(matteThreshold(plate()));
    expect(backdrop.feather).toBeGreaterThan(0);
  });

  it('and leaves it out entirely for a take staying in its own room', () => {
    const p = performance();
    setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
    const shot = buildPerformancePlan(p).shots[0]!;
    if (shot.kind !== 'performance') throw new Error('expected a performance shot');
    expect(shot.takes[0]!.backdrop).toBeUndefined();
  });

  /* Bedroom → Studio is a re-plan: one shot changes, and nothing else. [D-16] */
  it('changing the environment re-renders that shot and no other (U-16)', () => {
    const before = (() => {
      const p = performance();
      setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
      return buildPerformancePlan(p);
    })();
    const after = (() => {
      const p = performance();
      setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'beach' });
      setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
      return buildPerformancePlan(p);
    })();
    expect(after.shots[0]!.hash).not.toBe(before.shots[0]!.hash);
    expect(after.planHash).not.toBe(before.planHash);
  });

  it('every space §4 lists is drawn, so none of them needs a rights line', () => {
    // S-6 expected the supplied spaces to be content the product ships and
    // therefore to need a licence each. They are recipes, so they do not.
    for (const id of Object.keys(SPACE_LOOKS)) {
      const look = SPACE_LOOKS[id]!;
      expect(look.top).toMatch(/^0x[0-9a-f]{6}$/);
      expect(look.bottom).toMatch(/^0x[0-9a-f]{6}$/);
      expect(look.glow.strength).toBeGreaterThan(0);
    }
  });
});

describe('the finished picture', () => {
  it('leaves the room alone when the take stays in it', async () => {
    const out = await renderWith(performance(), 'original');
    const [, , roomBlue] = await colourAt(out, 1, 40, 40);
    // The room is a blue-grey wall, and it is still there.
    expect(roomBlue).toBeGreaterThan(90);
  }, 180_000);

  it('puts the performer in a drawn space and the room nowhere (§4)', async () => {
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'concert_stage' });
    const out = await renderWith(p, 'space');

    // The performer survives the key.
    const [r, g, b] = await colourAt(out, 1, 960, 540);
    expect(r).toBeGreaterThan(140);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(90);

    /*
     * And the room does not. Concert Stage is a near-black purple wash, so
     * the wall's blue-grey being gone is the whole claim of §4 read out of a
     * pixel rather than looked at.
     */
    const [br, bg, bb] = await colourAt(out, 1, 120, 120);
    expect(br + bg + bb).toBeLessThan(160);
  }, 240_000);

  it('and softens the room instead when that is what was asked for', async () => {
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'blur' });
    const out = await renderWith(p, 'blur');

    const [r, g, b] = await colourAt(out, 1, 960, 540);
    expect(r).toBeGreaterThan(140);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(90);

    // Their own room, still recognisably their own room.
    const [, , roomBlue] = await colourAt(out, 1, 120, 120);
    expect(roomBlue).toBeGreaterThan(90);
  }, 240_000);
});
