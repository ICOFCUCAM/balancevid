/**
 * Performing beside the thing you are performing against.
 * [STUDIO-TWO §3, §5, INV-15, D-08]
 *
 * "A music video, or another video to perform against." The master arrived as
 * sound and its picture was thrown away at ingest — so Half Mode could only
 * ever be two takes of the performer, never the performer beside the work.
 *
 * Three claims, and the last is the one that matters most:
 *
 *   A MASTER WITH A PICTURE KEEPS IT, measured from the file rather than
 *   guessed from its extension, and a song keeps nothing.
 *
 *   IT REACHES THE FRAME, seeked to where the scene sits on the music clock.
 *
 *   AND THE RIGHTS GOVERN IT. Putting somebody's music video on screen is a
 *   reproduction of the audiovisual work — a distinct right from the sync and
 *   mechanical rights over the song, and if anything the stronger claim. A
 *   product that refuses to publish the sound must not publish the picture
 *   that came with it.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normaliseMasterPicture } from '../../src/render/audio.js';
import { mayShowMasterPicture } from '../../src/domain/performance.js';
import { LAYOUTS } from '../../src/domain/presentation.js';
import { ffmpeg, ffprobe } from '../../src/render/ffmpeg.js';
import type { MasterTrack } from '../../src/domain/performance.js';

let dir: string;

const master = (over: Partial<MasterTrack> = {}): MasterTrack => ({
  assetId: 'asset_m' as never, title: 'A song', class: 'own',
  durationSamples: 48_000 * 10, ...over,
} as MasterTrack);

beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'balancevid-mpic-')); }, 60_000);
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('keeping the master\'s picture (§3)', () => {
  it('keeps it, and measures its shape, when the master is a video', async () => {
    const source = join(dir, 'video.mp4');
    await ffmpeg([
      '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=300:duration=4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source,
    ]);
    const out = join(dir, 'picture.mp4');
    const shape = await normaliseMasterPicture(source, out);
    expect(shape).toEqual({ width: 640, height: 360 });
    expect((await stat(out)).size).toBeGreaterThan(0);

    // Silent: the sound comes from the normalised master, and a second copy
    // of it inside the picture is a second thing that can drift.
    const raw = await ffprobe([
      '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out]);
    expect(raw.trim().split('\n')).toEqual(['video']);
  }, 180_000);

  it('keeps nothing when the master is a song', async () => {
    const song = join(dir, 'song.m4a');
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:a', 'aac', song]);
    expect(await normaliseMasterPicture(song, join(dir, 'none.mp4'))).toBeNull();
  }, 180_000);

  /*
   * A cover-art JPEG inside an MP3 is a video stream as far as ffprobe is
   * concerned, and it is not a picture to perform against. One frame is not a
   * video, and a Half Mode showing an album cover for four minutes would be a
   * feature nobody asked for arriving by accident.
   */
  it('and nothing for cover art, which is a video stream and not a video', async () => {
    const withArt = join(dir, 'art.mp3');
    await ffmpeg([
      '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-f', 'lavfi', '-i', 'color=c=red:s=300x300:d=0.04',
      '-map', '0:a', '-map', '1:v', '-frames:v', '1',
      '-c:v', 'mjpeg', '-c:a', 'libmp3lame',
      '-id3v2_version', '3', '-metadata:s:v', 'title=cover', withArt,
    ]);
    expect(await normaliseMasterPicture(withArt, join(dir, 'art-out.mp4'))).toBeNull();
  }, 180_000);
});

describe('whether it may be shown (INV-15, D-08)', () => {
  it('a song with no picture shows none, whatever its rights say', () => {
    expect(mayShowMasterPicture(master({ class: 'own' }))).toBe(false);
  });

  it('the author\'s own work, and what they hold a licence for, may be shown', () => {
    for (const cls of ['own', 'licensed', 'open'] as const) {
      expect(mayShowMasterPicture(master({
        class: cls, videoAssetId: 'asset_p' as never }))).toBe(true);
    }
  });

  /*
   * The whole point. The rights exemption lets somebody rehearse over a
   * commercial recording privately; it does not let the product put that
   * recording's PICTURE on screen in something it will publish.
   */
  it('and a commercial recording\'s picture may not be shown', () => {
    expect(mayShowMasterPicture(master({
      class: 'third_party', videoAssetId: 'asset_p' as never }))).toBe(false);
  });
});

describe('the arrangements it makes possible (§5)', () => {
  it('Half Mode has both forms: two takes, and a take beside the work', () => {
    const takes = LAYOUTS['performance_half']!;
    const beside = LAYOUTS['performance_beside_master']!;
    expect(takes.layers.every((layer) => layer.source === 'take')).toBe(true);
    expect(beside.layers.some((layer) => layer.source === 'master')).toBe(true);
    expect(beside.layers.some((layer) => layer.source === 'take')).toBe(true);
  });

  /*
   * A take is a person and cropping their edges is fine. The master is
   * somebody else's composed frame: cropping it shows them something they did
   * not make.
   */
  it('and the master is contained, never cropped', () => {
    for (const layout of Object.values(LAYOUTS)) {
      for (const layer of layout.layers) {
        if (layer.source === 'master') {
          expect(layer.fit, `${layout.id} crops the master`).toBe('contain');
        }
      }
    }
  });

  it('reframing it stacks rather than shrinking two panels into strips', () => {
    const beside = LAYOUTS['performance_beside_master']!;
    const stacked = LAYOUTS[beside.reframe!.tall!]!;
    const take = stacked.layers.find((layer) => layer.source === 'take')!;
    const work = stacked.layers.find((layer) => layer.source === 'master')!;
    expect(take.rect.w).toBeGreaterThan(0.9);
    expect(work.rect.w).toBeGreaterThan(0.9);
    expect(take.rect.y + take.rect.h).toBeLessThanOrEqual(work.rect.y);
  });
});
