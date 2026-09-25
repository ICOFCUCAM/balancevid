/**
 * The broadcast stream, made from real files by real ffmpeg.
 * [Doctrine CHANNEL §7, D-18, INV-17, U-23]
 *
 * The domain tests prove the schedule is arithmetic. This proves the thing
 * that arithmetic drives: that a segment is produced from the referenced file
 * WHERE IT ALREADY LIVES, that scheduling the same film six times adds
 * nothing to disk, and that the sweeper keeps the stream a window rather than
 * an archive.
 *
 * It is the only test that can catch the fault D-18 is actually about,
 * because that fault is a file appearing — and a file appearing is not
 * visible from a type.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Channel, ProgrammeSource } from '../../src/domain/channel.js';
import { newChannel, scheduleProgramme } from '../../src/domain/channelEdit.js';
import { SEGMENT_MS, segmentIndexAt } from '../../src/domain/playout.js';
import { ffmpeg, ffprobe } from '../../src/render/ffmpeg.js';

const AT = '2026-09-25T09:00:00.000Z';
const MINUTE = 60_000;

/** Where var/ points for this file. Set before anything imports paths. */
let root: string;
let produceSegment: typeof import('../../src/playout/segment.js').produceSegment;
let paths: typeof import('../../src/store/paths.js').paths;
let saveChannel: typeof import('../../src/store/channels.js').saveChannel;
let advance: typeof import('../../src/playout/index.js').advance;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-channel-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ produceSegment } = await import('../../src/playout/segment.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ saveChannel } = await import('../../src/store/channels.js'));
  ({ advance } = await import('../../src/playout/index.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A six-second film, in the studio that made it. Made once, referenced often. */
async function makeFilm(documentId: string, planHash: string): Promise<string> {
  const dir = join(root, 'performances', documentId, 'renders', planHash);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'master.mp4');
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', file,
  ]);
  return file;
}

/** Every file under a directory, so "did anything appear" can be answered. */
async function filesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (at: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(at, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) await walk(path, `${prefix}${entry.name}/`);
      else found.push(`${prefix}${entry.name}`);
    }
  };
  await walk(dir, '');
  return found.sort();
}

describe('scheduling touches no disk (D-18, INV-17)', () => {
  it('six broadcasts of one film add not one byte anywhere', async () => {
    await makeFilm('perf_six', 'hash_six');
    const film: ProgrammeSource = {
      kind: 'render', document: 'performance', documentId: 'perf_six',
      planHash: 'hash_six',
    };

    const channel = newChannel('Six Showings', 'UTC', AT);
    await saveChannel(channel);
    const before = await filesUnder(root);
    const filmSize = (await stat(
      join(root, 'performances', 'perf_six', 'renders', 'hash_six', 'master.mp4'))).size;

    for (let showing = 0; showing < 6; showing += 1) {
      scheduleProgramme(channel, {
        startsAt: new Date(Date.parse(AT) + showing * 3 * 60 * MINUTE).toISOString(),
        durationMs: 30 * MINUTE, source: film, title: `Showing ${showing + 1}`,
      }, AT);
    }
    await saveChannel(channel);

    const after = await filesUnder(root);
    /*
     * ONE new file, and it is the document that records the six slots. No
     * media, no staged copy, nothing under the channel's assets.
     */
    const appeared = after.filter((path) => !before.includes(path));
    expect(appeared).toEqual([]);
    expect(channel.programmes).toHaveLength(6);

    // And the film is still exactly one file of exactly the same size.
    const films = await filesUnder(join(root, 'performances', 'perf_six'));
    expect(films).toEqual(['renders/hash_six/master.mp4']);
    expect((await stat(join(root, 'performances', 'perf_six', 'renders',
      'hash_six', 'master.mp4'))).size).toBe(filmSize);

    // The channel's own asset directory, which INV-17 is about, is empty.
    expect(await filesUnder(paths.channelAssets(channel.id))).toEqual([]);
  }, 120_000);
});

