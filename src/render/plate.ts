/**
 * The room with nobody in it, measured.
 * [Doctrine STUDIO-TWO §4, S-6, U-02, U-23]
 *
 * Three seconds of an empty room is the whole input to §4's matte, and two
 * numbers come out of it: a STILL to difference every take against, and the
 * room's own NOISE — how much a pixel moves when nothing in the room does.
 *
 * The noise is the important one, because everything downstream is a multiple
 * of it. A clean camera on a tripod gets a tight key; a noisy one in low light
 * gets a forgiving one; and neither the author nor this code ever picks a
 * threshold. It is also the honest answer to "will this work in my room",
 * which S-6 required be answerable BEFORE somebody records five takes.
 *
 * MEASURED BY DECODING, like every other number in this system that was once
 * read out of a header or a log line and was wrong.
 */

import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { ffmpeg, type RunOptions } from './ffmpeg.js';
import { probe } from './probe.js';

/** The noise measurement is taken at this size: the shape, not the detail. */
const PROBE_WIDTH = 160;
const PROBE_HEIGHT = 90;

/**
 * How many frames are averaged into the still.
 *
 * Averaging is what makes the plate a picture of the ROOM rather than a
 * picture of one moment of the room's noise — differencing against a single
 * noisy frame puts that frame's noise into every matte for ever.
 */
const AVERAGE_FRAMES = 16;

/**
 * The per-pixel movement, in levels of 255, at which a room cannot be matted.
 *
 * Chosen from what the numbers mean rather than from taste: a still camera on
 * a lit wall sits around 1–3, a phone in a dim room around 8–15, and by 20 the
 * picture moves as much with nobody in it as a person moving slowly does.
 */
const UNUSABLE_NOISE_LEVELS = 20;

export interface PlateMeasurement {
  noise: number;
  quality: number;
  frames: number;
  width: number;
  height: number;
}

/**
 * Average the plate's frames into one still.
 *
 * `tmix` averages a sliding window, so the frame we keep is the first one that
 * has a full window behind it — taking frame zero would be an average of one
 * frame, which is the single noisy frame this exists to avoid.
 */
export async function buildPlateStill(
  source: string, outPng: string, run?: RunOptions,
): Promise<void> {
  await mkdir(dirname(outPng), { recursive: true });
  await ffmpeg([
    '-y', '-i', source,
    '-vf', `tmix=frames=${AVERAGE_FRAMES},select=gte(n\\,${AVERAGE_FRAMES})`,
    '-frames:v', '1', '-update', '1',
    outPng,
  ], run);
}

/**
 * How much the room moves on its own.
 *
 * Decoded to small grey frames and counted in JavaScript, for the reason
 * `decodeToAnalysis` gives: a number that comes out of arithmetic on the
 * samples is a number, and a number scraped out of ffmpeg's prose is a
 * guess about a format that changes between releases.
 */
export async function measurePlate(
  source: string, scratchDir: string, run?: RunOptions,
): Promise<PlateMeasurement> {
  const info = await probe(source);
  if (!info.hasVideo) throw new Error('that plate has no picture in it');

  await mkdir(scratchDir, { recursive: true });
  const rawPath = join(scratchDir, 'plate.gray');
  await ffmpeg([
    '-y', '-i', source,
    '-vf', `scale=${PROBE_WIDTH}:${PROBE_HEIGHT},format=gray`,
    '-f', 'rawvideo',
    rawPath,
  ], run);

  const pixels = PROBE_WIDTH * PROBE_HEIGHT;
  const { size } = await stat(rawPath);
  const frames = Math.floor(size / pixels);
  if (frames < 2) {
    await rm(rawPath, { force: true });
    throw new Error(
      'a plate needs a few seconds of the room — one frame cannot say how much '
      + 'the picture moves on its own');
  }

  const raw = await readFile(rawPath);
  await rm(rawPath, { force: true });

  /*
   * Per-pixel standard deviation over time, averaged over the picture. A sum
   * and a sum of squares in one pass: two arrays rather than every frame in
   * memory, because a plate is short but the principle is not.
   */
  const sum = new Float64Array(pixels);
  const sumSquares = new Float64Array(pixels);
  for (let f = 0; f < frames; f += 1) {
    const base = f * pixels;
    for (let i = 0; i < pixels; i += 1) {
      const value = raw[base + i]!;
      sum[i]! += value;
      sumSquares[i]! += value * value;
    }
  }

  let totalDeviation = 0;
  for (let i = 0; i < pixels; i += 1) {
    const mean = sum[i]! / frames;
    // Clamped at zero: floating-point subtraction of two close numbers can
    // land a hair below it, and Math.sqrt of that is NaN in the average.
    const variance = Math.max(0, sumSquares[i]! / frames - mean * mean);
    totalDeviation += Math.sqrt(variance);
  }
  const levels = totalDeviation / pixels;

  return {
    noise: levels / 255,
    quality: Math.max(0, Math.min(1, 1 - levels / UNUSABLE_NOISE_LEVELS)),
    frames,
    width: info.width,
    height: info.height,
  };
}
