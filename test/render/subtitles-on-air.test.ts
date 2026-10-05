/**
 * The words on the wire, made from a real sidecar by the real
 * engine.  [Doctrine CHANNEL §7, §17, D-18, D-19, TV-NETWORK N-10]
 *
 * THE DOMAIN TESTS PROVE THE CUT IS ARITHMETIC. This proves the
 * thing that arithmetic was for and nothing was doing: that a
 * channel scheduling a render puts that render's OWN captions on
 * the segment grid, from the file `compose.ts` wrote beside it,
 * and that the clock the player is handed is the clock the
 * picture is actually on.
 *
 * THE TIMESTAMP MAP IS MEASURED AND NOT ASSERTED FROM MEMORY.
 * `MPEGTS_START` is a number about ffmpeg's muxer written in a
 * module that cannot see one — the mistake `master.m3u8`'s
 * `CODECS` note describes. So this produces a real transport
 * segment, probes the PTS its first frame actually carries, and
 * requires the constant to equal it. A future ffmpeg that
 * changes its initial offset fails here rather than sliding
 * everybody's captions by a second and a half.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Channel, ProgrammeSource } from '../../src/domain/channel.js';
import {
  newChannel, scheduleProgramme, setStation,
} from '../../src/domain/channelEdit.js';
/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  SEGMENT_MS, segmentIndexAt, segmentStart,
} from '../../src/domain/playout.js';
import { readVtt } from '../../src/domain/webvtt.js';
import { ffmpeg, ffprobe } from '../../src/render/ffmpeg.js';

const AT = '2026-09-25T09:00:00.000Z';
const MINUTE = 60_000;
/* An instant the film is actually on — see `audio-renditions`. */
const SHOWING = Date.parse(AT) + SEGMENT_MS;

let root: string;
let produceSubtitle: typeof import('../../src/playout/subtitleRendition.js').produceSubtitle;
let subtitleOf: typeof import('../../src/playout/subtitleRendition.js').subtitleOf;
let produceSegment: typeof import('../../src/playout/segment.js').produceSegment;
let SEGMENT_START_PTS: number;
let paths: typeof import('../../src/store/paths.js').paths;
let saveChannel: typeof import('../../src/store/channels.js').saveChannel;
let readFile: typeof import('node:fs/promises').readFile;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-subs-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ produceSubtitle, subtitleOf } =
    await import('../../src/playout/subtitleRendition.js'));
  ({ produceSegment, SEGMENT_START_PTS } =
    await import('../../src/playout/segment.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ saveChannel } = await import('../../src/store/channels.js'));
  ({ readFile } = await import('node:fs/promises'));
}, 120_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/**
 * A film, with the WebVTT sidecar `compose.ts` writes beside
 * every render it finishes.
 *
 * `${master}.vtt` IS THE NAME, not a name of this test's
 * choosing: it is what `compose.ts` writes and what the engine
 * looks for, and a fixture that invented its own would be a test
 * of nothing. [render/compose.ts]
 */
async function makeFilmWithCaptions(
  documentId: string, planHash: string, vtt: string,
): Promise<void> {
  const dir = join(paths.performanceRenders(documentId), planHash);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'master.mp4');
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', file,
  ]);
  await writeFile(`${file}.vtt`, vtt, 'utf8');
}

/*
 * THE FILM BEGINS ON A SEGMENT BOUNDARY, so the window a test
 * asks for IS the stretch of film it names. `AT` is not on the
 * four-second grid — nothing is, in general — and a test that
 * assumed it was would be asserting about a window a second or
 * two away from the one it meant.
 */
const ALIGNED = segmentStart(segmentIndexAt(Date.parse(AT)));

function captioned(
  name: string, source: ProgrammeSource,
  startsAt = new Date(ALIGNED).toISOString(),
): Channel {
  const channel = newChannel(name, 'UTC', AT);
  setStation(channel, { language: 'en', subtitles: true }, []);
  scheduleProgramme(channel, {
    startsAt, durationMs: 30 * MINUTE, source, title: 'The Film',
  }, AT);
  return channel;
}

const FILM: ProgrammeSource = {
  kind: 'render', document: 'performance',
  documentId: 'perf_caps', planHash: 'hash_caps',
};

/*
 * Two lines a test can tell apart, placed so that the first
 * segment of the film holds one and the second holds the other —
 * which is what makes *the right words on the right four
 * seconds* a thing this file can check rather than assume.
 */
const CUES = 'WEBVTT\n\n'
  + '00:00:04.500 --> 00:00:06.500\n<v Source>The second verse, then.\n\n'
  + '00:00:09.500 --> 00:00:11.000\n<v Ada>Outdoors?\n';

