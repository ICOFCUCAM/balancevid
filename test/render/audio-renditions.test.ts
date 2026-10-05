/**
 * Alternate audio, made by real ffmpeg from real files.
 *   [Doctrine CHANNEL §7, §17, D-18, TV-NETWORK N-10]
 *
 * > *"i plan for multitrack audio which is wise to include so it
 * > would not complecate in feature. however subscribers would
 * > have to pay extra for this special feature"*
 *
 * THE DOMAIN TESTS PROVE THE PLAYLIST IS ARITHMETIC. This proves
 * the thing the playlist has been describing and nothing was
 * writing: that a second language reaches the disk, in the same
 * format as the picture's own track, swept on the same window.
 *
 * It is the only test that can catch the fault this stage is
 * about, because that fault is a FILE NOT APPEARING — and the
 * master playlist is careful enough to say nothing when it does
 * not, so every other test passes either way.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProgrammeSource } from '../../src/domain/channel.js';
import { newChannel, scheduleProgramme, setStation } from '../../src/domain/channelEdit.js';
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { SEGMENT_MS, segmentIndexAt, segmentStart } from '../../src/domain/playout.js';
import { ffmpeg, ffprobe } from '../../src/render/ffmpeg.js';
import { HOUSE } from '../../src/render/ingest.js';

const AT = '2026-09-25T09:00:00.000Z';
const MINUTE = 60_000;

/*
 * AN INSTANT THE FILM IS ACTUALLY ON.
 *
 * The first draft asked for a segment sixteen seconds in, and
 * the fixture film is eight seconds long: a thirty-minute slot
 * holding eight seconds of media is OFF AIR after eight
 * seconds, which is `playoutWindow` being right. Every test
 * here then exercised the silent branch and proved nothing
 * about the real one — the tests passed, and removing `-vn`
 * and the optional stream map from the encoder changed no
 * result. Found by mutation, which is the only thing that
 * could have found it.
 */
const SHOWING = Date.parse(AT) + SEGMENT_MS;

let root: string;
let produceRenditions: typeof import('../../src/playout/audioRendition.js').produceRenditions;
let alternatesOf: typeof import('../../src/playout/audioRendition.js').alternatesOf;
let paths: typeof import('../../src/store/paths.js').paths;
let saveChannel: typeof import('../../src/store/channels.js').saveChannel;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-audio-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ produceRenditions, alternatesOf } =
    await import('../../src/playout/audioRendition.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ saveChannel } = await import('../../src/store/channels.js'));
}, 120_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/**
 * A film with THREE audio streams, which is the case this whole
 * feature is for: one picture, three languages, as a
 * broadcaster's editor would deliver it.
 *
 * Three tones a test can tell apart, because *the French track
 * exists* and *the French track is the French one* are two
 * claims and only the second one matters.
 */
async function makeMultilingual(documentId: string, planHash: string): Promise<string> {
  /*
   * WHERE `pathFor` LOOKS, ASKED OF `pathFor`. The first draft
   * wrote these under `<var>/performances/…` and the engine
   * resolves `<var>/accounts/<account>/performances/…`, so every
   * read fell through to the off-air branch and four of this
   * file's claims were about silence. The tests passed and
   * proved nothing — found by mutation, where removing `-vn`
   * and the optional stream map changed no result. [D-06]
   */
  const dir = join(paths.performanceRenders(documentId), planHash);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'master.mp4');
  /*
   * AND THREE LEVELS, a step of twenty decibels apart — see
   * `levelOf`, which cannot read a pitch on this build. Loud,
   * quiet and quieter is a thing `volumedetect` can tell apart
   * at a glance, and it makes *which stream came out* a
   * measurement rather than an inference.
   */
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=660:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=8',
    '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:a',
    '-filter:a:1', 'volume=0.1',
    '-filter:a:2', 'volume=0.01',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', file,
  ]);
  return file;
}

/** A film with one audio stream, which is most media. */
async function makeOrdinary(documentId: string, planHash: string): Promise<string> {
  const dir = join(paths.performanceRenders(documentId), planHash);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'master.mp4');
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', file,
  ]);
  return file;
}

