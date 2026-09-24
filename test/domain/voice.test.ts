/**
 * Telling a voice from a room.  [Doctrine ROOM §2]
 *
 * Driven with synthetic spectra, which is the whole reason the judgement is a
 * pure function: an extractor fan, mains hum, a keyboard click and a vowel
 * can all be written down exactly, and the thing that must not happen — the
 * screen jumping — becomes an assertion rather than a hope.
 */
import { describe, expect, it } from 'vitest';
import {
  SPEECH_HIGH_HZ, SPEECH_LOW_HZ, measureVoice,
} from '../../src/domain/voice.js';

const SAMPLE_RATE = 48_000;
const BINS = 512;
const PER_BIN = (SAMPLE_RATE / 2) / BINS;
const bin = (hz: number) => Math.round(hz / PER_BIN);

/** A spectrum with energy in the given hertz ranges. */
function spectrum(
  bands: { from: number; to: number; level: number }[], jitter = 0,
): Float32Array {
  const out = new Float32Array(BINS);
  for (const band of bands) {
    for (let i = bin(band.from); i <= Math.min(BINS - 1, bin(band.to)); i += 1) {
      // Deterministic pseudo-jitter, so a "moving" spectrum is reproducible.
      const wobble = jitter === 0 ? 0 : jitter * Math.sin(i * 12.9898);
      out[i] = Math.max(0, band.level + wobble);
    }
  }
  return out;
}

/** Flat across everything: white noise, hiss. */
const white = (level: number, jitter = 0) =>
  spectrum([{ from: 0, to: SAMPLE_RATE / 2, level }], jitter);
/** A voice: energy in the speech band, and changing shape. */
const voice = (level: number, phase: number) => {
  const out = spectrum([{ from: SPEECH_LOW_HZ, to: SPEECH_HIGH_HZ, level }]);
  // Formants that move, which is what a mouth does between syllables.
  for (let i = bin(SPEECH_LOW_HZ); i <= bin(SPEECH_HIGH_HZ); i += 1) {
    out[i] = Math.max(0, level * (1 + 0.9 * Math.sin(i * 0.12 + phase)));
  }
  return out;
};
/** Mains hum and its harmonics, below the speech band. */
const hum = (level: number) => spectrum([{ from: 40, to: 180, level }]);
/** An extractor fan: in band, loud, and utterly unchanging. */
const fan = (level: number) => spectrum([{ from: 200, to: 2000, level }]);

const measure = (
  now: ArrayLike<number>, previous?: ArrayLike<number>, noiseFloor?: number,
) => measureVoice(now, {
  sampleRate: SAMPLE_RATE,
  ...(previous ? { previous } : {}),
  ...(noiseFloor === undefined ? {} : { noiseFloor }),
});

describe('what is not a voice', () => {
  it('mains hum is loud and not speech', () => {
    const a = hum(0.9);
    const reading = measure(a, hum(0.9));
    expect(reading.energy).toBeGreaterThan(0);
    // Below the band entirely: it cannot be what somebody said.
    expect(reading.speechConfidence).toBeLessThan(0.1);
  });

  it('an extractor fan is in band, and still not speech', () => {
    // The case a band filter alone would get wrong. It does not move.
    const steady = fan(0.6);
    const reading = measure(steady, fan(0.6));
    expect(reading.speechConfidence).toBeLessThan(0.15);
  });

  it('white noise is not speech however loud', () => {
    expect(measure(white(0.9, 0.05), white(0.9)).speechConfidence).toBeLessThan(0.3);
    expect(measure(white(0.2, 0.05), white(0.2)).speechConfidence).toBeLessThan(0.3);
  });

  it('a keyboard click is a broadband burst, not a voice', () => {
    // Silence, then everything at once: huge flux, spread across the whole
    // spectrum. Flux alone would promote it; placement refuses.
    const before = white(0.0);
    const click = white(0.95, 0.3);
    expect(measure(click, before).speechConfidence).toBeLessThan(0.35);
  });

  it('silence is nothing at all', () => {
    const reading = measure(new Float32Array(BINS), new Float32Array(BINS));
    expect(reading.energy).toBe(0);
    expect(reading.speechConfidence).toBe(0);
  });
});

