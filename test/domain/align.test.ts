/**
 * Where a take really sits.  [Doctrine STUDIO-TWO §10, S-3, INV-14]
 *
 * Every test here builds its own signals, so the right answer is known to the
 * sample before the measurement runs. That is the only way to test a
 * measurement: a recording somebody made once can tell you the answer changed,
 * never that it is wrong.
 *
 * The property being defended is not "the code returns a number". It is that
 * the number is inside the tolerance a listener notices — twenty milliseconds
 * — and that when the method's precondition is absent, it says so instead of
 * returning a confident answer about noise.
 */
import { describe, expect, it } from 'vitest';

import {
  MASTER_AUDIBLE_THRESHOLD,
  bestLag, measureAlignment, measureRoundTrip, onsetEnvelope,
} from '../../src/domain/align.js';
import { HOUSE_SAMPLE_RATE, SYNC_TOLERANCE_SAMPLES, secondsToSamples } from '../../src/domain/time.js';

/** Deterministic noise, so a failing run can be re-run. */
function noise(length: number, level: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    out[i] = ((state / 0xffffffff) * 2 - 1) * level;
  }
  return out;
}

/**
 * A song: a click track with a tone under it.
 *
 * Clicks because alignment lives on transients, and a tone because a signal
 * of nothing but clicks is a friendlier problem than any real music.
 */
function song(seconds: number, bpm = 120, seed = 7): Float32Array {
  const length = secondsToSamples(seconds);
  const out = noise(length, 0.02, seed);
  const beat = Math.round((60 / bpm) * HOUSE_SAMPLE_RATE);
  for (let i = 0; i < length; i += 1) {
    // A quiet bed, so the signal is not only transients.
    out[i] = (out[i] ?? 0) + 0.05 * Math.sin((2 * Math.PI * 220 * i) / HOUSE_SAMPLE_RATE);
  }
  for (let b = 0; b * beat < length; b += 1) {
    const at = b * beat;
    // A short percussive decay, which is what an onset envelope is built for.
    for (let i = 0; i < 400 && at + i < length; i += 1) {
      out[at + i] = (out[at + i] ?? 0) + Math.exp(-i / 60) * (b % 4 === 0 ? 0.9 : 0.5);
    }
  }
  return out;
}

/**
 * A person singing along: onsets on the beat, and nothing else shared.
 *
 * The honest headphone fixture. A performer IS in time with the song — that
 * is the whole idea — so their envelope agrees with it partially, and a
 * threshold chosen without this fixture would treat that partial agreement as
 * an alignment.
 */
function singing(seconds: number, bpm = 120, seed = 4242): Float32Array {
  const length = secondsToSamples(seconds);
  const out = noise(length, 0.03, seed);
  const beat = Math.round((60 / bpm) * HOUSE_SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const b = Math.floor(i / beat);
    phase += (2 * Math.PI * (180 + (b % 5) * 40)) / HOUSE_SAMPLE_RATE;
    const into = (i % beat) / beat;
    out[i] = (out[i] ?? 0)
      + Math.sin(phase) * Math.min(1, into * 8) * Math.exp(-into * 1.5) * 0.5;
  }
  return out;
}

/** The same room, heard by a second device: delayed, quieter, noisier. */
function heardThrough(
  source: Float32Array, delaySamples: number, gain: number, addedNoise: number,
): Float32Array {
  const out = noise(source.length, addedNoise, 99);
  for (let i = 0; i < source.length; i += 1) {
    const from = i + delaySamples;
    if (from >= 0 && from < source.length) {
      out[i] = (out[i] ?? 0) + (source[from] ?? 0) * gain;
    }
  }
  return out;
}

describe('the onset envelope keeps the rhythm and throws away the rest', () => {
  it('is one value per millisecond', () => {
    const envelope = onsetEnvelope(song(2));
    expect(envelope.length).toBe(2000);
  });

  it('and survives a change of level, which is the point', () => {
    /*
     * Two recordings of one room at different gains have different loudness
     * and the same transients. An envelope that did not survive that would
     * align nothing.
     */
    const loud = song(4);
    const quiet = new Float32Array(loud.length);
    for (let i = 0; i < loud.length; i += 1) quiet[i] = (loud[i] ?? 0) * 0.1;

    const a = onsetEnvelope(loud);
    const b = onsetEnvelope(quiet);
    expect(bestLag(a, b, 50).lag).toBe(0);
    expect(bestLag(a, b, 50).correlation).toBeGreaterThan(0.95);
  });
});

