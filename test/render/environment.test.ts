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
    /*
     * These fixtures are pictures with no sound in them, and the document
     * says so rather than leaving the mixer to find out: §9 reads `hasAudio`,
     * which the worker MEASURES when a take lands. What is under test here is
     * the picture.
     */
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

  /*
   * STANDING IN THE ROOM RATHER THAN IN FRONT OF IT.  [§4, S-6]
   *
   * The matte was never the problem: the edge it cuts is clean, and a
   * clean edge is exactly what makes a composite read as a sticker,
   * because nothing in a real room has one. Two corrections, both
   * derived from the light the space already declares, and both read
   * out of a pixel rather than looked at.
   *
   * Beach, because it is the brightest space this product ships and
   * therefore the one where "the room lands on the person" is a number
   * rather than a subtlety. Its light pool sits right of centre
   * (`glow.x` 0.72), which is what makes the shadow test below able to
   * tell a shadow from a gradient.
   *
   * The performer is a 160x200 rectangle at x=240 in a 640x360 source,
   * so x=720..1200 and y=240..840 once it is a 1920x1080 frame.
   */
  it('lets the room light the edge of the person standing in it', async () => {
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'beach' });
    const out = await renderWith(p, 'wrap');

    /* The middle of the performer is untouched: a wrap that reached the
       middle of somebody would be a wash over them, not light on them. */
    const [, , middleBlue] = await colourAt(out, 1, 960, 540);
    /* Just inside their left edge, where a bright sky is landing. */
    const [, , edgeBlue] = await colourAt(out, 1, 745, 540);

    expect(edgeBlue).toBeGreaterThan(middleBlue + 10);
  }, 240_000);

  it('and puts a shadow under them, falling away from the light', async () => {
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'beach' });
    const out = await renderWith(p, 'shadow');

    /*
     * BOTH SAMPLES ARE ON THE SAND AT THE SAME HEIGHT, so the wash's own
     * vertical gradient cannot explain the difference — and the nearer
     * one is nearer the light pool, so the gradient is pushing the other
     * way. Beating that is the shadow or nothing.
     */
    const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    /*
     * AVERAGED OVER A FEW PIXELS, because every space carries film grain
     * — a perfectly clean backdrop behind a camera's own noise is what
     * makes a composite look pasted, so the grain is wanted. It is
     * seeded, so this is reproducible rather than merely usually right,
     * but one pixel of a grainy picture is still a sample of one.
     */
    const at = async (x: number, y: number) => {
      const spots = await Promise.all([
        colourAt(out, 1, x, y), colourAt(out, 1, x + 6, y),
        colourAt(out, 1, x - 6, y), colourAt(out, 1, x, y + 6),
        colourAt(out, 1, x, y - 6),
      ]);
      return spots.reduce((total, one) => total + sum(one), 0) / spots.length;
    };

    /*
     * DIRECTLY UNDER THEM, on the sand just below the performer's feet
     * at y=840. Measured at 438 against roughly 600 either side: a
     * quarter of the light gone, which is a shadow and not a gradient.
     */
    const under = await at(960, 850);
    const beside = await at(300, 850);
    expect(under).toBeLessThan(beside - 100);

    /*
     * AND IT FALLS AWAY FROM THE LIGHT. Beach lights from the right
     * (`glow.x` 0.72), so the shadow is thrown LEFT. Both samples are on
     * the sand at the same height, and the nearer one is nearer the
     * light pool — so the wash's own gradient is pushing the other way,
     * and beating it is the shadow or nothing.
     */
    const leftFlank = await at(660, 850);
    const farLeft = await at(120, 850);
    expect(leftFlank).toBeLessThan(farLeft - 15);
  }, 240_000);

  it('draws a floor that recedes instead of a stripe', async () => {
    /*
     * A BAND THAT REACHES THE BOTTOM IS THE GROUND, and it was drawn as
     * one flat colour, which is exactly what makes a drawn room read as
     * a stage flat. Modern Room's runs from 0.82 to the bottom, so the
     * floor is y=886..1080 and the wall is everything above it.
     *
     * The claim is not "the bottom is darker" — a vignette would do
     * that. It is that the floor falls away FASTER than the wall does:
     * the wall's own gradient is spread over 886 pixels and the floor's
     * over 194, and both samples are at the horizontal centre where a
     * vignette has least to say.
     */
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'modern_room' });
    const out = await renderWith(p, 'floor');
    const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    const at = async (y: number) => sum(await colourAt(out, 1, 300, y));

    const wallFall = await at(700) - await at(860);
    const floorFall = await at(900) - await at(1060);
    expect(floorFall).toBeGreaterThan(wallFall * 2);
  }, 240_000);

  it('does not focus the back of the room as sharply as the performer', async () => {
    /*
     * Beach's band is a LINE rather than a floor — a hard-edged sea
     * horizon drawn at y=670. Pin sharp, that edge is a step: the pixel
     * just above it is wall and the pixel just below it is sea, with
     * nothing in between. Defocused, the step becomes a ramp, and a
     * sample inside the ramp sits strictly between the two.
     *
     * That is the whole claim, and it cannot be made by a gradient:
     * above the horizon the wash is sky all the way up.
     */
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'beach' });
    const out = await renderWith(p, 'defocus');
    const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    const at = async (y: number) => sum(await colourAt(out, 1, 300, y));

    const sky = await at(650);
    const edge = await at(669);
    const sea = await at(690);
    expect(sea).toBeLessThan(sky);
    expect(edge).toBeLessThan(sky - 5);
    expect(edge).toBeGreaterThan(sea + 5);
  }, 240_000);

  it('runs the floor away to a point rather than lying flat', async () => {
    /*
     * PERSPECTIVE, DRAWN IN LIGHT RATHER THAN IN LINES. [§4, S-34]
     *
     * A real floor is brightest along the line running away from the
     * camera and falls off towards the near corners. Two claims, and
     * the second is the one a flat floor cannot fake:
     *
     *   at a given height the middle is brighter than the edge; and
     *   that difference GROWS towards the camera, because a receding
     *     plane converges — near the horizon the lit run fills the
     *     width, and near the lens it does not.
     *
     * Recording Studio, because its floor is derived rather than
     * declared and its walls are dark enough for the lit run to be the
     * only thing happening down there.
     */
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'recording_studio' });
    const out = await renderWith(p, 'converge');
    const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    const at = async (x: number, y: number) => sum(await colourAt(out, 1, x, y));

    /* The floor begins at 0.74 + 0.12 * (1 - 0.25) = 0.83, so y=896. */
    const nearHorizon = await at(960, 930) - await at(120, 930);
    const nearCamera = await at(960, 1060) - await at(120, 1060);

    /* The run exists: at the horizon the middle of the floor is lit and
       its edges are not. Measured at 52 against a flat floor's 0. */
    expect(nearHorizon).toBeGreaterThan(20);
    /*
     * AND IT CONVERGES ON THE POINT. The contrast between the middle of
     * the floor and its edge is strongest where the floor runs away to
     * and fades towards the lens — 52 at the horizon against 9 near the
     * camera. A flat floor has the same contrast at both heights,
     * because it has none at either.
     *
     * The first version of this test expected the opposite, on the
     * reasoning that a converging plane is narrower near the camera.
     * It is — but what is drawn here is the LIGHT on that plane, and
     * light pools where the floor meets the wall and falls away
     * towards the near corners, which are closest to the lens and
     * furthest from the room's own lamp. The picture was right and the
     * expectation was backwards.
     */
    expect(nearHorizon).toBeGreaterThan(nearCamera * 2);
  }, 240_000);

  it('renders the same plan to the same picture twice', async () => {
    /*
     * THE CONTRACT `backdropChain` ALREADY CLAIMED, and did not keep.
     * Its own comment says the backdrop is "deterministic, so the shot
     * cache means what it says" — and `noise` without `all_seed` takes a
     * fresh seed every run, so two renders of one unchanged plan came
     * back different. U-16 caches a shot by its plan; a backdrop that
     * will not render the same twice makes that cache a liar.
     *
     * Beach, because at `grain: 6` it is grainy enough for an unseeded
     * filter to show, and the sampled points are spread so this is not
     * one lucky pixel.
     */
    const p = performance();
    setEnvironment(p, 'take_one', { kind: 'space', spaceId: 'beach' });
    const once = await renderWith(p, 'twice-a');
    const again = await renderWith(p, 'twice-b');

    for (const [x, y] of [[120, 120], [400, 300], [960, 900], [1700, 1000]]) {
      expect(await colourAt(once, 1, x!, y!), `${x},${y}`)
        .toEqual(await colourAt(again, 1, x!, y!));
    }
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
