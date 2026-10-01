/**
 * The pixels behind the eyeline measurement.
 * [Doctrine STUDIO-TWO §4, S-6, S-35, S-37]
 *
 * `eyeline.test.ts` in the domain asks whether the arithmetic is right,
 * with silhouettes written down in a line of code. This asks the other
 * half: whether the filter graph hands that arithmetic the silhouette it
 * thinks it is getting.
 *
 * THE FIXTURE CARRIES ITS OWN GROUND TRUTH, as everywhere else in this
 * appendix. The room is one flat colour; the performer is a narrow
 * rectangle on top of a wide one, which is what a head on a pair of
 * shoulders is to a silhouette. The answer is then arithmetic anybody
 * can check against the numbers in the drawbox.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FFMPEG } from '../../src/render/ffmpeg.js';
import { measureEyeline } from '../../src/render/eyeline.js';

const run = promisify(execFile);
const ROOM = '0x3a4a5e';
const SKIN = '0xcc5544';
/* 640x360. Head x=290..350, y=40..100. Body x=240..400, y=100..300. */
const HEAD = 'x=290:y=40:w=60:h=60';
const BODY = 'x=240:y=100:w=160:h=200';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bv-eyeline-'));
  await run(FFMPEG, ['-y', '-f', 'lavfi',
    '-i', `color=c=${ROOM}:s=640x360:r=30:d=3`,
    join(dir, 'plate.mp4')]);
  await run(FFMPEG, ['-y', '-f', 'lavfi',
    '-i', `color=c=${ROOM}:s=640x360:r=30:d=3`,
    '-vf', `drawbox=${HEAD}:color=${SKIN}@1:t=fill,`
      + `drawbox=${BODY}:color=${SKIN}@1:t=fill`,
    join(dir, 'take.mp4')]);
}, 120_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('measuring a performer against their own empty room', () => {
  it('finds the eyes halfway down the head the fixture drew', async () => {
    /*
     * Crown at y=40 and shoulders at y=100 of a 360-line frame, so the
     * eyes are at y=70 — 0.194 of the way down. The probe works at 120
     * rows, so a row is worth 0.008 and the tolerance is two of them.
     */
    const found = await measureEyeline(
      join(dir, 'take.mp4'), join(dir, 'plate.mp4'), join(dir, 'scratch'), 40);

    expect(found).not.toBeNull();
    expect(found!.crown).toBeCloseTo(40 / 360, 1);
    expect(found!.chin).toBeCloseTo(100 / 360, 1);
    expect(found!.at).toBeGreaterThan(0.17);
    expect(found!.at).toBeLessThan(0.22);
  }, 120_000);

  it('says how much of the frame they fill', async () => {
    /* 60x60 of head and 160x200 of body in a 640x360 frame is 0.155. */
    const found = await measureEyeline(
      join(dir, 'take.mp4'), join(dir, 'plate.mp4'), join(dir, 'scratch'), 40);
    expect(found!.covers).toBeGreaterThan(0.1);
    expect(found!.covers).toBeLessThan(0.25);
  }, 120_000);

  it('answers nothing for a room with nobody in it', async () => {
    /*
     * A real answer, not a failure: an empty frame has no eyeline, and
     * inventing one would put a room's horizon through thin air. The
     * plate differenced against itself is as empty as a frame gets.
     */
    const found = await measureEyeline(
      join(dir, 'plate.mp4'), join(dir, 'plate.mp4'), join(dir, 'scratch'), 40);
    expect(found).toBeNull();
  }, 120_000);

  it('answers nothing rather than throwing when the take will not read', async () => {
    /* Losing a take because a row of pixels could not be counted would
       be the tail wagging the dog. */
    const found = await measureEyeline(
      join(dir, 'no-such-file.mp4'), join(dir, 'plate.mp4'),
      join(dir, 'scratch'), 40);
    expect(found).toBeNull();
  }, 120_000);
});
