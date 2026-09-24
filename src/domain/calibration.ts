/**
 * What the device adds, measured once.  [Doctrine STUDIO-TWO §10, S-3, U-02]
 *
 * S-3 named three errors in placing a take on a song and this is the second:
 * the author performs to what they HEAR, which is behind the song's own clock
 * by the device's output latency, and what the microphone captures lands in
 * the file behind that again. Neither number is knowable by asking — browsers
 * report `outputLatency` where they feel like it — so the product plays a
 * click, listens for it, and measures the loop.
 *
 * WHICH DIRECTION THE CORRECTION GOES, derived once here so that nobody has to
 * derive it again at three in the morning:
 *
 *   The song is scheduled at audio-clock time B. The performer hears song
 *   position s at wall time B + s + L_out, so the sound they make in reply is
 *   late by L_out. The capture path adds L_in before that sound lands in the
 *   file. So sound sitting at media position m was performed against song
 *   position (offset + m) − (L_out + L_in).
 *
 * The correction is therefore SUBTRACTED from the take's offset, and the
 * quantity to subtract is the whole round trip. The first version of this
 * added it, which would have doubled the error rather than removing it — a
 * sign is not something to guess at when the symptom is "everything is
 * slightly out".
 *
 * WHY A ROUND TRIP RATHER THAN TWO NUMBERS. The loop also contains whatever
 * the recorder's own start delay is — the gap between `MediaRecorder.start()`
 * returning and the first sample landing, which is S-3's first error. A
 * round-trip measurement taken through the same recorder includes it, and
 * including it is exactly right: the same gap displaces a take by the same
 * amount, so measuring the loop measures all three errors at once.
 */

import { HOUSE_SAMPLE_RATE, type Samples } from './time.js';

/** Three, because a median of three throws out one bad reading. */
export const CALIBRATION_CLICKS = 3;
/** Far enough apart that one click's echo is not the next click's onset. */
export const CLICK_SPACING_SECONDS = 0.8;
/** Long enough for the recorder to have settled before the first click. */
export const CLICK_LEAD_SECONDS = 1;

/**
 * The range a real device can occupy.
 *
 * Twelve milliseconds is a wired interface doing its best; four hundred is a
 * Bluetooth headset having a bad day. Outside it the product has measured
 * something that is not the click — a door, a cough, its own echo — and a
 * measurement it cannot believe is one it must not use. [S-3]
 */
export const MIN_PLAUSIBLE_LATENCY = Math.round(HOUSE_SAMPLE_RATE * 0.002);
export const MAX_PLAUSIBLE_LATENCY = Math.round(HOUSE_SAMPLE_RATE * 0.4);

/** How far apart the readings may be and still describe one device. */
export const MAX_SPREAD_SAMPLES = Math.round(HOUSE_SAMPLE_RATE * 0.012);

export interface Calibration {
  latencySamples: Samples;
  /** Whether the product believes its own measurement. */
  confident: boolean;
  /** How far apart the readings were — shown, because it is the evidence. */
  spreadSamples: Samples;
  /** How many clicks were actually heard, of those played. */
  heard: number;
  measuredAt: string;
}

/**
 * Several readings, one answer.
 *
 * The MEDIAN rather than the mean: a single click missed or a single cough
 * mistaken for one is an outlier, and a mean lets an outlier move the answer
 * in proportion to how wrong it is.
 */
export function summariseCalibration(
  readings: { latencySamples: number; confident: boolean }[], at: string,
): Calibration {
  const heard = readings.filter((reading) => reading.confident
    && reading.latencySamples >= MIN_PLAUSIBLE_LATENCY
    && reading.latencySamples <= MAX_PLAUSIBLE_LATENCY)
    .map((reading) => Math.round(reading.latencySamples))
    .sort((a, b) => a - b);

  if (heard.length === 0) {
    return {
      latencySamples: 0, confident: false, spreadSamples: 0, heard: 0, measuredAt: at,
    };
  }

  const median = heard[Math.floor(heard.length / 2)]!;
  const spread = heard[heard.length - 1]! - heard[0]!;
  return {
    latencySamples: median,
    /*
     * Two agreeing readings, or one is a coincidence. A device whose readings
     * disagree by more than twelve milliseconds is not being measured; it is
     * being guessed at, and the honest answer is to keep the browser's clock
     * and say so.
     */
    confident: heard.length >= 2 && spread <= MAX_SPREAD_SAMPLES,
    spreadSamples: spread,
    heard: heard.length,
    measuredAt: at,
  };
}

/**
 * Where a take actually sits on the song.  [S-3]
 *
 * `into` is where the song had got to when the recorder started, by the audio
 * clock. The device's round trip is subtracted, for the reason derived at the
 * top of this file. Clamped at zero because a take cannot start before the
 * song does — the first few milliseconds of a take recorded from the very top
 * are simply before the music, and `coverage` already treats them that way.
 */
export function placeTakeOnSong(into: Samples, latencySamples: Samples): Samples {
  return Math.max(0, Math.round(into) - Math.round(latencySamples));
}

/** Said in the studio, in milliseconds, because that is how latency is talked about. */
export function describeCalibration(calibration: Calibration | null): string {
  if (!calibration) {
    return 'Not measured. Takes are placed by your browser’s audio clock, which '
      + 'is usually within a few hundredths of a second.';
  }
  if (!calibration.confident) {
    return calibration.heard === 0
      ? 'We could not hear the click. Takes stay on your browser’s clock — turn '
        + 'the volume up, take your headphones off, and try again.'
      : 'The readings disagreed too much to trust. Takes stay on your browser’s '
        + 'clock.';
  }
  const ms = (calibration.latencySamples / HOUSE_SAMPLE_RATE) * 1000;
  return `This device is ${ms.toFixed(0)}ms round trip. Takes are placed `
    + 'against that rather than against the clock.';
}