describe('the playout engine reads the file where it lives (§7)', () => {
  let channel: Channel;
  let index: number;

  beforeAll(async () => {
    await makeFilm('perf_air', 'hash_air');
    channel = newChannel('On Air', 'UTC', AT);
    /*
     * Scheduled around a real instant, because the engine's answer depends on
     * the clock and a fixed date in 2026 would be off air today.
     */
    const now = Date.now();
    index = segmentIndexAt(now);
    scheduleProgramme(channel, {
      startsAt: new Date(Math.floor(now / 1000) * 1000 - 60_000).toISOString(),
      durationMs: 30 * MINUTE,
      source: {
        kind: 'render', document: 'performance', documentId: 'perf_air',
        planHash: 'hash_air',
      },
      title: 'The film',
      loop: true,
    }, AT);
    await saveChannel(channel);
  });

  it('produces a segment of the house length, from the referenced render', async () => {
    await produceSegment(channel, index, () => ({ durationMs: 6000, hasAudio: true }));
    const file = paths.channelSegment(channel.id, index);
    const info = await stat(file);
    expect(info.size).toBeGreaterThan(1000);

    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration:stream=codec_type', file,
    ]);
    const probed = JSON.parse(raw) as {
      format?: { duration?: string }; streams?: { codec_type?: string }[];
    };
    /* Four seconds of transport, give or take a frame at each end. */
    expect(Number(probed.format?.duration)).toBeGreaterThan(SEGMENT_MS / 1000 - 0.5);
    expect(Number(probed.format?.duration)).toBeLessThan(SEGMENT_MS / 1000 + 0.5);
    /* Both streams, always, so the concatenation has nothing to reconcile. */
    const kinds = (probed.streams ?? []).map((stream) => stream.codec_type).sort();
    expect(kinds).toEqual(['audio', 'video']);
  }, 120_000);

  it('and it lands in stream/, never in assets/', async () => {
    expect(await filesUnder(paths.channelAssets(channel.id))).toEqual([]);
    const streamed = await filesUnder(paths.channelStream(channel.id));
    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed.every((name) => /^\d+\.ts$/.test(name))).toBe(true);
  }, 30_000);

  /*
   * The sweeper is what makes the segments transport rather than an archive.
   * Without it the directory becomes the whole broadcast re-encoded forever,
   * which is D-18 broken by a housekeeping omission.
   */
  it('and the window is swept, so the stream never becomes an archive', async () => {
    const dir = paths.channelStream(channel.id);
    await mkdir(dir, { recursive: true });
    for (const old of [index - 40, index - 30, index - 20]) {
      await writeFile(join(dir, `${old}.ts`), 'stale', 'utf8');
    }
    expect((await filesUnder(dir)).length).toBeGreaterThanOrEqual(4);

    await advance(channel, Date.now());

    const left = await filesUnder(dir);
    for (const old of [index - 40, index - 30, index - 20]) {
      expect(left).not.toContain(`${old}.ts`);
    }
    /* What is left is the window and the run-ahead, not a broadcast day. */
    expect(left.length).toBeLessThan(12);
  }, 180_000);
});

describe('off air is something, not nothing (§4, §7)', () => {
  it('a channel with nothing scheduled still puts four seconds on the wire', async () => {
    const channel = newChannel('Nothing On', 'UTC', AT);
    await saveChannel(channel);
    const index = segmentIndexAt(Date.now());
    await produceSegment(channel, index, () => undefined);

    const file = paths.channelSegment(channel.id, index);
    expect((await stat(file)).size).toBeGreaterThan(500);
    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'stream=codec_type', file,
    ]);
    const kinds = ((JSON.parse(raw) as { streams?: { codec_type?: string }[] })
      .streams ?? []).map((stream) => stream.codec_type).sort();
    /*
     * Black and silence, with both streams — a player that met a segment with
     * no audio track where the last one had one would stall, and "it only
     * breaks when nothing is scheduled" is a fault nobody reproduces.
     */
    expect(kinds).toEqual(['audio', 'video']);
  }, 120_000);

  it('and so does one whose render has been deleted', async () => {
    const channel = newChannel('Broken Schedule', 'UTC', AT);
    const now = Date.now();
    scheduleProgramme(channel, {
      startsAt: new Date(now - 60_000).toISOString(),
      durationMs: 30 * MINUTE,
      source: {
        kind: 'render', document: 'performance', documentId: 'perf_gone',
        planHash: 'hash_gone',
      },
      title: 'The film that was deleted',
    }, AT);
    await saveChannel(channel);

    const index = segmentIndexAt(now);
    await produceSegment(channel, index, () => undefined);
    /* The channel keeps going. INV-17's second half is what says why. */
    expect((await stat(paths.channelSegment(channel.id, index))).size)
      .toBeGreaterThan(500);
  }, 120_000);
});
