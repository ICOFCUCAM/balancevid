/**
 * Does the cleanup advice hear anything real.
 * [MASTER-EDIT §12 P3; Doctrine U-02, U-15]
 *
 * `test/domain/take-ranking.test.ts` proves `adviseCleanup` and
 * `parseAstats` against readings and printouts built by hand. This proves
 * the two ends that arithmetic sits between: that `measureSound` reads a
 * real file correctly, and that the thresholds inside `adviseCleanup` land
 * where they are meant to on numbers a microphone could actually produce.
 *
 * It exists because the hand-built version of these fixtures got the
 * decisive case wrong twice — rumble measured where the voice lives, then
 * measured absolutely where two rows normalise — and because the one real
 * take that finally went through this path answered `-inf` for its floor,
 * which no synthetic reading had ever done. Both are here now as files,
 * not as literals.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NO_CLEANUP, adviseCleanup } from '../../src/domain/cleanup.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { FFMPEG, run } from '../../src/render/ffmpeg.js';
import { SILENT_FLOOR_DB, measureSound } from '../../src/render/ingest.js';

const SECONDS = 4;

/*
 * A VOICE WITH PAUSES IN IT, which is what makes this measurable at all.
 *
 * `astats` reads the noise floor as the quietest stretch it finds, so a
 * continuous tone reports its own level as its floor and every take looks
 * noisy. A real recording has gaps between phrases and the room is what
 * you hear in them — so the tone is gated a second on, a second off, and
 * the bed plays underneath throughout. Getting this wrong was the first
 * version of this file: three fixtures, all reading about 3 dB of
 * headroom, all "noisy", telling me nothing.
 *
 * `sine` comes out of lavfi at about -18 dBFS, not full scale, so the
 * gain here is above 1 for a loud take. Measured, not assumed.
 */
async function record(
  name: string, gain: number, bed: number,
): Promise<string> {
  const path = join(dir, `${name}.m4a`);
  await run(FFMPEG, [
    '-y',
    '-f', 'lavfi', '-i', `sine=frequency=220:r=48000:d=${SECONDS}`,
    '-f', 'lavfi',
    '-i', `anoisesrc=color=white:r=48000:amplitude=${bed}:d=${SECONDS}`,
    '-filter_complex',
    `[0:a]volume='${gain}*(lt(mod(t,2),1))':eval=frame[v];`
      + '[v][1:a]amix=inputs=2:duration=shortest:normalize=0[a]',
    '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', path,
  ]);
  return path;
}

let dir: string;

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-sound-'));
  await record('clean', 5, 0.0008);
  /* The same voice, the same gain, a room forty decibels louder. */
  await record('noisy', 5, 0.12);
  /* Clean, but recorded with the gain down — nothing to remove, something to lift. */
  await record('quiet', 0.5, 0.00005);

  /* No bed at all: the first half is digital silence, and ffmpeg says `-inf`. */
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=220:r=48000:d=${SECONDS}`,
    '-af', "volume='5*(gt(t,2))':eval=frame", '-c:a', 'pcm_s16le',
    join(dir, 'gap.wav'),
  ]);

  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=0x203040:s=160x90:r=${HOUSE_FPS}:d=2`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'picture.mp4'),
  ]);
}, 180_000);

describe('measuring a take', () => {
  it('reads the level and the floor the microphone heard', async () => {
    const clean = await measureSound(join(dir, 'clean.m4a'));
    expect(clean.windows).toBe(1);
    expect(clean.peakDb).toBeGreaterThan(clean.rmsDb);
    expect(clean.rmsDb).toBeGreaterThan(clean.noiseFloorDb);
    expect(clean.peakDb).toBeLessThanOrEqual(0);
  }, 120_000);

  /*
   * THE COMPARISON THE ADVICE IS BUILT ON, measured rather than asserted:
   * two takes of the same voice at the same gain, and the only thing that
   * differs is the room. If `measureSound` cannot separate those, nothing
   * downstream of it means anything.
   */
  it('separates a quiet room from a loud one under the same voice', async () => {
    const clean = await measureSound(join(dir, 'clean.m4a'));
    const noisy = await measureSound(join(dir, 'noisy.m4a'));
    expect(noisy.noiseFloorDb).toBeGreaterThan(clean.noiseFloorDb + 20);
    expect(Math.abs(noisy.rmsDb - clean.rmsDb)).toBeLessThan(2);
  }, 120_000);

  /*
   * `-inf` on the floor is the cleanest possible answer, not a failed
   * measurement, and the first version of `parseAstats` threw the whole
   * reading away for it. This is the case as a file: half of it is
   * genuinely silent samples, so ffmpeg genuinely prints `-inf`.
   */
  it('reads a silent stretch as a floor, not as a failure', async () => {
    const reading = await measureSound(join(dir, 'gap.wav'));
    expect(reading.windows).toBe(1);
    expect(reading.noiseFloorDb).toBe(SILENT_FLOOR_DB);
    expect(Number.isFinite(reading.rmsDb)).toBe(true);
  }, 120_000);

  /*
   * Footage can be picture-only, so this answers "not asked" rather than
   * throwing — the same shape as `measureColour` on a soundtrack.
   */
  it('says nothing was measured rather than failing on silent footage', async () => {
    const reading = await measureSound(join(dir, 'picture.mp4'));
    expect(reading.windows).toBe(0);
  }, 120_000);
});

describe('the advice, on sound that was actually recorded', () => {
  it('leaves a clean, well-recorded take alone', async () => {
    const advice = adviseCleanup(await measureSound(join(dir, 'clean.m4a')));
    expect(advice?.id).toBe(NO_CLEANUP);
    expect(advice?.says).toContain('nothing worth removing');
  }, 120_000);

  it('reaches for the room on a noisy one', async () => {
    const advice = adviseCleanup(await measureSound(join(dir, 'noisy.m4a')));
    expect(advice?.id).toBe('room');
    expect(advice?.says).toContain('below the voice');
  }, 120_000);

  it('offers to lift a clean take that was recorded quietly', async () => {
    const advice = adviseCleanup(await measureSound(join(dir, 'quiet.m4a')));
    expect(advice?.id).toBe('voice');
    expect(advice?.says).toContain('clean, but');
  }, 120_000);

  it('says nothing at all when nothing was measured', async () => {
    const advice = adviseCleanup(await measureSound(join(dir, 'picture.mp4')));
    expect(advice).toBeNull();
  }, 120_000);
});
