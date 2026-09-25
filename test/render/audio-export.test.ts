/**
 * An MP3 that a podcast player can open.  [Doctrine U-22, D-16, INV-11]
 *
 * `test/domain/audio-export.test.ts` proves the arithmetic and the escaping
 * against strings it built itself. This proves the file: that ffmpeg really
 * does write ID3 chapters where we ask it to, that the picture is gone and
 * the sound is not, and that the length did not move.
 *
 * It is here because the chapter writing was believed rather than checked
 * once already, in another format, and the belief was wrong.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exportAudio } from '../../src/render/audioFile.js';
import { ffmpeg, ffprobe } from '../../src/render/ffmpeg.js';

let dir: string;
let render: string;

/** A short video with sound: what a finished render looks like from outside. */
async function makeRender(path: string, seconds: number): Promise<void> {
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i', `color=c=slategray:s=320x180:r=25:d=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}:sample_rate=48000`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    path,
  ]);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-audio-'));
  render = join(dir, 'master.mp4');
  await makeRender(render, 6);
}, 120_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('exporting a render as audio (U-22)', () => {
  it('writes an MP3 with the chapters, the sound, and no picture', async () => {
    const outPath = join(dir, 'audio.mp3');
    const result = await exportAudio({
      from: render,
      outPath,
      title: 'A conversation',
      artist: 'Someone',
      chapters: [
        { startMs: 0, endMs: 2000, title: 'The source' },
        { startMs: 2000, endMs: 6000, title: 'Growth = good' },
      ],
    });
    expect(result.chapters).toBe(2);
    // Two-pass, not one: a single-pass loudnorm on spoken word pumps.
    expect(result.measured).toBe(true);

    const raw = await ffprobe([
      '-v', 'error', '-show_format', '-show_streams', '-show_chapters',
      '-of', 'json', outPath,
    ]);
    const probed = JSON.parse(raw) as {
      format: { duration: string; tags?: Record<string, string> };
      streams: { codec_type: string; codec_name: string }[];
      chapters: { start_time: string; end_time: string; tags?: { title?: string } }[];
    };

    // One audio stream, and nothing else. `-vn` is not decoration: an MP3
    // carrying a video stream is a file some players refuse.
    expect(probed.streams).toHaveLength(1);
    expect(probed.streams[0]!.codec_type).toBe('audio');
    expect(probed.streams[0]!.codec_name).toBe('mp3');

    // The length did not move. Mastering changes level, not duration. [INV-03]
    expect(Number(probed.format.duration)).toBeCloseTo(6, 0);

    /*
     * The chapters survived the round trip through ID3 — this is the part
     * that was assumed and had to be measured. The title with the `=` in it
     * comes back whole, which is what the escaping is for.
     */
    expect(probed.chapters).toHaveLength(2);
    expect(probed.chapters.map((c) => c.tags?.title))
      .toEqual(['The source', 'Growth = good']);
    expect(Number(probed.chapters[1]!.start_time)).toBeCloseTo(2, 1);

    expect(probed.format.tags?.title).toBe('A conversation');
    expect(probed.format.tags?.artist).toBe('Someone');
  }, 180_000);

  it('still produces a file when there are no chapters to write', async () => {
    // A conversation nobody has interrupted yet is still listenable.
    const outPath = join(dir, 'plain.mp3');
    const result = await exportAudio({ from: render, outPath, chapters: [] });
    expect(result.chapters).toBe(0);
    const raw = await ffprobe(['-v', 'error', '-show_chapters', '-of', 'json', outPath]);
    expect((JSON.parse(raw) as { chapters: unknown[] }).chapters).toHaveLength(0);
  }, 180_000);
});