describe('a take with the master leaking into it (S-3)', () => {
  const master = song(20);

  const recovered = (delaySeconds: number, hintError = 0) => {
    const delay = secondsToSamples(Math.abs(delaySeconds));
    // The take begins `delay` into the song, so its own audio is the master
    // from that point on — which is what a microphone in the room hears.
    const take = heardThrough(master, delay, 0.5, 0.05).slice(0, secondsToSamples(6));
    return measureAlignment(master, take, delay + hintError);
  };

  it('is found to the sample the measurement claims', () => {
    const delay = secondsToSamples(3);
    const take = heardThrough(master, delay, 0.5, 0.05).slice(0, secondsToSamples(6));
    const found = measureAlignment(master, take, delay);
    expect(found.masterAudible).toBe(true);
    expect(Math.abs(found.offsetSamples - delay)).toBeLessThan(SYNC_TOLERANCE_SAMPLES);
  });

  it('even when the clock the browser reported was wrong', () => {
    /*
     * The whole reason this exists. The offset recorded at capture is an
     * estimate; this is the check on it. A quarter of a second out is a
     * realistic browser error and is nine frames of video.
     */
    const found = recovered(3, secondsToSamples(0.25));
    const delay = secondsToSamples(3);
    expect(found.masterAudible).toBe(true);
    expect(Math.abs(found.offsetSamples - delay)).toBeLessThan(SYNC_TOLERANCE_SAMPLES);
  });

  it('and in the other direction too', () => {
    /*
     * The direction the first version could not find at all. The master slice
     * began a search-width BEFORE the hint and the search then ran ±width from
     * there, which put the whole window earlier than the hint: a take that
     * started later than the browser reported was never looked for, and the
     * measurement settled confidently on the nearest earlier beat — a full
     * second out, on a 120bpm click track.
     */
    const found = recovered(3, -secondsToSamples(0.25));
    expect(found.masterAudible).toBe(true);
    expect(Math.abs(found.offsetSamples - secondsToSamples(3)))
      .toBeLessThan(SYNC_TOLERANCE_SAMPLES);
  });

  it('within the tolerance a listener notices, not merely nearby', () => {
    // Twenty milliseconds. A measurement that is only ever within a tenth of
    // a second leaves nothing for every other error in the chain.
    for (const at of [1, 4, 7.5, 11]) {
      const delay = secondsToSamples(at);
      const take = heardThrough(master, delay, 0.4, 0.06).slice(0, secondsToSamples(5));
      const found = measureAlignment(master, take, delay + 2000);
      expect(Math.abs(found.offsetSamples - delay)).toBeLessThan(SYNC_TOLERANCE_SAMPLES);
    }
  });
});

describe('what the measurement refuses to guess (S-3)', () => {
  const master = song(20);

  it('headphones leave nothing to correlate, and it says so', () => {
    /*
     * THE HONEST CASE, and the normal one. §10 tells the performer to wear
     * headphones; with headphones the master is not in the microphone, and a
     * correlation against a signal that is not there is noise. Reporting
     * `masterAudible: false` means "use the clock you measured at capture",
     * not "something went wrong".
     */
    const found = measureAlignment(master, singing(6, 120), secondsToSamples(3));
    expect(found.masterAudible).toBe(false);
    expect(found.correlation).toBeLessThan(MASTER_AUDIBLE_THRESHOLD);
  });

  it('even though a performer in time DOES partly agree with the song', () => {
    /*
     * The subtlety the thresholds had to be measured rather than guessed for.
     * A singer is in time with the track — that is the point — so their onset
     * envelope agrees with it. Partial agreement is not alignment, and the
     * first version of this treated it as though it were.
     */
    const found = measureAlignment(master, singing(6, 120), secondsToSamples(3));
    expect(found.correlation).toBeGreaterThan(0.1);
    expect(found.correlation).toBeLessThan(0.4);
  });

  it('and hands the hint straight back rather than a number that looks measured', () => {
    const hint = secondsToSamples(3) + 5000;
    const found = measureAlignment(master, singing(6, 120), hint);
    expect(found.masterAudible).toBe(false);
    expect(found.offsetSamples).toBe(hint);
  });

  it('a different song entirely is refused, though it scores above nothing', () => {
    // 0.26 on synthetic ground truth, with the offset 55ms wrong — which is
    // nearly three times the tolerance a listener notices. This is the case
    // that killed the idea of a middle band.
    const other = song(6, 97, 4242);
    const found = measureAlignment(master, other, secondsToSamples(3));
    expect(found.masterAudible).toBe(false);
  });

  it('nor does it answer about a take longer than the song it is given', () => {
    const found = measureAlignment(new Float32Array(10), song(2), 0);
    expect(found.masterAudible).toBe(false);
  });
});