/**
 * HOW LOUD THAT SEGMENT IS, in dB RMS.
 *
 * THE ONLY MEASUREMENT THAT CAN TELL THE BRANCHES APART. Every
 * other claim in this file — a file appears, it is AAC at
 * 48 kHz, it carries no picture — is equally true of four
 * seconds of generated silence, which is exactly what the
 * encoder wrote while these tests passed. A rendition carrying
 * the WRONG language would pass all of them too, and *the
 * French track exists* and *the French track is the French
 * one* are two different claims.
 *
 * READ BY `ffprobe` AND NOT BY `ffmpeg`, WHICH IS C-24
 * ARRIVING IN A TEST.
 *
 * The pinned `ffmpeg-static` binary SEGFAULTS on any MPEG-TS
 * INPUT — audio-only or with a picture, from a file or a pipe,
 * even at `-c copy` — silently, with an empty stderr and a null
 * exit code. The product never noticed because nothing in it
 * reads a transport segment back: segments are written, served
 * and swept, and the two pieces of a segment that spans a
 * boundary are joined by APPENDING BYTES, which is the property
 * MPEG-TS was chosen for. The first thing that ever tried was
 * this test.
 *
 * `ffprobe-static` is a different binary and reads them
 * perfectly, so the measurement goes through its `lavfi` input:
 * `amovie` demuxes and decodes, `astats` reports, and the last
 * frame's reading is the whole file's. Which is also the
 * evidence that the segments are WELL FORMED — the fault is in
 * one binary, not in what this engine writes.
 *
 * LEVEL AND NOT PITCH, for the same reason: `bandpass` is in
 * the broken half. So the fixture's three streams carry three
 * distinct LEVELS as well as three tones.
 */
async function levelOf(file: string): Promise<number> {
  const said = await ffprobe([
    '-v', 'error',
    '-f', 'lavfi',
    /* lavfi reads its graph as one string, where `:` and `\`
       separate and escape. A temporary directory has neither,
       and a test that silently measured the wrong file would
       be worse than one that throws. */
    '-i', `amovie=${file},astats=metadata=1:reset=0`,
    '-show_entries', 'frame_tags=lavfi.astats.Overall.RMS_level',
    '-of', 'default=nw=1:nk=1',
  ]);
  const frames = said.trim().split('\n').filter((one) => one !== '');
  const last = frames[frames.length - 1];
  /* No frames at all is silence, and silence is a real answer. */
  return last === undefined || last === '-inf' ? -120 : Number(last);
}

async function channelShowing(
  name: string, source: ProgrammeSource,
  audio: { language: string; default?: boolean }[],
  startsAt = AT,
) {
  const channel = newChannel(name, 'UTC', AT);
  setStation(channel, { audio }, [], { multiAudio: true });
  scheduleProgramme(channel, {
    startsAt, durationMs: 30 * MINUTE, source, title: 'The Film',
  }, AT);
  await saveChannel(channel);
  return channel;
}

/** How long a produced segment actually runs, measured. */
async function secondsOf(file: string): Promise<number> {
  const raw = await ffprobe([
    '-v', 'error', '-print_format', 'json',
    '-show_entries', 'format=duration', file,
  ]);
  return Number((JSON.parse(raw) as { format?: { duration?: string } })
    .format?.duration ?? 0);
}

describe('which streams are alternates (N-10)', () => {
  /*
   * THE FIRST ENTRY IS NEVER ONE. It is the track muxed into the
   * picture, which the master playlist describes with no `URI` —
   * the whole reason a channel gains languages without a second
   * video encode. Writing it again would be the same audio on
   * the disk twice and in the playlist twice.
   */
  it('leaves out the track the picture already carries', async () => {
    const channel = await channelShowing('A', {
      kind: 'render', document: 'performance', documentId: 'x', planHash: 'y',
    }, [{ language: 'en', default: true }, { language: 'fr' }, { language: 'es' }]);
    expect(alternatesOf(channel)).toEqual([
      { language: 'fr', stream: 1 }, { language: 'es', stream: 2 },
    ]);
  });

  it('follows the station’s own mark, not the order', async () => {
    const channel = await channelShowing('B', {
      kind: 'render', document: 'performance', documentId: 'x', planHash: 'y',
    }, [{ language: 'en' }, { language: 'fr', default: true }]);
    expect(alternatesOf(channel)).toEqual([{ language: 'en', stream: 0 }]);
  });

  /* One language is not a choice, and writing a rendition for it
     would be the picture's own audio on the disk twice. */
  it('has nothing to write for a channel with one language', async () => {
    const channel = await channelShowing('C', {
      kind: 'render', document: 'performance', documentId: 'x', planHash: 'y',
    }, [{ language: 'en', default: true }]);
    expect(alternatesOf(channel)).toEqual([]);
  });
});

