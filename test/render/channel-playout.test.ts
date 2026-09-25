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
/* eslint-disable @typescript-eslint/consistent-type-imports */
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

describe('the loop, on the wire (§4, §5)', () => {
  /*
   * The brief's channel: a handful of finished things, back to back, round
   * and round. What is proved here is what the domain tests cannot — that the
   * engine turns that into real segments from the real files, and that going
   * live interrupts it without touching either.
   */
  let channel: Channel;
  let goLive: typeof import('../../src/domain/channelEdit.js').goLive;
  let takeLive: typeof import('../../src/domain/channelEdit.js').takeLive;
  let endLive: typeof import('../../src/domain/channelEdit.js').endLive;
  let addToRotation: typeof import('../../src/domain/channelEdit.js').addToRotation;

  beforeAll(async () => {
    ({ addToRotation, goLive, takeLive, endLive } = await import(
      '../../src/domain/channelEdit.js'));
    await makeFilm('perf_loop_a', 'hash_a');
    await makeFilm('perf_loop_b', 'hash_b');
    channel = newChannel('Always On', 'UTC', AT);
    channel.rotationFrom = new Date(Date.now() - 60_000).toISOString();
    addToRotation(channel, {
      source: {
        kind: 'render', document: 'performance', documentId: 'perf_loop_a',
        planHash: 'hash_a',
      },
      durationMs: 6000, title: 'A',
    }, AT);
    addToRotation(channel, {
      source: {
        kind: 'render', document: 'performance', documentId: 'perf_loop_b',
        planHash: 'hash_b',
      },
      durationMs: 6000, title: 'B',
    }, AT);
    await saveChannel(channel);
  });

  it('a twelve-second loop of two films is two files, forever', async () => {
    const { referencedAssets } = await import('../../src/domain/channel.js');
    expect(channel.rotation).toHaveLength(2);
    expect(referencedAssets(channel)).toHaveLength(2);
    /* A day of this channel is still two files. */
    const { playoutWindow, distinctAssetsRead } = await import(
      '../../src/domain/playout.js');
    const now = Date.now();
    const reads = playoutWindow(channel, now, now + 6 * 60 * 60 * 1000, () => 6000);
    expect(reads.length).toBeGreaterThan(3000);
    expect(distinctAssetsRead(reads)).toBe(2);
  });

  it('and the engine puts it on the wire, never off air', async () => {
    const index = segmentIndexAt(Date.now());
    await produceSegment(channel, index, () => ({ durationMs: 6000, hasAudio: true }));
    const file = paths.channelSegment(channel.id, index);
    expect((await stat(file)).size).toBeGreaterThan(1000);
    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration:stream=codec_type', file,
    ]);
    const probed = JSON.parse(raw) as {
      format?: { duration?: string }; streams?: { codec_type?: string }[];
    };
    expect(Number(probed.format?.duration)).toBeGreaterThan(SEGMENT_MS / 1000 - 0.5);
    expect((probed.streams ?? []).map((s) => s.codec_type).sort())
      .toEqual(['audio', 'video']);
  }, 120_000);

  /*
   * "You press GO LIVE. The scheduled programming stops or pauses... Then End
   *  Live and the scheduled channel automatically resumes."
   */
  it('going live interrupts the loop without editing it', async () => {
    const { whatIsOn } = await import('../../src/domain/channel.js');
    const before = JSON.stringify(channel.rotation);
    /* Armed is not on air — the wire is still showing the loop. [§6] */
    goLive(channel, 'The live studio', new Date().toISOString());
    expect(whatIsOn(channel, Date.now()).kind).toBe('rotation');
    takeLive(channel, new Date().toISOString());
    expect(whatIsOn(channel, Date.now()).kind).toBe('live');
    expect(JSON.stringify(channel.rotation)).toBe(before);

    /*
     * And the wire keeps moving. The feed's own file does not exist yet — no
     * encoder has pushed anything — so what goes out is black rather than
     * nothing, which is the difference between a channel that is live with no
     * picture and a channel that has stopped.
     */
    const index = segmentIndexAt(Date.now()) + 1;
    await produceSegment(channel, index, () => undefined);
    expect((await stat(paths.channelSegment(channel.id, index))).size)
      .toBeGreaterThan(500);
  }, 120_000);

  it('and ending it puts the loop back where the clock says', async () => {
    const { whatIsOn } = await import('../../src/domain/channel.js');
    const ended = endLive(channel, new Date().toISOString(), 60_000);
    const on = whatIsOn(channel, Date.now());
    expect(on.kind).toBe('rotation');
    expect(channel.ingests[0]!.closedAt).toBeDefined();
    /*
     * Nobody pressed Save, so the buffer is discarded and the channel is left
     * holding nothing at all — which is the brief's rule, checked against
     * disk rather than against the document. [§8]
     */
    expect(ended.keep).toBe(false);
    expect(channel.ingests[0]!.assetId).toBeUndefined();
    expect(await filesUnder(paths.channelAssets(channel.id))).toEqual([]);
  });
});

