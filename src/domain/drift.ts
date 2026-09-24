/**
 * Two clocks that are both wrong, and by how much.
 * [Doctrine STUDIO-TWO §10, S-3, U-08, INV-14]
 *
 * S-3's third error, and the one an offset cannot fix:
 *
 * > "Two devices — or one device across two takes — nominally at 48 kHz are
 * >  not at 48 kHz. Over a four-minute song a 20 ppm difference is ~5ms; a bad
 * >  USB interface is far worse. An offset alone cannot fix this, because the
 * >  error grows."
 *
 * A take that starts exactly on the beat and ends five milliseconds late is
 * not badly aligned; it is running at a different speed, and the correction is
 * a RATIO rather than a number of samples. `rateRatio` has been in the model
 * since stage one and INV-14 has been checking it since stage two. Nothing
 * measured it until now, and a field that is always 1.0 is a field that is
 * lying quietly.
 *
 * THE HONEST PART: DRIFT IS ONLY MEASURABLE WHERE THERE IS SOMETHING TO
 * MEASURE IT AGAINST. Two measurements of the same offset, taken far apart in
 * one take, give the ratio to a few parts per million — but each of those
 * measurements needs the song to be audible in the recording, which happens
 * only when it leaked from speakers. On headphones, which is what §10 asks
 * for, there is no signal and no measurement, and the product says so rather
 * than manufacturing a ratio that looks like one.
 *
 * WHAT IS ALWAYS AVAILABLE is coarser and catches a different, worse problem:
 * comparing how long the recorder ran (by the audio clock) against how many
 * samples came out of it. That is far too noisy to see 20 ppm — the stop
 * instant alone is uncertain by more than that — but it sees a device that
 * recorded at 44.1 kHz while claiming 48, which is not drift at all but an
 * eight percent error that ruins the take. Two measurements, two jobs, and
 * each is only asked the question it can answer.
 */

import { HOUSE_SAMPLE_RATE, type Samples } from './time.js';

/** Past this, it is not drift: it is the wrong sample rate. [INV-14] */
export const MAX_PLAUSIBLE_DRIFT = 0.001;

/**
 * How far apart the two readings must be to be worth dividing.
 *
 * Each offset is good to about a millisecond. Over sixty seconds that is
 * 17 ppm of noise on a number whose interesting range starts around 10 —
 * so a shorter take is not measured at all rather than measured badly.
 */
export const MIN_DRIFT_SPAN_SAMPLES = HOUSE_SAMPLE_RATE * 60;

/**
 * A capture rate this far from the clock is a rate error, not drift.
 *
 * One percent. The measurement's own noise is a few hundred parts per
 * million at worst; 44.1 kHz mistaken for 48 is eighty thousand.
 */
export const GROSS_RATE_ERROR = 0.01;

export interface DriftMeasurement {
  rateRatio: number;
  /** Parts per million, for saying it out loud. */
  ppm: number;
  /** Whether it is worth applying. */
  usable: boolean;
  why: string;
}

/**
 * The ratio between a take's clock and the song's, from two sightings.
 *
 * Both arguments are places on the SONG: where the take's opening was found to
 * sit, and where a moment `spanSamples` later in the take was found to sit. If
 * the two clocks agreed, those would be `spanSamples` apart. However far apart
 * they actually are is the ratio.
 *
 * WHICH WAY ROUND, since this is the number everything downstream multiplies
 * by: `rateRatio` is defined by `masterToTake` as take samples per master
 * sample. A take whose clock runs fast produces more samples for the same
 * stretch of song, so the same span of take covers LESS song — and the ratio
 * is the span over the distance the song moved.
 */
export function measureDrift(options: {
  /** Where the take's opening sits on the song. */
  startMasterSample: Samples;
  /** Where the moment `spanSamples` into the take sits on the song. */
  endMasterSample: Samples;
  /** How far apart the two sightings are, in the TAKE's own samples. */
  spanSamples: Samples;
}): DriftMeasurement {
  const { startMasterSample, endMasterSample, spanSamples } = options;
  if (spanSamples < MIN_DRIFT_SPAN_SAMPLES) {
    return {
      rateRatio: 1, ppm: 0, usable: false,
      why: 'the take is too short to measure drift over',
    };
  }

  const travelled = endMasterSample - startMasterSample;
  if (travelled <= 0) {
    return { rateRatio: 1, ppm: 0, usable: false, why: 'the two sightings disagree' };
  }
  const rateRatio = spanSamples / travelled;
  const ppm = Math.round((rateRatio - 1) * 1e6);

  if (!Number.isFinite(rateRatio) || rateRatio <= 0) {
    return { rateRatio: 1, ppm: 0, usable: false, why: 'that is not a ratio' };
  }
  if (Math.abs(rateRatio - 1) > MAX_PLAUSIBLE_DRIFT) {
    return {
      rateRatio: 1, ppm, usable: false,
      why: `${ppm} ppm is a resampling error rather than clock drift`,
    };
  }
  return { rateRatio, ppm, usable: true, why: `${ppm} ppm, measured at both ends` };
}

/**
 * The coarse check: did this recorder produce as much audio as it ran for?
 *
 * Not a drift measurement and never used as one — it is the alarm for a device
 * whose real sample rate is not the one it claimed, which no offset and no
 * ratio can rescue because every take from it is stretched.
 */
export function captureRateError(
  mediaSamples: Samples, elapsedSamples: Samples,
): { ratio: number; gross: boolean; percent: number } {
  if (elapsedSamples <= 0 || mediaSamples <= 0) {
    return { ratio: 1, gross: false, percent: 0 };
  }
  const ratio = mediaSamples / elapsedSamples;
  return {
    ratio,
    gross: Math.abs(ratio - 1) > GROSS_RATE_ERROR,
    percent: Number(((ratio - 1) * 100).toFixed(2)),
  };
}

/** Said in the take's own row, in the units drift is talked about. */
export function describeDrift(rateRatio: number): string | null {
  const ppm = Math.round((rateRatio - 1) * 1e6);
  if (ppm === 0) return null;
  // Above one means more take samples per master sample: the take's clock ran
  // fast, and the render plays it fast to put it back where it belongs.
  return `runs ${Math.abs(ppm)} ppm ${ppm > 0 ? 'fast' : 'slow'} — corrected`;
}