describe('the bytes reach the disk (N-10, §7)', () => {
  it('writes a segment per alternate language, and none for the default',
    async () => {
      const path = await makeMultilingual('perf_many', 'hash_many');
      const channel = await channelShowing('World TV', {
        kind: 'render', document: 'performance', documentId: 'perf_many',
        planHash: 'hash_many',
      }, [{ language: 'en', default: true }, { language: 'fr' }]);

      const index = segmentIndexAt(SHOWING);
      const made = await produceRenditions(channel, index,
        () => ({ durationMs: 8000, audioStreams: 3 }));
      expect(made).toEqual(['fr']);

      const wrote = await stat(
        paths.channelAudioSegment(channel.id, 'fr', index));
      expect(wrote.size).toBeGreaterThan(512);
      /* The default's own directory is never made. */
      await expect(stat(paths.channelAudio(channel.id, 'en'))).rejects.toThrow();
      expect(path).toBeTruthy();
    }, 120_000);

  /*
   * THE FRENCH TRACK IS THE FRENCH ONE.  [N-10, §17]
   *
   * The fixture carries three tones so this can be asked: 220 Hz
   * on the track the picture already has, 660 on the second,
   * 1320 on the third. A rendition that mapped stream 0 would
   * be the default audio written twice; one that mapped nothing
   * would be silence with a language label on it. Both pass
   * every other test in this file.
   */
  it('carries the language it is named after, and not the default',
    async () => {
      await makeMultilingual('perf_tone', 'hash_tone');
      const channel = await channelShowing('Tone TV', {
        kind: 'render', document: 'performance', documentId: 'perf_tone',
        planHash: 'hash_tone',
      }, [
        { language: 'en', default: true },
        { language: 'fr' },
        { language: 'es' },
      ]);

      const index = segmentIndexAt(SHOWING);
      expect(await produceRenditions(channel, index,
        () => ({ durationMs: 8000, audioStreams: 3 }))).toEqual(['fr', 'es']);

      const fr = await levelOf(
        paths.channelAudioSegment(channel.id, 'fr', index));
      const es = await levelOf(
        paths.channelAudioSegment(channel.id, 'es', index));

      /*
       * THE SECOND STREAM, which the fixture made twenty
       * decibels quieter than the first. A rendition that
       * mapped stream 0 would read around −24, and one that
       * wrote silence would read the floor.
       */
      expect(fr).toBeLessThan(-34);
      expect(fr).toBeGreaterThan(-54);

      /*
       * AND THE THIRD IS THE THIRD, which is what makes this a
       * test of the MAPPING rather than of the loop: two
       * renditions written from one stream would read the
       * same.
       */
      expect(es).toBeLessThan(fr - 10);
      expect(es).toBeGreaterThan(-80);
    }, 120_000);

  /*
   * LOWER CASE ON THE DISK, WHATEVER THE BROADCASTER TYPED.
   *
   * The route that serves a rendition folds the language before
   * it looks, so a station that typed `FR` and an engine that
   * wrote `audio/FR/` would be a 404 per segment, four seconds
   * apart, behind a picker that offers the language.
   *
   * ASSERTED END TO END BECAUSE IT IS OWNED AT THE OTHER END.
   * `setStation` folds the tag on the way in and `alternatesOf`
   * deliberately does not fold it again, so this is the test
   * that catches a change at EITHER place — which is what makes
   * it worth writing where a second `.toLowerCase()` was not
   * worth keeping. [D-19]
   */
  it('folds the language for the disk, as the route folds it to read',
    async () => {
      await makeMultilingual('perf_case', 'hash_case');
      const channel = await channelShowing('Case TV', {
        kind: 'render', document: 'performance', documentId: 'perf_case',
        planHash: 'hash_case',
      }, [{ language: 'EN', default: true }, { language: 'FR' }]);

      const index = segmentIndexAt(SHOWING);
      expect(await produceRenditions(channel, index,
        () => ({ durationMs: 8000, audioStreams: 3 }))).toEqual(['fr']);
      expect(await readdir(paths.channelAudioRoot(channel.id))).toEqual(['fr']);
      await expect(stat(
        paths.channelAudioSegment(channel.id, 'fr', index))).resolves.toBeTruthy();
    }, 120_000);

  /*
   * SAME CODEC, SAME RATE, SAME CHANNEL COUNT AS THE PICTURE'S
   * OWN TRACK. A player switching language mid-programme
   * reconfigures its audio pipeline if any of the three differs,
   * which is an audible gap at the moment somebody is deciding
   * whether this feature works.
   */
  it('is the house format, so a switch is not a gap', async () => {
    await makeMultilingual('perf_fmt', 'hash_fmt');
    const channel = await channelShowing('Format TV', {
      kind: 'render', document: 'performance', documentId: 'perf_fmt',
      planHash: 'hash_fmt',
    }, [{ language: 'en', default: true }, { language: 'fr' }]);

    const index = segmentIndexAt(SHOWING);
    await produceRenditions(channel, index,
      () => ({ durationMs: 8000, audioStreams: 3 }));

    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'stream=codec_type,codec_name,sample_rate,channels',
      paths.channelAudioSegment(channel.id, 'fr', index),
    ]);
    const streams = (JSON.parse(raw) as { streams?: { codec_type?: string;
      codec_name?: string; sample_rate?: string; channels?: number }[] })
      .streams ?? [];
    const sound = streams.filter((one) => one.codec_type === 'audio');
    expect(sound).toHaveLength(1);
    expect(sound[0]!.codec_name).toBe('aac');
    expect(Number(sound[0]!.sample_rate)).toBe(HOUSE.audioSampleRate);
    expect(sound[0]!.channels).toBe(HOUSE.audioChannels);
    /*
     * AND NO PICTURE. A second video stream would be the second
     * encode this whole design exists to avoid — and on a
     * machine keeping up with real time it is the difference
     * between a channel that stays ahead and one that does not.
     */
    expect(streams.filter((one) => one.codec_type === 'video')).toHaveLength(0);
  }, 120_000);

  /*
   * A SOURCE WITHOUT THAT STREAM GETS SILENCE, NOT A HOLE. A
   * channel carrying three languages will schedule media that
   * has one, because most media has one. The alternatives are a
   * segment that 404s — which stalls a player on the rendition
   * it chose — or four seconds of quiet, which is TRUE: the
   * broadcaster scheduled something with no French on it.
   */
  it('writes quiet rather than nothing when the media has one track',
    async () => {
      await makeOrdinary('perf_one', 'hash_one');
      const channel = await channelShowing('Mono TV', {
        kind: 'render', document: 'performance', documentId: 'perf_one',
        planHash: 'hash_one',
      }, [{ language: 'en', default: true }, { language: 'fr' }]);

      const index = segmentIndexAt(SHOWING);
      /*
       * ONE STREAM, WHICH IS WHAT THE PROBE WOULD HAVE
       * MEASURED. The encoder asks the measurement whether the
       * second stream is there rather than asking ffmpeg to
       * fail gracefully — because it does not: `-map 0:a:1?`
       * beside an infinite `anullsrc` and `-shortest` has
       * nothing finite to be short of, and the encode never
       * returns at all.
       */
      const made = await produceRenditions(channel, index,
        () => ({ durationMs: 8000, audioStreams: 1 }));
      expect(made).toEqual(['fr']);
      const wrote = await stat(
        paths.channelAudioSegment(channel.id, 'fr', index));
      expect(wrote.size).toBeGreaterThan(512);
    }, 120_000);

  /*
   * ONE LANGUAGE'S FAILURE DOES NOT TAKE THE OTHERS.  [U-19]
   *
   * A language whose encode fails is a language with a missing
   * segment for four seconds, which a player rides out by
   * holding the last one; stopping at the first failure would
   * lose every language including the ones that worked, and
   * would do it silently, four seconds at a time, for as long
   * as the cause lasted.
   *
   * THE CAUSE HERE IS A FILE WHERE A DIRECTORY SHOULD BE, which
   * is what a half-deleted rendition directory or an operator's
   * stray copy looks like on disk: `mkdir` fails with ENOTDIR
   * for that language and no other.
   */
  it('loses one language to a bad disk and still writes the rest', async () => {
    await makeMultilingual('perf_half', 'hash_half');
    const channel = await channelShowing('Half TV', {
      kind: 'render', document: 'performance', documentId: 'perf_half',
      planHash: 'hash_half',
    }, [
      { language: 'en', default: true },
      { language: 'fr' },
      { language: 'es' },
    ]);

    /* A plain file standing exactly where `es/` has to be made. */
    await mkdir(paths.channelAudioRoot(channel.id), { recursive: true });
    await writeFile(paths.channelAudio(channel.id, 'es'), 'not a directory');

    const index = segmentIndexAt(SHOWING);
    const made = await produceRenditions(channel, index,
      () => ({ durationMs: 8000, audioStreams: 3 }));
    expect(made).toEqual(['fr']);
    await expect(stat(
      paths.channelAudioSegment(channel.id, 'fr', index))).resolves.toBeTruthy();
  }, 120_000);

  /*
   * A STILL HAS NO SOUND, IN ANY LANGUAGE.  [§3]
   *
   * The picture branch holds one frame for the slot — a station
   * ident, a caption card, a deck page. There is nothing to
   * hold here, so the slot is quiet, which is also what the
   * track muxed into the picture is doing underneath it. An
   * encoder that reached for `0:a:1` on a PNG would fail the
   * language for as long as the card was up.
   */
  it('writes quiet for a still, in every language', async () => {
    const asset = 'asset_card_000000001';
    await mkdir(paths.library(), { recursive: true });
    await ffmpeg([
      '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180:d=1',
      '-frames:v', '1', paths.libraryMedia(asset, 'png'),
    ]);

    const channel = await channelShowing('Card TV', {
      kind: 'media', assetId: asset, form: 'image',
    }, [{ language: 'en', default: true }, { language: 'fr' }]);

    const index = segmentIndexAt(SHOWING);
    const made = await produceRenditions(channel, index,
      () => ({ durationMs: 8000, audioStreams: 3 }));
    expect(made).toEqual(['fr']);

    const file = paths.channelAudioSegment(channel.id, 'fr', index);
    expect((await stat(file)).size).toBeGreaterThan(512);
    /* Quiet, and not the first tone of a film that is not on. */
    expect(await levelOf(file)).toBeLessThan(-80);
  }, 120_000);

  /*
   * A SEGMENT THAT STRADDLES A BOUNDARY IS TWO PIECES AND ONE
   * FILE.  [§7]
   *
   * Programmes do not begin on four-second multiples of the
   * epoch, so a channel's segments cross boundaries constantly —
   * it is why the wire is MPEG-TS at all, a container that can
   * be cut anywhere and rejoined by appending. The rendition is
   * written the same way, and a join that was dropped would put
   * two seconds of French on a four-second grid: the player
   * would run out of audio before the picture ended, every time
   * a programme changed.
   *
   * THE FILM IS DELIBERATELY OFF THE GRID. It starts two
   * seconds into a segment and runs eight, so it ends two
   * seconds into the one asked for here — half film, half dead
   * air.
   */
  it('joins the pieces of a segment that crosses a boundary', async () => {
    await makeMultilingual('perf_edge', 'hash_edge');
    const begins = segmentStart(segmentIndexAt(Date.parse(AT))) + 2000;
    const channel = await channelShowing('Edge TV', {
      kind: 'render', document: 'performance', documentId: 'perf_edge',
      planHash: 'hash_edge',
    }, [{ language: 'en', default: true }, { language: 'fr' }],
    new Date(begins).toISOString());

    /* Eight seconds of film from `begins` ends two seconds into
       the second segment after it. */
    const index = segmentIndexAt(begins) + 2;
    const made = await produceRenditions(channel, index,
      () => ({ durationMs: 8000, audioStreams: 3 }));
    expect(made).toEqual(['fr']);

    const file = paths.channelAudioSegment(channel.id, 'fr', index);
    const seconds = await secondsOf(file);
    /* Four seconds, give or take a frame at each end — not the
       two the film had left. */
    expect(seconds).toBeGreaterThan(SEGMENT_MS / 1000 - 0.5);
    expect(seconds).toBeLessThan(SEGMENT_MS / 1000 + 0.5);
  }, 120_000);

  /* A channel off air has nothing on in any language, and still
     has to put four seconds on the wire for the ones who chose
     one. [U-19] */
  it('writes quiet for a channel that is off air', async () => {
    const channel = newChannel('Quiet TV', 'UTC', AT);
    setStation(channel, { audio: [
      { language: 'en', default: true }, { language: 'fr' },
    ] }, [], { multiAudio: true });
    await saveChannel(channel);

    const index = segmentIndexAt(SHOWING);
    const made = await produceRenditions(channel, index, () => undefined);
    expect(made).toEqual(['fr']);
    const wrote = await stat(
      paths.channelAudioSegment(channel.id, 'fr', index));
    expect(wrote.size).toBeGreaterThan(512);
  }, 120_000);

  /* Nothing at all for a channel that declared one language:
     no directory, no files, no work done. [D-18] */
  it('writes nothing whatever for a single-language channel', async () => {
    const channel = await channelShowing('Plain TV', {
      kind: 'render', document: 'performance', documentId: 'perf_one',
      planHash: 'hash_one',
    }, [{ language: 'en', default: true }]);
    const index = segmentIndexAt(SHOWING);
    expect(await produceRenditions(channel, index, () => undefined)).toEqual([]);
    await expect(readdir(paths.channelAudioRoot(channel.id))).rejects.toThrow();
  }, 120_000);
});
