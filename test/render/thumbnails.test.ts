/**
 * Thumbnail frame-exactness.  [Doctrine U-30, INV-02, D-10]
 *
 * A thumbnail is a promise about what is in the video, and the author made
 * that promise by stopping at one specific frame. Landing on its neighbour is
 * the same failure as resuming a source "around 14:32" — smaller in
 * consequence, identical in kind.
 *
 * `-ss` does not land on a time, it outputs the first frame at or after it,
 * and seeking to the middle of frame N therefore yields frame N+1. That bug
 * shipped once and no test caught it, because every test asserted that a PNG
 * existed. This one decodes the pixel.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXPORT_PROFILES } from '../../src/domain/presentation.js';
import { FFMPEG, FFPROBE } from '../../src/render/ffmpeg.js';
import { renderThumbnail, quoteCardAss } from '../../src/render/thumbnails.js';
import { decodeIndex, makeSyntheticVideo } from './synthetic.js';

const run = promisify(execFile);
const FRAMES = 200;
const PROFILE = EXPORT_PROFILES['youtube_16x9']!;

let dir: string;
let source: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-thumbs-'));
  source = join(dir, 'source.mp4');
  await makeSyntheticVideo(source, join(dir, 'source.rgb'), { frames: FRAMES });
}, 120_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/** The index the fixture encoded into whichever frame this PNG actually is. */
async function indexOf(
  png: string, x = PROFILE.width / 2, y = PROFILE.height / 2,
): Promise<number | null> {
  const { stdout } = await run(FFMPEG, [
    '-v', 'error', '-i', png,
    '-vf', `crop=2:2:${x}:${y},scale=1:1`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { encoding: 'buffer', maxBuffer: 1 << 20 });
  const raw = stdout as unknown as Buffer;
  return decodeIndex(raw[0]!, raw[1]!, raw[2]!);
}

async function dimensions(png: string): Promise<{ width: number; height: number }> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', png,
  ], { encoding: 'utf8' });
  const [width, height] = String(stdout).trim().split(',').map(Number);
  return { width: width!, height: height! };
}

/** What share of the picture is ink. Zero means the text never drew. */
async function fractionBrighterThan(png: string, threshold: number): Promise<number> {
  const { stdout } = await run(FFMPEG, [
    '-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
  ], { encoding: 'buffer', maxBuffer: 1 << 26 });
  const raw = stdout as unknown as Buffer;
  let bright = 0;
  for (const value of raw) if (value > threshold) bright += 1;
  return bright / raw.length;
}

describe('frame candidates', () => {
  // Both boundaries included: frame 0 is where the seek would go negative,
  // and the last frame is where it would run off the end.
  it.each([0, 1, 37, 99, 150, FRAMES - 1])('grabs exactly frame %i', async (frame) => {
    const outPath = join(dir, `f${frame}.png`);
    await renderThumbnail({
      candidate: { id: `frame_f${frame}`, kind: 'frame', sourceFrame: frame, label: '' },
      profile: PROFILE, mediaPath: source, outPath, scratchDir: dir,
    });
    expect(await indexOf(outPath)).toBe(frame);
  }, 30_000);

  it('fills the export profile exactly, so a thumbnail is never letterboxed', async () => {
    // The fixture is 320x180; the profile is 1920x1080. A thumbnail with black
    // bars is one the platform will crop again, to something nobody chose.
    const outPath = join(dir, 'size.png');
    await renderThumbnail({
      candidate: { id: 'frame_size', kind: 'frame', sourceFrame: 10, label: '' },
      profile: PROFILE, mediaPath: source, outPath, scratchDir: dir,
    });
    expect(await dimensions(outPath)).toEqual({ width: PROFILE.width, height: PROFILE.height });
    // Every corner is the frame's own colour, so nothing was padded in.
    expect(await indexOf(outPath, 4, 4)).toBe(10);
    expect(await indexOf(outPath, PROFILE.width - 6, PROFILE.height - 6)).toBe(10);
  }, 30_000);
});

describe('quote cards', () => {
  it('actually draws the claim, rather than producing a file that merely exists', async () => {
    const outPath = join(dir, 'quote.png');
    await renderThumbnail({
      candidate: { id: 'quote_x', kind: 'quote', text: 'Rome did not fall in 476.', label: '' },
      profile: PROFILE, outPath, scratchDir: dir, attribution: 'Source: "A Video"',
    });
    expect(await dimensions(outPath)).toEqual({ width: PROFILE.width, height: PROFILE.height });
    // A card whose text silently failed to draw is a flat field. Count the ink.
    const ink = await fractionBrighterThan(outPath, 200);
    expect(ink).toBeGreaterThan(0.005);
    // ...but it is a quote card, not a white rectangle.
    expect(ink).toBeLessThan(0.5);
  }, 30_000);

  it('keeps braces and backslashes as text, not as libass markup', () => {
    const ass = quoteCardAss('a {b} c \\d', PROFILE);
    expect(ass).toContain('a \\{b\\} c \\\\d');
  });

  it('sizes type from the narrower dimension, so a vertical card is not oversized', () => {
    const wide = quoteCardAss('x', EXPORT_PROFILES['youtube_16x9']!);
    const tall = quoteCardAss('x', EXPORT_PROFILES['vertical_9x16']!);
    const size = (ass: string) => Number(ass.match(/Style: Quote,[^,]+,(\d+)/)![1]);
    expect(size(wide)).toBe(size(tall));
  });

  it('refuses to draw a card with nothing to say', async () => {
    await expect(renderThumbnail({
      candidate: { id: 'quote_empty', kind: 'quote', text: '   ', label: '' },
      profile: PROFILE, outPath: join(dir, 'empty.png'), scratchDir: dir,
    })).rejects.toThrow(/no text/);
  });
});