describe('which channels offer captions (§17, N-10)', () => {
  it('offers none until a broadcaster switches them on', () => {
    const channel = newChannel('Quiet', 'UTC', AT);
    setStation(channel, { language: 'en' }, []);
    expect(subtitleOf(channel)).toBeNull();
  });

  it('offers the channel’s own language when they are on', () => {
    const channel = newChannel('Loud', 'UTC', AT);
    setStation(channel, { language: 'EN', subtitles: true }, []);
    expect(subtitleOf(channel)).toEqual({ language: 'en' });
  });

  /*
   * THE DEFAULT AUDIO TRACK WHERE THE STATION NEVER SAID. A
   * broadcaster who bothered to declare their audio tracks has
   * already answered which language the channel is in.
   */
  it('falls back to the default audio track’s language', () => {
    const channel = newChannel('Bi', 'UTC', AT);
    setStation(channel, {
      subtitles: true,
      audio: [{ language: 'en' }, { language: 'fr', default: true }],
    }, [], { multiAudio: true });
    expect(subtitleOf(channel)).toEqual({ language: 'fr' });
  });

  /*
   * AND `und` WHERE THERE IS NEITHER, which is the subtag that
   * exists for exactly this. Guessing English at a product used
   * in every country is a guess that is wrong most of the time.
   */
  it('says undetermined rather than guessing English', () => {
    const channel = newChannel('Nameless', 'UTC', AT);
    setStation(channel, { subtitles: true }, []);
    expect(subtitleOf(channel)).toEqual({ language: 'und' });
  });
});