describe('the pipe: camera bytes reach the wire (§7, §8)', () => {
  /*
   *     Camera → Microphone → Live ingest → Broadcast encoder → Online TV
   *
   * Everything downstream of the ingest was built and tested before the
   * ingest existed. This is the test that could not be written until the pipe
   * was: real bytes appended to a growing buffer, read by the playout engine
   * at the broadcast delay, and put on the wire as a segment with a picture
   * in it.
   */
  let channel: Channel;
  let goLive: typeof import('../../src/domain/channelEdit.js').goLive;
  let takeLive: typeof import('../../src/domain/channelEdit.js').takeLive;
  let keepLive: typeof import('../../src/domain/channelEdit.js').keepLive;
  let endLive: typeof import('../../src/domain/channelEdit.js').endLive;
  let liveBuffer: typeof import('../../src/store/liveBuffer.js');

  beforeAll(async () => {
    ({ goLive, takeLive, keepLive, endLive } = await import(
      '../../src/domain/channelEdit.js'));
    liveBuffer = await import('../../src/store/liveBuffer.js');
  });

  /**
   * What a browser posts: WebM from MediaRecorder, in chunks. Made here with
   * ffmpeg rather than mocked, because the whole question is whether
   * appending real encoder output produces a file the playout engine can
   * read — and a mock would answer a different question.
   */
  async function pushChunks(bufferPath: string, seconds: number): Promise<void> {
    await mkdir(join(bufferPath, '..'), { recursive: true });
    const piece = `${bufferPath}.chunk.webm`;
    await ffmpeg([
      '-y',
      '-f', 'lavfi', '-i', `testsrc=size=320x180:rate=15:duration=${seconds}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
      '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '300k',
      '-c:a', 'libopus', '-b:a', '64k', '-shortest', piece,
    ]);
    const { readFile, appendFile } = await import('node:fs/promises');
    const bytes = await readFile(piece);
    /*
     * Checked before it is appended. A zero-byte encode under a loaded
     * machine would otherwise surface three assertions later as "the buffer
     * is empty", which is a true statement about the wrong thing.
     */
    if (bytes.byteLength === 0) throw new Error('the test encoder produced nothing');
    await appendFile(bufferPath, bytes);
    await rm(piece, { force: true });
  }

  it('bytes appended to the buffer become a segment with a picture', async () => {
    channel = newChannel('Live Test', 'UTC', AT);
    /*
     * Armed twenty seconds ago, so the twelve-second delay has been met and
     * the read lands eight seconds into a buffer that holds twenty-four.
     */
    const opened = new Date(Date.now() - 20_000).toISOString();
    goLive(channel, 'The live studio', opened);
    takeLive(channel, opened);
    await saveChannel(channel);

    const bufferPath = paths.channelLiveBuffer(
      channel.id, channel.ingests[0]!.bufferId);
    await mkdir(paths.channelLive(channel.id), { recursive: true });
    await pushChunks(bufferPath, 24);
    expect((await stat(bufferPath)).size).toBeGreaterThan(1000);

    const index = segmentIndexAt(Date.now());
    await produceSegment(channel, index, () => undefined);
    const file = paths.channelSegment(channel.id, index);
    const info = await stat(file);
    expect(info.size).toBeGreaterThan(1000);

    /*
     * A PICTURE, NOT A SLATE — measured rather than guessed from the file
     * size. A size threshold is a bitrate threshold in disguise and fails on
     * a loaded machine; the average luminance of a black slate is about
     * sixteen and of a test pattern is not.
     */
    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration:stream=codec_type', file,
    ]);
    const probed = JSON.parse(raw) as {
      format?: { duration?: string }; streams?: { codec_type?: string }[];
    };
    expect(Number(probed.format?.duration)).toBeGreaterThan(SEGMENT_MS / 1000 - 0.5);
    expect((probed.streams ?? []).map((s) => s.codec_type).sort())
      .toEqual(['audio', 'video']);

    /*
     * A PICTURE, NOT A SLATE — measured against a slate made by the same
     * encoder in the same second, rather than against a number.
     *
     * An absolute file size is a bitrate threshold in disguise and fails on a
     * loaded machine. Decoding a frame would be better and is not available:
     * `signalstats`, a one-pixel scale and rawvideo output all segfault on
     * this platform's static ffmpeg, the same way the concat demuxer does. A
     * relative comparison needs none of them and answers the actual question,
     * which is whether anything is moving.
     */
    const slateChannel = newChannel('Slate', 'UTC', AT);
    await saveChannel(slateChannel);
    await produceSegment(slateChannel, index, () => undefined);
    const slate = await stat(paths.channelSegment(slateChannel.id, index));
    expect(info.size).toBeGreaterThan(slate.size * 3);
  }, 180_000);

  /*
   * "If you don't choose to save, the temporary live buffers are discarded
   *  after the broadcast."
   */
  it('and the buffer is gone afterwards, when nobody saved it', async () => {
    const bufferId = channel.ingests[0]!.bufferId;
    const ended = endLive(channel, new Date().toISOString(), 30_000);
    expect(ended.keep).toBe(false);
    await liveBuffer.discardBuffer(channel.id, bufferId);
    await expect(stat(paths.channelLiveBuffer(channel.id, bufferId))).rejects.toThrow();
    expect(await filesUnder(paths.channelAssets(channel.id))).toEqual([]);
  }, 60_000);

  it('but a saved one is renamed into assets, not copied', async () => {
    const c = newChannel('Keep It', 'UTC', AT);
    const opened = new Date(Date.now() - 30_000).toISOString();
    goLive(c, 'Kept', opened);
    takeLive(c, opened);
    keepLive(c, true);
    await saveChannel(c);

    const bufferId = c.ingests[0]!.bufferId;
    await mkdir(paths.channelLive(c.id), { recursive: true });
    await pushChunks(paths.channelLiveBuffer(c.id, bufferId), 4);
    const before = (await stat(paths.channelLiveBuffer(c.id, bufferId))).size;

    const ended = endLive(c, new Date().toISOString(), 30_000);
    expect(ended.keep).toBe(true);
    await liveBuffer.keepBuffer(c.id, bufferId, (ended as { assetId: string }).assetId);

    /* The same bytes, in a different place. A rename, not a copy. */
    const after = await stat(
      paths.channelAsset(c.id, (ended as { assetId: string }).assetId, 'webm'));
    expect(after.size).toBe(before);
    await expect(stat(paths.channelLiveBuffer(c.id, bufferId))).rejects.toThrow();
  }, 180_000);
});


describe('a segment is never empty, whatever the feed does (§7)', () => {
  /*
   * ffmpeg can exit successfully having written no packets, and the commonest
   * cause is reading a live buffer past its end — which happens whenever the
   * camera falls behind the delay, and it will happen. A player handed a
   * zero-byte segment stalls and often gives up on the stream; one handed
   * four seconds of black carries on and recovers when the feed does.
   */
  it('a live read past the end of the buffer puts black on the wire', async () => {
    const { goLive, takeLive } = await import('../../src/domain/channelEdit.js');
    const c = newChannel('Short Buffer', 'UTC', AT);
    /* Armed a minute ago, so the read lands 48s in — and the buffer is empty. */
    const opened = new Date(Date.now() - 60_000).toISOString();
    goLive(c, 'Nothing arriving', opened);
    takeLive(c, opened);
    await saveChannel(c);
    await mkdir(paths.channelLive(c.id), { recursive: true });
    await writeFile(paths.channelLiveBuffer(c.id, c.ingests[0]!.bufferId), '');

    const index = segmentIndexAt(Date.now());
    await produceSegment(c, index, () => undefined);
    const info = await stat(paths.channelSegment(c.id, index));
    expect(info.size).toBeGreaterThan(1000);

    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration:stream=codec_type', paths.channelSegment(c.id, index),
    ]);
    const probed = JSON.parse(raw) as {
      format?: { duration?: string }; streams?: { codec_type?: string }[];
    };
    expect(Number(probed.format?.duration)).toBeGreaterThan(SEGMENT_MS / 1000 - 0.5);
    expect((probed.streams ?? []).map((s) => s.codec_type).sort())
      .toEqual(['audio', 'video']);
  }, 120_000);
});

describe('the engine notices when the feed goes away (§9)', () => {
  /*
   * The domain can be TOLD a feed has failed; this is the part that has to
   * work out that it has. "The viewer should never see your FFmpeg error or a
   * dead screen" is only true if something is watching while nobody is.
   */
  it('a buffer that stops growing is faulted, and the backup takes the air', async () => {
    const { goLive, takeLive, setBackup } = await import(
      '../../src/domain/channelEdit.js');
    const { whatIsOn } = await import('../../src/domain/channel.js');
    const { pass } = await import('../../src/playout/index.js');
    const { loadChannel } = await import('../../src/store/channels.js');

    await makeFilm('perf_backup', 'hash_backup');
    const c = newChannel('Falls Over', 'UTC', AT);
    setBackup(c, {
      kind: 'render', document: 'performance', documentId: 'perf_backup',
      planHash: 'hash_backup',
    });
    const opened = new Date(Date.now() - 20_000).toISOString();
    goLive(c, 'Evening Discussion', opened);
    takeLive(c, opened);
    await saveChannel(c);

    const buffer = paths.channelLiveBuffer(c.id, c.ingests[0]!.bufferId);
    await mkdir(paths.channelLive(c.id), { recursive: true });
    await writeFile(buffer, 'some bytes that arrived');

    /* First pass: the buffer was seen. Nothing is wrong yet. */
    const now = Date.now();
    await pass(now);
    expect((await loadChannel(c.id)).live!.faultedAt).toBeUndefined();

    /*
     * Eleven seconds later and not one byte more. The engine gives up on the
     * feed — without ending the session, because nobody decided anything.
     */
    await pass(now + 11_000);
    const faulted = await loadChannel(c.id);
    expect(faulted.live!.faultedAt).toBeDefined();
    expect(faulted.live!.phase).toBe('on_air');
    expect(whatIsOn(faulted, now + 11_000).kind).toBe('backup');
  }, 180_000);

  it('and when the bytes come back, so does the broadcast', async () => {
    const { goLive, takeLive } = await import('../../src/domain/channelEdit.js');
    const { whatIsOn } = await import('../../src/domain/channel.js');
    const { pass } = await import('../../src/playout/index.js');
    const { loadChannel } = await import('../../src/store/channels.js');

    const c = newChannel('Comes Back', 'UTC', AT);
    const opened = new Date(Date.now() - 20_000).toISOString();
    goLive(c, 'Evening Discussion', opened);
    takeLive(c, opened);
    await saveChannel(c);

    const buffer = paths.channelLiveBuffer(c.id, c.ingests[0]!.bufferId);
    await mkdir(paths.channelLive(c.id), { recursive: true });
    await writeFile(buffer, 'first');

    const now = Date.now();
    await pass(now);
    await pass(now + 11_000);
    expect((await loadChannel(c.id)).live!.faultedAt).toBeDefined();

    /* The presenter reconnects. */
    const { appendFile } = await import('node:fs/promises');
    await appendFile(buffer, 'and more');
    await pass(now + 13_000);
    const back = await loadChannel(c.id);
    expect(back.live!.faultedAt).toBeUndefined();
    expect(whatIsOn(back, now + 13_000).kind).toBe('live');
  }, 180_000);
});
