/**
 * Audio, as numbers.  [Doctrine STUDIO-TWO §10, S-3, U-02, U-23]
 *
 * The bridge between a file somebody uploaded and the arithmetic in
 * `domain/align.ts`. Worker-only: nothing in the web tier invokes ffmpeg.
 *
 * TWO RULES, BOTH FROM THINGS THIS CODEBASE HAS ALREADY LEARNED.
 *
 * MEASURED, NOT READ. "Every duration in this system that came from a
 * container header was wrong at least once." A master track's length decides
 * where every scene in the performance can sit, so it is counted by decoding
 * rather than taken from the file's own account of itself.
 *
 * NORMALISED ON INGEST, exactly as video is (U-02). Two clocks that disagree
 * about what a second is cannot be aligned, only approximated — and a take
 * recorded at 44.1 kHz against a master at 48 kHz drifts by seven percent,
 * which over four minutes is seventeen seconds. Everything is resampled once,
 * at the door, and INV-14 refuses anything that arrives claiming otherwise.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { HOUSE_SAMPLE_RATE, type Samples } from '../domain/time.js';
import { ffmpeg, type RunOptions } from './ffmpeg.js';

/**
 * Decode to one channel of raw floats at the house rate, and count them.
 *
 * Mono, because alignment is about when things happen and a stereo image says
 * nothing about that while doubling the work. `f32le` because it is what
 * JavaScript already has a typed array for — no parsing, one read.
 *
 * THE RETURN VALUE IS THE DURATION, and that is the whole reason there is no
 * separate `measureDuration` beside this. The first version had one, which
 * ran ffmpeg a second time and scraped the sample count out of its
 * human-readable summary line — a string whose units changed between ffmpeg
 * releases (`kB` became `KiB`) and whose sample format was not the one being
 * assumed. Decoding once and dividing the file's size by four is exact, needs
 * no parsing, and produces the number from the same pass that produces the
 * samples it describes. [U-02: measured, not read]
 */
export async function decodeToAnalysis(
  mediaPath: string, outPath: string, run?: RunOptions,
): Promise<Samples> {
  await mkdir(dirname(outPath), { recursive: true });
  await ffmpeg([
    '-y', '-i', mediaPath,
    '-vn',
    '-ac', '1',
    '-ar', String(HOUSE_SAMPLE_RATE),
    '-f', 'f32le',
    outPath,
  ], run);
  const { size } = await stat(outPath);
  return Math.floor(size / 4);
}

/** Read an analysis file back, or part of one. */
export async function readAnalysis(
  path: string, fromSample = 0, count?: number,
): Promise<Float32Array> {
  const buffer = await readFile(path);
  const total = Math.floor(buffer.byteLength / 4);
  const from = Math.max(0, Math.min(fromSample, total));
  const length = Math.max(0, Math.min(count ?? total - from, total - from));
  // A copy rather than a view: Node's Buffer is pooled, and a view onto a
  // pooled allocation is a bug that appears once under load and never in a
  // test.
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = buffer.readFloatLE((from + i) * 4);
  return out;
}

/**
 * Normalise an uploaded track to the house rate, keeping the original.
 *
 * The original is kept for the same reason the raw recording is (D-13): it is
 * what the author gave us, and every other form is regenerable from it.
 *
 * OPUS IN WEBM, NOT AAC, and the reason is the one this codebase already met
 * with H.264: whether a browser can decode a patent-encumbered codec is a
 * licensing question we do not control. A Chromium without proprietary codecs
 * cannot decode AAC at all, and a performer whose song will not load is not
 * going to debug our container choice. Opus is royalty-free, decodes
 * everywhere that matters, and is natively 48 kHz — which is the house rate,
 * so the format and the clock agree for free.
 *
 * The dynamics pass through untouched. Speech mastering compresses; music
 * mastered like speech is ruined, and INV-11's loudness target is reached by
 * gain at the master stage, not here. [S-2]
 */
export async function normaliseMaster(
  originalPath: string, outPath: string, run?: RunOptions,
): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await ffmpeg([
    '-y', '-i', originalPath,
    '-vn',
    '-ar', String(HOUSE_SAMPLE_RATE),
    '-ac', '2',
    '-c:a', 'libopus', '-b:a', '160k',
    '-f', 'webm',
    outPath,
  ], run);
}

/** Write samples out as an analysis file, for tests and for synthetic fixtures. */
export async function writeAnalysis(
  path: string, samples: Float32Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const buffer = Buffer.alloc(samples.length * 4);
  for (let i = 0; i < samples.length; i += 1) buffer.writeFloatLE(samples[i] ?? 0, i * 4);
  await writeFile(path, buffer);
}
