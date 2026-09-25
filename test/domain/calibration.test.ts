/**
 * What the device adds, measured.  [Doctrine STUDIO-TWO §10, S-3, U-02]
 *
 * S-3: "a one-time latency calibration per device… it takes four seconds and
 * it is the difference between takes that line up and takes that nearly do."
 *
 * Two things are tested and the second matters more than the first: that the
 * click can be found, and that the number is applied in the right DIRECTION.
 * A latency correction with the sign inverted does not fail — it doubles the
 * error, and every take is then twice as wrong as it would have been with no
 * calibration at all.
 */
import { describe, expect, it } from 'vitest';

import { measureRoundTrip } from '../../src/domain/align.js';
import {
  MAX_PLAUSIBLE_LATENCY, MAX_SPREAD_SAMPLES, MIN_PLAUSIBLE_LATENCY,
  describeCalibration, placeTakeOnSong, summariseCalibration,
} from '../../src/domain/calibration.js';
import {
  HOUSE_SAMPLE_RATE, formatMasterPosition, secondsToSamples,
} from '../../src/domain/time.js';

const AT = '2026-09-24T12:00:00.000Z';
const ms = (value: number) => Math.round((HOUSE_SAMPLE_RATE * value) / 1000);

/** A recording in which the product's own click comes back after `latency`. */
function recordingWith(latency: number, clickAt: number): Float32Array {
  const samples = new Float32Array(clickAt + latency + secondsToSamples(0.5));
  const burst = ms(6);
  for (let i = 0; i < burst; i += 1) {
    samples[clickAt + latency + i] = Math.sin((i / 6) * Math.PI * 2) * (1 - i / burst);
  }
  return samples;
}

describe('hearing the click', () => {
  it('measures the gap between playing it and hearing it', () => {
    const clickAt = secondsToSamples(1);
    const found = measureRoundTrip(clickAt, recordingWith(ms(42), clickAt));
    expect(found.confident).toBe(true);
    expect(Math.abs(found.latencySamples - ms(42))).toBeLessThan(ms(2));
  });

  it('and says it heard nothing rather than guessing at silence', () => {
    const clickAt = secondsToSamples(1);
    const silence = new Float32Array(secondsToSamples(2));
    expect(measureRoundTrip(clickAt, silence).confident).toBe(false);
  });
});

describe('three readings, one answer', () => {
  it('takes the median, so one bad reading cannot move it', () => {
    const result = summariseCalibration([
      { latencySamples: ms(40), confident: true },
      { latencySamples: ms(300), confident: true },
      { latencySamples: ms(44), confident: true },
    ], AT);
    expect(result.latencySamples).toBe(ms(44));
  });

  /*
   * And it refuses the whole measurement when the readings disagree. A device
   * whose loop varies by more than a few milliseconds between clicks is not
   * being measured, it is being guessed at.
   */
  it('refuses readings that disagree with each other', () => {
    const result = summariseCalibration([
      { latencySamples: ms(20), confident: true },
      { latencySamples: ms(20) + MAX_SPREAD_SAMPLES + 100, confident: true },
    ], AT);
    expect(result.confident).toBe(false);
    expect(describeCalibration(result)).toMatch(/disagreed/);
  });

  it('throws out what no device could be', () => {
    const result = summariseCalibration([
      { latencySamples: MIN_PLAUSIBLE_LATENCY - 1, confident: true },
      { latencySamples: MAX_PLAUSIBLE_LATENCY + 1, confident: true },
    ], AT);
    expect(result.heard).toBe(0);
    expect(result.confident).toBe(false);
    expect(describeCalibration(result)).toMatch(/could not hear/);
  });

  it('and one clear reading is a coincidence, not a calibration', () => {
    const result = summariseCalibration([
      { latencySamples: ms(30), confident: true },
      { latencySamples: 0, confident: false },
      { latencySamples: 0, confident: false },
    ], AT);
    expect(result.heard).toBe(1);
    expect(result.confident).toBe(false);
  });

  it('says nothing was measured when nothing was', () => {
    expect(describeCalibration(null)).toMatch(/browser’s audio clock/);
  });
});

describe('which way the correction goes (S-3)', () => {
  /*
   * THE SIGN. The performer hears the song late by the output latency and
   * their reply lands in the file later again, so the sound at a given media
   * position belongs EARLIER in the song than the clock alone would say. The
   * correction is subtracted. Getting this backwards does not fail anything —
   * it doubles the error.
   */
  it('places a take earlier than the clock said, by the round trip', () => {
    const clock = secondsToSamples(12);
    expect(placeTakeOnSong(clock, ms(40))).toBe(clock - ms(40));
  });

  it('and leaves the clock alone when nothing was measured', () => {
    const clock = secondsToSamples(12);
    expect(placeTakeOnSong(clock, 0)).toBe(clock);
  });

  /*
   * AND IT MAY BE NEGATIVE. This used to be clamped at zero, which threw the
   * whole calibration away in the only flow that exists: recording begins at
   * the top of the song, so every correction pushed the offset just below
   * zero and the clamp rounded it back. A take recorded from the top on a
   * device with a forty-millisecond delay genuinely begins forty milliseconds
   * before the music — its first frames were captured while the performer was
   * still waiting to hear the first beat — and `coverage` treats that stretch
   * as unusable, which is the correct treatment of it.
   */
  it('places a take begun at the very top before the song, rather than at it', () => {
    expect(placeTakeOnSong(ms(10), ms(40))).toBe(ms(10) - ms(40));
    expect(placeTakeOnSong(0, ms(40))).toBe(-ms(40));
  });

  it('and the studio can say so without throwing', () => {
    expect(formatMasterPosition(-ms(40))).toBe('-00:00.040');
    expect(formatMasterPosition(ms(40))).toBe('00:00.040');
  });

  it('and describes a real measurement in milliseconds', () => {
    const result = summariseCalibration([
      { latencySamples: ms(38), confident: true },
      { latencySamples: ms(40), confident: true },
      { latencySamples: ms(39), confident: true },
    ], AT);
    expect(result.confident).toBe(true);
    expect(describeCalibration(result)).toMatch(/39ms round trip/);
  });
});
