/**
 * The pixels behind the eyeline measurement.
 * [Doctrine STUDIO-TWO §4, S-6, S-35; U-16]
 *
 * THE THIN HALF, deliberately. `eyelineFrom` does the thinking and can be
 * tested with a silhouette written down in a line of code; this fetches
 * the silhouette and nothing else, which is the same split `measurePlate`
 * uses and for the same reason: the part that needs a renderer should be
 * the part with no decisions in it.
 *
 * ONE FRAME, NOT THE TAKE. Where a performer's eyes were when they
 * started is the number that places the room, and S-6 rules out anything
 * per-frame — a backdrop that moved against a swaying singer is worse
 * than one that never moved. A second in is far enough past a slate or a
 * half-raised head to be the performance, and early enough to be cheap.
 */

import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type Eyeline, eyelineFrom } from '../domain/eyeline.js';
import { ffmpeg, type RunOptions } from './ffmpeg.js';

/**
 * How big a picture this is measured on.
 *
 * Small on purpose. A silhouette's crown and shoulders are landmarks of
 * the whole figure, and asking for them at broadcast resolution would be
 * two million pixels of arithmetic to find a row index that a hundred
 * and twenty rows already pins to under a per cent of the frame.
 */
export const EYE_PROBE_WIDTH = 160;
export const EYE_PROBE_HEIGHT = 120;

/** A second in: past the slate, still cheap. */
export const EYE_PROBE_AT = '1';

/**
 * Where this take's performer has their eyes, or nothing.
 *
 * Differenced against the plate, exactly as the matte is, so the thing
 * being measured is the thing that will be cut out — a measurement taken
 * some other way could disagree with the matte about where the person
 * is, and two answers to that is worse than one rough answer.
 */
export async function measureEyeline(
  take: string, plate: string, scratchDir: string,
  threshold: number, run?: RunOptions,
): Promise<Eyeline | null> {
  await mkdir(scratchDir, { recursive: true });
  const rawPath = join(scratchDir, 'eyeline.gray');

  /*
   * Difference, threshold, shrink.
   *
   * THE THRESHOLD IS THE MATTE'S OWN, measured from this room's noise,
   * so a row counted here is a row the matte would keep. Measuring the
   * performer some other way could disagree with the matte about where
   * they are, and two answers to that is worse than one rough answer.
   *
   * THE ORDER IS LESS IMPORTANT THAN IT FIRST LOOKED, and saying so is
   * better than leaving a reason that was never checked. This claimed
   * the shrink had to come last or "a dark shirt against a dark wall
   * would vanish before it was compared" — and a mutation swapping the
   * two survived. It survives because an area average of a UNIFORM
   * difference is that same difference: for solid shapes, which is what
   * a person mostly is, the order cannot matter. It would matter for
   * detail finer than the shrink — a strand of hair averaged down below
   * the threshold — and nothing here tests that, so nothing here claims
   * it. Thresholding first is kept because it is the matte's own order.
   */
  await ffmpeg([
    '-y',
    '-ss', EYE_PROBE_AT, '-i', take,
    '-i', plate,
    '-filter_complex',
      '[0:v]format=gbrp[t];[1:v]format=gbrp[p];'
      + '[t][p]blend=all_mode=difference,format=gray,'
      + `lutyuv=y=if(gt(val\\,${threshold})\\,255\\,0),`
      + `scale=${EYE_PROBE_WIDTH}:${EYE_PROBE_HEIGHT}:flags=area[o]`,
    '-map', '[o]', '-frames:v', '1', '-f', 'rawvideo', rawPath,
  ], run).catch(() => undefined);

  let raw: Buffer;
  try {
    const { size } = await stat(rawPath);
    if (size < EYE_PROBE_WIDTH * EYE_PROBE_HEIGHT) {
      await rm(rawPath, { force: true });
      return null;
    }
    raw = await readFile(rawPath);
  } catch {
    /* A take shorter than the probe point, or one ffmpeg could not read.
       No eyeline is a real answer and the scene keeps its own. */
    return null;
  }
  await rm(rawPath, { force: true });

  /*
   * How much of each row is not the empty room. Averaged back out of the
   * area-scaled grey rather than counted as pixels: the shrink turned
   * runs of 255 into a proportion, which is what a row profile is.
   */
  const rows = new Float64Array(EYE_PROBE_HEIGHT);
  for (let y = 0; y < EYE_PROBE_HEIGHT; y += 1) {
    let sum = 0;
    const base = y * EYE_PROBE_WIDTH;
    for (let x = 0; x < EYE_PROBE_WIDTH; x += 1) sum += raw[base + x]! / 255;
    rows[y] = sum;
  }
  return eyelineFrom(rows, EYE_PROBE_WIDTH);
}
