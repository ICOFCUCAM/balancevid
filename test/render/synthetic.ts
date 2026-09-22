/**
 * Synthetic media whose frames are machine-readable.
 *
 * This is the fixture behind the frame-exactness test (D-10). Each source frame
 * is a solid colour encoding its own index, so after a real render we can
 * decode the output and see exactly which source frames survived, in what
 * order, and whether any was duplicated or dropped.
 *
 * It is the burned-in frame counter the doctrine asks for, in a form that
 * survives h.264 and yuv420p: sixteen widely separated levels per channel, so
 * compression noise cannot move a level into its neighbour.
 */

import { writeFile } from 'node:fs/promises';
import { ffmpeg } from '../../src/render/ffmpeg.js';
import { HOUSE_FPS } from '../../src/domain/time.js';

const LEVELS = 16;
const STEP = 17; // 0, 17, 34 ... 255

export function encodeIndex(index: number): [number, number, number] {
  if (index >= LEVELS ** 3) throw new RangeError(`index ${index} exceeds encodable range`);
  return [
    (index % LEVELS) * STEP,
    (Math.floor(index / LEVELS) % LEVELS) * STEP,
    (Math.floor(index / (LEVELS * LEVELS)) % LEVELS) * STEP,
  ];
}

/** Inverse. Returns null when the colour is not a valid index colour. */
export function decodeIndex(r: number, g: number, b: number, tolerance = 6): number | null {
  const level = (v: number): number | null => {
    const n = Math.round(v / STEP);
    if (n < 0 || n >= LEVELS) return null;
    return Math.abs(n * STEP - v) <= tolerance ? n : null;
  };
  const lr = level(r), lg = level(g), lb = level(b);
  if (lr === null || lg === null || lb === null) return null;
  return lr + lg * LEVELS + lb * LEVELS * LEVELS;
}

/** A colour that is deliberately NOT on the index grid, so it decodes to null. */
export const RESPONSE_COLOUR: [number, number, number] = [128, 96, 64];

export interface SyntheticOptions {
  frames: number;
  width?: number;
  height?: number;
  /** Solid colour for every frame; omit to encode each frame's index. */
  fixedColour?: [number, number, number];
  toneHz?: number;
}

export async function makeSyntheticVideo(
  outPath: string, rawPath: string, options: SyntheticOptions,
): Promise<void> {
  const { frames, width = 320, height = 180, fixedColour, toneHz = 440 } = options;
  const frameBytes = width * height * 3;
  const buffer = Buffer.alloc(frameBytes * frames);

  for (let i = 0; i < frames; i++) {
    const [r, g, b] = fixedColour ?? encodeIndex(i);
    const base = i * frameBytes;
    for (let p = 0; p < frameBytes; p += 3) {
      buffer[base + p] = r;
      buffer[base + p + 1] = g;
      buffer[base + p + 2] = b;
    }
  }
  await writeFile(rawPath, buffer);

  await ffmpeg([
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`,
    '-r', String(HOUSE_FPS), '-i', rawPath,
    '-f', 'lavfi', '-i', `sine=frequency=${toneHz}:sample_rate=48000:duration=${frames / HOUSE_FPS}`,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p',
    '-g', String(HOUSE_FPS), '-sc_threshold', '0',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    '-shortest', outPath,
  ]);
}

/**
 * Read one representative pixel per frame of a rendered video.
 *
 * Crops the top of the frame before sampling: burned-in captions, lower-thirds
 * and the attribution block all sit at the bottom, and averaging them in would
 * corrupt the reading.
 */
export async function samplePerFrameColours(
  path: string, rawOut: string,
): Promise<Array<[number, number, number]>> {
  await ffmpeg([
    '-i', path,
    '-vf', 'crop=iw:ih*0.28:0:0,scale=1:1:flags=area',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawOut,
  ]);
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(rawOut);
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < buf.length; i += 3) {
    out.push([buf[i]!, buf[i + 1]!, buf[i + 2]!]);
  }
  return out;
}
