/**
 * Does the cleanup actually clean anything.
 * [MASTER-EDIT §8, §12 P2; Doctrine INV-02, INV-11, U-18]
 *
 * `test/domain/cleanup.test.ts` proves the table and the plan against
 * strings. This proves the SOUND: a recording with a fan in it, run through
 * each row, measured. It exists because a denoiser is the easiest feature in
 * this product to ship broken — the filter graph is accepted, the render
 * succeeds, the file plays, and the fan is still there. Nothing short of
 * measuring the output can tell you which of those happened.
 *
 * AND BECAUSE LENGTH IS THE REAL RISK. Every stage here is supposed to be
 * sample-count preserving. One that is not moves every cut after it, which
 * presents as a video that drifts out of sync near the end — the hardest
 * class of bug in this product to trace back to an audio setting. So the
 * length is asserted for every row, to the sample.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CLEANUPS, LENGTH_PRESERVING, cleanupFor } from '../../src/domain/cleanup.js';
import type { AssetId, TakeId } from '../../src/domain/document.js';
import type { AudioPiece } from '../../src/domain/performanceAudio.js';
import { ffmpeg, ffmpegCapture, ffprobe } from '../../src/render/ffmpeg.js';
import { mixGraph, mixPerformanceAudio } from '../../src/render/mix.js';

let dir: string;
/** A voice-ish tone with a steady low fan under it and hiss on top. */
let noisy: string;
/** A silent master, so a mix measures the take and only the take. */
let silence: string;