describe('leakage is the same measurement, read the other way (§10)', () => {
  const master = song(20);

  it('the master coming out of speakers is detected', () => {
    /*
     * A finished video carrying the backing track twice, a few milliseconds
     * apart, has a phasing artefact nobody can remove afterwards. Worth
     * interrupting somebody about before they record another four takes.
     */
    const delay = secondsToSamples(2);
    const bleeding = heardThrough(master, delay, 0.6, 0.05).slice(0, secondsToSamples(6));
    expect(measureAlignment(master, bleeding, delay).masterAudible).toBe(true);
  });

  it('and a take made on headphones is not mistaken for it', () => {
    expect(measureAlignment(master, singing(6, 120), secondsToSamples(2)).masterAudible)
      .toBe(false);
  });

  it('even quiet leakage, because quiet leakage still phases', () => {
    const delay = secondsToSamples(2);
    const faint = heardThrough(master, delay, 0.15, 0.05).slice(0, secondsToSamples(6));
    const found = measureAlignment(master, faint, delay);
    expect(found.masterAudible).toBe(true);
    expect(Math.abs(found.offsetSamples - delay)).toBeLessThan(SYNC_TOLERANCE_SAMPLES);
  });
});

describe('device latency, measured rather than believed (S-3)', () => {
  it('a click played and heard back gives the round trip', () => {
    /*
     * The four seconds of the author's time that makes every take afterwards
     * line up. The product plays a click at a known moment; the gap before
     * the microphone hears it is everything the device adds.
     */
    const latency = secondsToSamples(0.085);
    const clickAt = secondsToSamples(0.5);
    const recorded = noise(secondsToSamples(2), 0.01, 5);
    for (let i = 0; i < 300; i += 1) {
      recorded[clickAt + latency + i] = Math.exp(-i / 40) * 0.8;
    }
    const measured = measureRoundTrip(clickAt, recorded);
    expect(measured.confident).toBe(true);
    expect(Math.abs(measured.latencySamples - latency)).toBeLessThan(SYNC_TOLERANCE_SAMPLES);
  });

  it('and silence is reported as a failed calibration, not as zero latency', () => {
    // Zero would be a plausible-looking answer that silently ruins every take
    // afterwards. "I could not hear it" is the truth.
    const silent = noise(secondsToSamples(2), 0.001, 11);
    const measured = measureRoundTrip(secondsToSamples(0.5), silent);
    expect(measured.confident).toBe(false);
  });

  it('and it finds the onset, not the peak', () => {
    // The peak of a click is a fraction of a millisecond after its onset, and
    // at twenty milliseconds of tolerance that fraction is worth having.
    const latency = secondsToSamples(0.05);
    const clickAt = secondsToSamples(0.5);
    const recorded = noise(secondsToSamples(2), 0.005, 13);
    // A slow swell: the peak is well after the onset.
    for (let i = 0; i < 2000; i += 1) {
      recorded[clickAt + latency + i] = Math.min(1, i / 1500) * 0.9;
    }
    const measured = measureRoundTrip(clickAt, recorded);
    expect(measured.latencySamples).toBeLessThan(latency + 400);
  });
});