describe('what is a voice', () => {
  it('speech in the band, changing shape, reads as speech', () => {
    const reading = measure(voice(0.5, 1.2), voice(0.5, 0.0));
    expect(reading.speechConfidence).toBeGreaterThan(0.5);
    expect(reading.energy).toBeGreaterThan(0);
  });

  it('and clears the threshold the stage policy uses', () => {
    // 0.6 is DEFAULT_POLICY.confidenceThreshold. If a plain vowel could not
    // clear it, automatic switching would never fire on anybody.
    const reading = measure(voice(0.6, 2.4), voice(0.6, 1.1));
    expect(reading.speechConfidence).toBeGreaterThanOrEqual(0.6);
  });

  it('scores a voice far above a fan of the same loudness', () => {
    const talking = measure(voice(0.6, 1.0), voice(0.6, 0.2));
    const machine = measure(fan(0.6), fan(0.6));
    expect(talking.speechConfidence).toBeGreaterThan(machine.speechConfidence * 3);
  });

  it('is not confident on a single frame, because one frame cannot tell', () => {
    // No previous spectrum: nothing has been seen to move yet.
    expect(measure(voice(0.6, 1.0)).speechConfidence).toBe(0);
  });
});

describe('the noise floor follows the room (ROOM §2)', () => {
  it('rises slowly, so a burst does not become the new normal', () => {
    let floor = 0;
    for (let i = 0; i < 5; i += 1) floor = measure(white(0.8), white(0.8), floor).noiseFloor;
    const energy = measure(white(0.8), white(0.8)).energy;
    expect(floor).toBeLessThan(energy * 0.5);
  });

  it('falls quickly, so a quiet room hears a soft voice again', () => {
    let floor = 0.5;
    for (let i = 0; i < 5; i += 1) {
      floor = measure(new Float32Array(BINS), new Float32Array(BINS), floor).noiseFloor;
    }
    expect(floor).toBeLessThan(0.2);
  });

  it('settles where the room actually is, given time', () => {
    let floor = 0;
    const steady = white(0.4);
    for (let i = 0; i < 400; i += 1) floor = measure(steady, steady, floor).noiseFloor;
    const energy = measure(steady, steady).energy;
    expect(Math.abs(floor - energy)).toBeLessThan(0.02);
  });
});

describe('the measurement is honest about its inputs', () => {
  it('survives an empty spectrum', () => {
    const reading = measureVoice(new Float32Array(0), { sampleRate: SAMPLE_RATE });
    expect(reading.energy).toBe(0);
    expect(reading.speechConfidence).toBe(0);
  });

  it('ignores negative magnitudes rather than producing nonsense', () => {
    // getFloatFrequencyData is in decibels and goes negative; a caller who
    // forgets to convert should get zero, not an inverted reading.
    const negative = new Float32Array(BINS).fill(-90);
    const reading = measureVoice(negative, { sampleRate: SAMPLE_RATE, previous: negative });
    expect(reading.energy).toBe(0);
    expect(reading.speechConfidence).toBe(0);
  });

  it('gives the same answer for the same frames', () => {
    const a = voice(0.5, 1.0);
    const b = voice(0.5, 0.3);
    expect(measure(a, b)).toEqual(measure(a, b));
  });

  it('does not depend on the FFT size somebody chose', () => {
    // The same sound analysed at two resolutions should read about the same.
    const small = new Float32Array(128);
    const large = new Float32Array(1024);
    const fill = (out: Float32Array, phase: number) => {
      const per = (SAMPLE_RATE / 2) / out.length;
      for (let i = 0; i < out.length; i += 1) {
        const hz = i * per;
        out[i] = hz >= SPEECH_LOW_HZ && hz <= SPEECH_HIGH_HZ
          ? 0.5 * (1 + 0.9 * Math.sin(hz * 0.004 + phase)) : 0;
      }
      return out;
    };
    const a = measureVoice(fill(small, 1.2), {
      sampleRate: SAMPLE_RATE, previous: fill(new Float32Array(128), 0),
    });
    const b = measureVoice(fill(large, 1.2), {
      sampleRate: SAMPLE_RATE, previous: fill(new Float32Array(1024), 0),
    });
    expect(Math.abs(a.energy - b.energy)).toBeLessThan(0.15);
    expect(Math.abs(a.speechConfidence - b.speechConfidence)).toBeLessThan(0.25);
  });
});
