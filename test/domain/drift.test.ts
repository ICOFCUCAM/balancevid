/**
 * Two clocks that are both wrong.  [Doctrine STUDIO-TWO §10, S-3, INV-14]
 *
 * S-3's third error: "an offset alone cannot fix this, because the error
 * grows." `rateRatio` has been in the model since stage one and nothing
 * measured it until now — a field that is always 1.0 is a field that is lying
 * quietly.
 *
 * The direction is the part worth testing. A ratio applied the wrong way round
 * doubles the drift instead of removing it, and the symptom — a take that
 * slides out of sync over four minutes — is the same symptom as not correcting
 * it at all, only worse.
 */
import { describe, expect, it } from 'vitest';

import {
  GROSS_RATE_ERROR, MIN_DRIFT_SPAN_SAMPLES,
  captureRateError, describeDrift, measureDrift,
} from '../../src/domain/drift.js';
import { masterToTake } from '../../src/domain/performance.js';
import { secondsToSamples } from '../../src/domain/time.js';

const SPAN = secondsToSamples(240);

describe('measuring drift from two sightings', () => {
  it('finds no drift when the song moved exactly as far as the take did', () => {
    const found = measureDrift({
      startMasterSample: 0, endMasterSample: SPAN, spanSamples: SPAN,
    });
    expect(found.usable).toBe(true);
    expect(found.ppm).toBe(0);
    expect(found.rateRatio).toBe(1);
  });

  /*
   * THE DIRECTION. `rateRatio` is take samples per master sample. A take whose
   * clock runs fast produces more of its own samples for the same stretch of
   * song, so four minutes of it covers slightly LESS than four minutes of
   * song — and the ratio is above one.
   */
  it('reads a fast take as a ratio above one, and agrees with masterToTake', () => {
    // 240 seconds of take covering 5ms less than 240 seconds of song: ~21 ppm.
    const travelled = SPAN - secondsToSamples(0.005);
    const found = measureDrift({
      startMasterSample: 0, endMasterSample: travelled, spanSamples: SPAN,
    });
    expect(found.usable).toBe(true);
    expect(found.rateRatio).toBeGreaterThan(1);
    expect(found.ppm).toBeGreaterThan(15);
    expect(found.ppm).toBeLessThan(30);

    /*
     * And the ratio, put through the model's own conversion, lands the end of
     * the take where it was actually found. This is the check that would have
     * caught the formula being inverted: both versions produce "a number near
     * one", and only one of them produces the right one.
     */
    const alignment = { offsetSamples: 0, rateRatio: found.rateRatio, method: 'heard' as const };
    expect(Math.abs(masterToTake(alignment, travelled) - SPAN)).toBeLessThan(2);
  });

  it('and a slow take as a ratio below one', () => {
    const travelled = SPAN + secondsToSamples(0.005);
    const found = measureDrift({
      startMasterSample: 0, endMasterSample: travelled, spanSamples: SPAN,
    });
    expect(found.rateRatio).toBeLessThan(1);
    expect(found.ppm).toBeLessThan(0);
  });

  it('refuses a take too short to divide over', () => {
    const short = MIN_DRIFT_SPAN_SAMPLES - 1;
    const found = measureDrift({
      startMasterSample: 0, endMasterSample: short, spanSamples: short,
    });
    expect(found.usable).toBe(false);
    expect(found.rateRatio).toBe(1);
    expect(found.why).toMatch(/too short/);
  });

  /*
   * A ratio past a thousandth is not a clock being imperfect, it is a
   * resampling error — and INV-14 refuses to store one, so the measurement
   * refuses to produce one.
   */
  it('and refuses a ratio that is a resampling error rather than drift', () => {
    const found = measureDrift({
      startMasterSample: 0,
      endMasterSample: Math.round(SPAN * 0.9),
      spanSamples: SPAN,
    });
    expect(found.usable).toBe(false);
    expect(found.rateRatio).toBe(1);
    expect(found.why).toMatch(/resampling error/);
  });

  it('says nothing about two sightings that disagree', () => {
    const found = measureDrift({
      startMasterSample: SPAN, endMasterSample: 0, spanSamples: SPAN,
    });
    expect(found.usable).toBe(false);
  });
});

describe('the coarse check a headphone take still gets', () => {
  it('sees a device that recorded at a rate it did not claim', () => {
    // 44.1 kHz of audio where 48 kHz was assumed: eight percent short.
    const found = captureRateError(secondsToSamples(220), secondsToSamples(240));
    expect(found.gross).toBe(true);
    expect(found.percent).toBeLessThan(-GROSS_RATE_ERROR * 100);
  });

  /*
   * And is not mistaken for a drift measurement. The stop instant alone is
   * uncertain by more than the drift this would be asked to find, so anything
   * inside one percent is silence rather than a reading.
   */
  it('and says nothing at all about a difference too small to be one', () => {
    const found = captureRateError(secondsToSamples(240) + 500, secondsToSamples(240));
    expect(found.gross).toBe(false);
  });

  /*
   * NOR ABOUT A TAKE TOO SHORT TO ASK. Both ends of the window are a recorder
   * being told to start and stop, and neither is instant: on a seven-second
   * take that slop is well over one percent. The first version of this check
   * had no minimum and reported every take from a working machine as recorded
   * at the wrong rate — a false alarm about the author's hardware, which is
   * the most expensive kind of wrong thing to say.
   */
  it('and refuses to judge a take shorter than its own error', () => {
    const short = secondsToSamples(7);
    // Two percent out on seven seconds: past the threshold, under the floor.
    expect(captureRateError(Math.round(short * 0.98), short).gross).toBe(false);
    const long = secondsToSamples(240);
    expect(captureRateError(Math.round(long * 0.98), long).gross).toBe(true);
  });

  it('but still reports the number it measured, whatever it does with it', () => {
    const short = secondsToSamples(7);
    expect(captureRateError(Math.round(short * 0.98), short).percent).toBeLessThan(-1);
  });

  it('or about a take that has not landed yet', () => {
    expect(captureRateError(0, secondsToSamples(240)).gross).toBe(false);
    expect(captureRateError(secondsToSamples(240), 0).gross).toBe(false);
  });
});

describe('saying it out loud', () => {
  it('says nothing when there is nothing to say', () => {
    expect(describeDrift(1)).toBeNull();
  });

  it('and names the direction when there is', () => {
    expect(describeDrift(1.00002)).toMatch(/20 ppm fast/);
    expect(describeDrift(0.99998)).toMatch(/ppm slow/);
  });
});