describe('the words reach the disk (§17, N-10)', () => {
  it('writes the programme’s own lines, on the segment they fall in',
    async () => {
      await makeFilmWithCaptions('perf_caps', 'hash_caps', CUES);
      const channel = captioned('Captioned TV', FILM);
      await saveChannel(channel);

      /* The cue at 4.5s falls in the film's SECOND four
         seconds; the one at 9.5s falls in its third. */
      const index = segmentIndexAt(ALIGNED) + 1;
      expect(await produceSubtitle(channel, index,
        () => ({ durationMs: 30_000, audioStreams: 1 }))).toBe('en');

      const file = paths.channelSubtitleSegment(channel.id, 'en', index);
      const said = await readFile(file, 'utf8');
      expect(said).toContain('<v Source>The second verse, then.');
      /* And NOT the line that belongs three segments later. */
      expect(said).not.toContain('Outdoors?');

      /*
       * REBASED ONTO THE SEGMENT. The cue is at 4.5s in the
       * film and 0.5s into this four seconds; a segment
       * carrying the film's own clock would put every line
       * minutes away from the picture.
       */
      const lines = readVtt(said);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.fromMs).toBe(500);
      expect(lines[0]!.toMs).toBe(2500);
    }, 180_000);

  /*
   * MOST OF A CHANNEL'S DAY HAS NO WORDS IN IT, and the segment
   * is written anyway. A rendition whose segments stopped
   * appearing is a player stalling on the track the viewer
   * chose; a header with no cues is valid WebVTT and says the
   * true thing. [U-19, D-21]
   */
  it('writes an empty segment where nothing is being said', async () => {
    await makeFilmWithCaptions('perf_caps', 'hash_caps', CUES);
    const channel = captioned('Quiet Patch', FILM);
    await saveChannel(channel);

    /* The film's FIRST four seconds, which nobody speaks in. */
    const index = segmentIndexAt(ALIGNED);
    expect(await produceSubtitle(channel, index,
      () => ({ durationMs: 30_000, audioStreams: 1 }))).toBe('en');
    const said = await readFile(
      paths.channelSubtitleSegment(channel.id, 'en', index), 'utf8');
    expect(said).toContain('WEBVTT');
    expect(said).not.toContain('-->');
  }, 180_000);

  /*
   * A CHANNEL OFF AIR IS A CHANNEL WITH NOTHING TO SAY, and it
   * still has to put a segment on the wire for whoever turned
   * captions on. [U-19]
   */
  it('writes an empty segment for a channel that is off air', async () => {
    const channel = newChannel('Nothing On', 'UTC', AT);
    setStation(channel, { language: 'en', subtitles: true }, []);
    await saveChannel(channel);

    const index = segmentIndexAt(SHOWING);
    expect(await produceSubtitle(channel, index, () => undefined)).toBe('en');
    const said = await readFile(
      paths.channelSubtitleSegment(channel.id, 'en', index), 'utf8');
    expect(said).not.toContain('-->');
  }, 180_000);

  /* Nothing whatever for a channel that never switched them on:
     no directory, no files, no work. [D-18] */
  it('writes nothing for a channel that does not caption', async () => {
    const channel = newChannel('Plain', 'UTC', AT);
    setStation(channel, { language: 'en' }, []);
    await saveChannel(channel);
    const index = segmentIndexAt(SHOWING);
    expect(await produceSubtitle(channel, index, () => undefined)).toBeNull();
    await expect(readdir(paths.channelSubtitleRoot(channel.id))).rejects.toThrow();
  }, 180_000);

  /*
   * A PROGRAMME WITH NO SIDECAR IS NOT A HOLE. Library media —
   * an uploaded film, an ident, a caption card — came from
   * outside this product and carries no transcript, and the
   * broadcaster was told so beside the switch.
   */
  it('writes an empty segment over media that was never transcribed',
    async () => {
      const asset = 'asset_uploaded_00001';
      await mkdir(paths.library(), { recursive: true });
      await ffmpeg([
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=20',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-shortest', paths.libraryMedia(asset, 'mp4'),
      ]);
      const channel = captioned('Uploaded TV',
        { kind: 'media', assetId: asset, form: 'video' });
      await saveChannel(channel);

      const index = segmentIndexAt(SHOWING);
      expect(await produceSubtitle(channel, index,
        () => ({ durationMs: 20_000, audioStreams: 1 }))).toBe('en');
      const said = await readFile(
        paths.channelSubtitleSegment(channel.id, 'en', index), 'utf8');
      expect(said).not.toContain('-->');
    }, 180_000);

  /*
   * A SEGMENT THAT CROSSES A PROGRAMME BOUNDARY CARRIES BOTH
   * HALVES' WORDS, SHIFTED. The picture does this by encoding
   * two pieces and appending them; the captions do it by
   * shifting the second read's lines by where it sits. A
   * segment that forgot the shift would put the next
   * programme's first line at the top of this one's four
   * seconds. [§7]
   */
  it('shifts the lines of a read that starts mid-segment', async () => {
    await makeFilmWithCaptions('perf_edge', 'hash_edge',
      'WEBVTT\n\n00:00:00.200 --> 00:00:01.000\nOpening line.\n');
    /* The film begins two seconds into a segment, so its own
       zero is two seconds into that segment's four. */
    const begins = ALIGNED + 2000;
    const channel = captioned('Edge TV', {
      kind: 'render', document: 'performance',
      documentId: 'perf_edge', planHash: 'hash_edge',
    }, new Date(begins).toISOString());
    await saveChannel(channel);

    const index = segmentIndexAt(begins);
    expect(await produceSubtitle(channel, index,
      () => ({ durationMs: 30_000, audioStreams: 1 }))).toBe('en');
    const lines = readVtt(await readFile(
      paths.channelSubtitleSegment(channel.id, 'en', index), 'utf8'));
    expect(lines).toHaveLength(1);
    /* 0.2s into the film, which began 2s into this segment. */
    expect(lines[0]!.fromMs).toBe(2200);
    expect(lines[0]!.toMs).toBe(3000);
  }, 180_000);
});

describe('the clock the player is handed (§7, §17)', () => {
  /*
   * THE ONE NUMBER THIS FEATURE CANNOT GET WRONG QUIETLY.
   *
   * `X-TIMESTAMP-MAP` is what ties a caption segment's clock to
   * the transport stream beside it. Wrong, the words are early
   * or late by a fixed amount on every player that honours it —
   * which looks like a transcription fault rather than a
   * playlist one, and would be chased in the wrong module for a
   * long time.
   *
   * So the constant is MEASURED: a real segment is produced by
   * the real encoder and asked what PTS its first frame
   * carries.
   */
  it('maps to the PTS the encoder actually writes', async () => {
    await makeFilmWithCaptions('perf_caps', 'hash_caps', CUES);
    const channel = captioned('Clock TV', FILM);
    await saveChannel(channel);

    const index = segmentIndexAt(SHOWING);
    await produceSegment(channel, index,
      () => ({ durationMs: 30_000, audioStreams: 1 }));
    const picture = paths.channelSegment(channel.id, index);
    expect((await stat(picture)).size).toBeGreaterThan(1000);

    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-select_streams', 'v:0', '-show_entries', 'stream=start_pts',
      picture,
    ]);
    const streams = (JSON.parse(raw) as {
      streams?: { start_pts?: number }[] }).streams ?? [];
    expect(streams).toHaveLength(1);
    expect(streams[0]!.start_pts).toBe(SEGMENT_START_PTS);
  }, 180_000);
});