const SECONDS = 4;
const RATE = 48_000;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-cleanup-'));
  noisy = join(dir, 'noisy.wav');
  /*
   * THREE THINGS, SO THE MEASUREMENTS CAN TELL THEM APART: a 440 Hz tone
   * standing in for the voice, a 50 Hz rumble standing in for handling and
   * mains, and white noise standing in for a fan. A test built on one of
   * them could not distinguish "removed the noise" from "removed
   * everything", which is the failure worth catching.
   */
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${SECONDS}:sample_rate=${RATE}`,
    '-f', 'lavfi', '-i', `sine=frequency=50:duration=${SECONDS}:sample_rate=${RATE}`,
    '-f', 'lavfi', '-i', `anoisesrc=d=${SECONDS}:c=white:a=0.06:r=${RATE}`,
    '-filter_complex',
    '[0:a]volume=0.5[v];[1:a]volume=0.4[r];[v][r][2:a]amix=inputs=3:normalize=0[out]',
    '-map', '[out]', '-ac', '1', '-ar', String(RATE), noisy,
  ]);
  silence = join(dir, 'silence.wav');
  await ffmpeg([
    '-y', '-f', 'lavfi',
    '-i', `anullsrc=r=${RATE}:cl=stereo:d=${SECONDS}`, silence,
  ]);
}, 180_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/** Energy in a band, as `volumedetect`'s mean volume in dB. */
async function bandEnergy(
  path: string, filter: string,
): Promise<number> {
  const { stderr } = await ffmpegCapture([
    '-i', path, '-af', `${filter},volumedetect`, '-f', 'null', '-',
  ]);
  const found = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  if (!found) throw new Error(`no mean_volume in:\n${stderr.slice(-400)}`);
  return Number(found[1]);
}

async function samples(path: string): Promise<number> {
  /*
   * `duration_ts` alone, and by key. The first draft asked for
   * `duration_ts,sample_rate` and took the first line — which ffprobe
   * prints in ITS order, not the order they were asked for, so the test
   * compared the sample rate against the sample count and failed for a
   * reason that had nothing to do with the cleanup.
   */
  const out = await ffprobe([
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=duration_ts',
    '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ]);
  return Number(out.trim());
}

/** Run one cleanup row over the noisy file and return the result's path. */
async function clean(id: string): Promise<string> {
  const row = cleanupFor(id);
  if (!row) throw new Error(`no cleanup row ${id}`);
  const out = join(dir, `${id}.wav`);
  await ffmpeg(['-y', '-i', noisy, '-af', row.stages.join(','), out]);
  return out;
}

describe('the table itself', () => {
  /*
   * THE GUARD BEHIND "NO ROW CHANGES THE LENGTH", asked of the table rather
   * than of a render, so a row added tomorrow with `atempo` in it fails here
   * — in a test that runs in milliseconds — rather than in somebody's
   * export.
   */
  it('emits only filters that preserve the sample count', () => {
    for (const row of Object.values(CLEANUPS)) {
      for (const stage of row.stages) {
        const name = stage.split('=')[0]!;
        expect(LENGTH_PRESERVING, `${row.id} uses ${name}`).toContain(name);
      }
    }
  });

  it('starts every row with the one stage that cannot hurt', () => {
    for (const row of Object.values(CLEANUPS)) {
      expect(row.stages[0], row.id).toMatch(/^highpass=/);
    }
  });

  it('says none is none rather than a row called none', () => {
    expect(cleanupFor(undefined)).toBeUndefined();
    expect(cleanupFor('none')).toBeUndefined();
    expect(cleanupFor('nonsense')).toBeUndefined();
    expect(cleanupFor('room')?.id).toBe('room');
  });
});

describe('what each row does to a recording with a fan in it', () => {
  /*
   * THE MEASUREMENT THAT MATTERS, and the one a filter graph being accepted
   * does not give you. Below 90 Hz there is nothing a voice needs, and every
   * row is supposed to empty it.
   */
  /**
   * How far the rumble sits BELOW the voice, in dB.
   *
   * A RATIO AND NOT A LEVEL, and this is the second time the same mistake
   * was made writing this file. Two of the four rows normalise, which puts
   * the whole recording back up — so measured as absolute energy, `voice`
   * came out four decibels LOUDER at fifty hertz than the recording it
   * cleaned, and the test called the high-pass broken. It is not: the
   * rumble is thirteen decibels further down relative to the voice, which
   * is what "took the rumble out" actually means to somebody listening.
   */
  async function rumbleBelowVoice(path: string): Promise<number> {
    const rumble = await bandEnergy(path, 'bandpass=f=50:width_type=h:w=15');
    const voice = await bandEnergy(path, 'bandpass=f=440:width_type=h:w=60');
    return voice - rumble;
  }

  it('takes the rumble out, in every row', async () => {
    const before = await rumbleBelowVoice(noisy);
    for (const id of Object.keys(CLEANUPS)) {
      const after = await rumbleBelowVoice(await clean(id));
      expect(after, `${id}: ${before} below -> ${after} below`)
        .toBeGreaterThan(before + 8);
    }
  }, 240_000);

  /*
   * AND LEAVES THE VOICE WHERE IT WAS. A denoiser that quietens everything
   * passes the test above and is useless, so this is the other half: the
   * band the tone is in must survive.
   */
  it('leaves the voice band standing', async () => {
    const before = await bandEnergy(noisy, 'bandpass=f=440:width_type=h:w=60');
    for (const id of ['rumble', 'room'] as const) {
      const after = await bandEnergy(await clean(id), 'bandpass=f=440:width_type=h:w=60');
      expect(after, `${id}: ${before} -> ${after}`).toBeGreaterThan(before - 6);
    }
  }, 240_000);

  /*
   * THE DENOISING ROWS DO SOMETHING THE SAFE ONE DOES NOT, above the voice,
   * where the hiss is. Without this, `room` could be `rumble` with a longer
   * filter string and every other test here would still pass.
   */
  it('takes hiss out where only the denoising rows claim to', async () => {
    const hiss = 'highpass=f=6000';
    const safe = await bandEnergy(await clean('rumble'), hiss);
    const room = await bandEnergy(await clean('room'), hiss);
    expect(room, `rumble ${safe} -> room ${room}`).toBeLessThan(safe - 2);
  }, 240_000);

  /*
   * HEAVY IS COMPARED WITH VOICE AND NOT WITH ROOM, and the first draft got
   * that wrong in a way worth keeping. Heavy denoises harder than room AND
   * normalises, and the normalisation puts the level back up: measured
   * against room, heavy came out nine decibels LOUDER above six kilohertz
   * and the test called the denoiser broken. Voice is heavy's fair
   * comparison because the only thing that differs between them is how hard
   * the denoiser is set.
   */
  it('is the denoiser and not the level that makes heavy heavy', async () => {
    const hiss = 'highpass=f=6000';
    const voice = await bandEnergy(await clean('voice'), hiss);
    const heavy = await bandEnergy(await clean('heavy'), hiss);
    expect(heavy, `voice ${voice} -> heavy ${heavy}`).toBeLessThan(voice - 4);
  }, 240_000);

  /*
   * INV-02, ASKED OF THE SOUND. To the sample, for every row: a cleanup
   * that shortened a take by a few hundred samples would put every cut
   * after it out of place, and it would present as drift rather than as a
   * denoiser bug.
   */
  it('does not change the length by one sample', async () => {
    const before = await samples(noisy);
    expect(before).toBe(SECONDS * RATE);
    for (const id of Object.keys(CLEANUPS)) {
      expect(await samples(await clean(id)), id).toBe(before);
    }
  }, 240_000);
});

/*
 * AND THE MIXER ACTUALLY APPLIES IT.
 *
 * THIS TEST EXISTS BECAUSE ITS ABSENCE WAS FOUND BY MUTATION. Deleting the
 * one line in `mix.ts` that reaches for the cleanup — disconnecting the
 * feature entirely at its last step — left every other test in this file
 * and its domain twin passing. They proved the table was right and the plan
 * carried it; nothing asked whether the thing that renders the sound had
 * been told. That is the cheapest way to ship a control that does nothing.
 */
describe('the mixer, and not the filter string', () => {
  it('cleans a take it was given a cleanup for', async () => {
    const piece = (cleanup?: string): AudioPiece => ({
      kind: 'take',
      takeId: 'take_1' as TakeId,
      assetId: 'asset_1' as AssetId,
      fromSample: 0,
      toSample: SECONDS * RATE,
      mediaFromSample: 0,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      ...(cleanup ? { cleanup } : {}),
    });

    const mix = async (cleanup?: string) => mixPerformanceAudio({
      pieces: [piece(cleanup)],
      /* A silent master, so what is measured is the take and only the take. */
      masterAudioPath: silence,
      resolveAsset: () => noisy,
      totalSamples: SECONDS * RATE,
      workDir: dir,
      planHash: cleanup ?? 'plain',
    });

    const RUMBLE = 'bandpass=f=50:width_type=h:w=15';
    const plain = await bandEnergy(await mix(), RUMBLE);
    const cleaned = await bandEnergy(await mix('room'), RUMBLE);
    expect(cleaned, `plain ${plain} -> cleaned ${cleaned}`)
      .toBeLessThan(plain - 8);
  }, 240_000);

  /* And the song is not touched, whatever a piece claims. */
  it('has nothing to apply to a master piece', async () => {
    const graph = mixGraph(
      [{
        kind: 'master', fromSample: 0, toSample: SECONDS * RATE,
        mediaFromSample: 0, fadeInSamples: 0, fadeOutSamples: 0,
      }],
      () => 0, SECONDS * RATE,
    );
    expect(graph).not.toContain('afftdn');
    expect(graph).not.toContain('speechnorm');
  });
});
