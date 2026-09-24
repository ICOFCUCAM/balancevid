/**
 * A real song, decoded, and a take found on it.  [STUDIO-TWO §10, S-3, U-02]
 *
 * `align.test.ts` proves the arithmetic against arrays it built itself. This
 * proves the same claim through the actual decoder, on actual files, at the
 * wrong sample rate on purpose — because the gap between "the maths is right"
 * and "the feature works" is entirely in the plumbing between them.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { measureAlignment } from '../../src/domain/align.js';
import { HOUSE_SAMPLE_RATE, SYNC_TOLERANCE_SAMPLES, secondsToSamples } from '../../src/domain/time.js';
import { decodeToAnalysis, normaliseMaster, readAnalysis } from '../../src/render/audio.js';
import { FFMPEG } from '../../src/render/ffmpeg.js';

const run = promisify(execFile);
let dir: string;

/**
 * A click track at 44.1 kHz, which is the WRONG rate on purpose.
 *
 * A take recorded at 48 kHz against a master at 44.1 drifts by seven percent
 * — seventeen seconds over a four-minute song. Normalising at the door is
 * what stops that, and a test that used the right rate throughout would never
 * find out whether it happens.
 */
async function clickTrack(path: string, seconds: number, bpm: number): Promise<void> {
  await run(FFMPEG, [
    '-y',
    '-f', 'lavfi', '-i', `sine=frequency=880:duration=${seconds}:sample_rate=44100`,
    '-f', 'lavfi', '-i', `sine=frequency=110:duration=${seconds}:sample_rate=44100`,
    '-filter_complex',
    // A percussive click on every beat, over a quiet bed: transients are what
    // alignment lives on.
    `[0:a]atrim=0:${seconds},asetrate=44100,`
    + `tremolo=f=${bpm / 60}:d=1,volume=0.9[click];`
    + `[1:a]volume=0.1[bed];[click][bed]amix=inputs=2:duration=first[out]`,
    '-map', '[out]', '-ar', '44100', path,
  ]);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-master-'));
}, 60_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('a master track arrives and is normalised (U-02)', () => {
  it('is decoded to the house rate whatever it came in at', async () => {
    const source = join(dir, 'song.mp3');
    await clickTrack(source, 8, 120);

    const analysis = join(dir, 'song.f32');
    const samples = await decodeToAnalysis(source, analysis);

    // Eight seconds at the HOUSE rate, from a 44.1 kHz file. Two clocks that
    // disagree about what a second is cannot be aligned, only approximated.
    expect(samples).toBe(8 * HOUSE_SAMPLE_RATE);
    expect((await stat(analysis)).size).toBe(samples * 4);
  }, 60_000);

  it('and its length is the count that came out of the decoder', async () => {
    /*
     * Not the container's account of itself. The first version of this ran a
     * second ffmpeg pass and scraped the sample count out of the summary
     * line — a string whose units changed between releases and whose sample
     * format was not the one being assumed.
     */
    const source = join(dir, 'exact.mp3');
    await clickTrack(source, 3, 120);
    const samples = await decodeToAnalysis(source, join(dir, 'exact.f32'));
    expect(samples).toBe(3 * HOUSE_SAMPLE_RATE);
  }, 60_000);

  it('and the normalised master is playable media, not raw floats', async () => {
    const source = join(dir, 'song.mp3');
    const master = join(dir, 'master.webm');
    await normaliseMaster(source, master);
    expect((await stat(master)).size).toBeGreaterThan(1024);
  }, 60_000);
});

describe('a take is found on the song, through the real decoder', () => {
  it('to inside the tolerance a listener notices', async () => {
    /*
     * The claim stage two exists to make true. A take recorded in a room with
     * the song playing out loud is the song, delayed — so the delay is
     * recoverable, and this proves it survives encoding, decoding and
     * resampling rather than only surviving arithmetic.
     */
    const source = join(dir, 'song.mp3');
    const delaySeconds = 2.5;
    const takeFile = join(dir, 'take.m4a');
    await run(FFMPEG, [
      '-y', '-ss', String(delaySeconds), '-i', source,
      // Quieter and noisier, as a microphone across a room would hear it.
      '-af', 'volume=0.4', '-ar', '48000', '-ac', '1', takeFile,
    ]);

    const masterSamples = await readAnalysis(
      join(dir, 'song.f32'), 0, await decodeToAnalysis(source, join(dir, 'song.f32')));
    const takeCount = await decodeToAnalysis(takeFile, join(dir, 'take.f32'));
    const takeSamples = await readAnalysis(join(dir, 'take.f32'), 0, takeCount);

    const delay = secondsToSamples(delaySeconds);
    const found = measureAlignment(masterSamples, takeSamples, delay);

    expect(found.masterAudible).toBe(true);
    expect(Math.abs(found.offsetSamples - delay)).toBeLessThan(SYNC_TOLERANCE_SAMPLES);
  }, 120_000);

  it('even when the clock the browser reported was a quarter-second out', async () => {
    const masterSamples = await readAnalysis(join(dir, 'song.f32'));
    const takeSamples = await readAnalysis(join(dir, 'take.f32'));
    const delay = secondsToSamples(2.5);

    for (const error of [secondsToSamples(0.25), -secondsToSamples(0.25)]) {
      const found = measureAlignment(masterSamples, takeSamples, delay + error);
      expect(found.masterAudible).toBe(true);
      expect(Math.abs(found.offsetSamples - delay)).toBeLessThan(SYNC_TOLERANCE_SAMPLES);
    }
  }, 120_000);
});
