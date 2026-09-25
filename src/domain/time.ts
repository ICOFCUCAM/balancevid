/**
 * The clocks.  [Doctrine U-08, STUDIO-TWO S-2]
 *
 * Every time value in this system belongs to exactly one clock, and its name
 * says which. A bare `time`, `start`, or `timestamp` is a defect.
 *
 *   t_source  — position within the original video          (frames)
 *   t_output  — position within the final rendered video     (frames)
 *   t_master  — position within a Performance's music        (SAMPLES)
 *
 * The authoritative unit for the first two is the FRAME, not the second.
 * [Doctrine U-07] Seconds are derived from frames for display. Never the
 * reverse: seconds round-trip lossily and the product's central promise is
 * frame-exactness.
 *
 * The third clock is finer, and deliberately. A frame is the unit a viewer
 * perceives in VISION; in music the unit a listener perceives is far smaller.
 * One frame at 30fps is 33 milliseconds, and 33 milliseconds of misalignment
 * on a snare is not a subtle artefact — it is the difference between a
 * performance and an amateur one. So a Performance aligns its takes in
 * samples and cuts its pictures on frames, and the two are never confused.
 */

/** Frames at house rate. The unit all cuts are expressed in. [U-02, U-07] */
export type Frames = number;

/** House format frame rate. Every asset is normalised to this on ingest. [U-02] */
export const HOUSE_FPS = 30;

/** Rolling capture buffer retained ahead of an interrupt. [U-04, Part 0 §5] */
export const PREROLL_FRAMES: Frames = 8 * HOUSE_FPS;

/** Clean air placed before and after every response. [U-17 step 6] */
export const RESPONSE_PAD_FRAMES: Frames = Math.round(0.2 * HOUSE_FPS);

export function secondsToFrames(seconds: number, fps: number = HOUSE_FPS): Frames {
  if (!Number.isFinite(seconds)) throw new RangeError(`seconds must be finite, got ${seconds}`);
  if (seconds < 0) throw new RangeError(`seconds must be >= 0, got ${seconds}`);
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: Frames, fps: number = HOUSE_FPS): number {
  assertFrames(frames);
  return frames / fps;
}

export function assertFrames(frames: Frames): asserts frames is Frames {
  if (!Number.isInteger(frames)) {
    throw new RangeError(`frame values must be integers, got ${frames}`);
  }
  if (frames < 0) throw new RangeError(`frame values must be >= 0, got ${frames}`);
}

/**
 * Timecode for display and for chapter markers. Always derived from frames.
 * Format: HH:MM:SS.mmm — the precision the doctrine uses throughout (§7).
 */
export function formatTimecode(frames: Frames, fps: number = HOUSE_FPS): string {
  assertFrames(frames);
  const totalMs = Math.round((frames / fps) * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}


/* ------------------------------------------------------------------------ *
 *  t_master — the music clock.  [STUDIO-TWO S-2, INV-14]
 * ------------------------------------------------------------------------ */

/** Position on the master clock, in samples at HOUSE_SAMPLE_RATE. */
export type Samples = number;

/**
 * House sample rate. Every master track is normalised to this on ingest, for
 * the same reason every video is normalised to HOUSE_FPS: two clocks that
 * disagree about what a second is cannot be aligned, only approximated.
 */
export const HOUSE_SAMPLE_RATE = 48_000;

/**
 * The tolerance a listener does not notice.
 *
 * Roughly the point at which a sound and a picture stop being one event. It
 * is here as a number the tests can assert against rather than as a claim in
 * a comment: alignment that lands inside this is correct, and alignment that
 * does not is a defect however plausible its arithmetic.
 */
export const SYNC_TOLERANCE_SAMPLES: Samples = Math.round(0.020 * HOUSE_SAMPLE_RATE);

export function assertSamples(samples: Samples): asserts samples is Samples {
  if (!Number.isInteger(samples)) {
    throw new RangeError(`sample values must be integers, got ${samples}`);
  }
  if (samples < 0) throw new RangeError(`sample values must be >= 0, got ${samples}`);
}

export function secondsToSamples(
  seconds: number, rate: number = HOUSE_SAMPLE_RATE,
): Samples {
  if (!Number.isFinite(seconds)) throw new RangeError(`seconds must be finite, got ${seconds}`);
  if (seconds < 0) throw new RangeError(`seconds must be >= 0, got ${seconds}`);
  return Math.round(seconds * rate);
}

export function samplesToSeconds(
  samples: Samples, rate: number = HOUSE_SAMPLE_RATE,
): number {
  assertSamples(samples);
  return samples / rate;
}

/**
 * A moment on the music clock, as the frame that shows it.
 *
 * ROUNDED DOWN, not to nearest, and this is the whole of the rule that keeps
 * the two clocks honest. A cut belongs to the frame that is on screen when the
 * moment arrives; rounding to nearest would let a cut land on a frame that is
 * still showing the previous scene for up to half a frame, which is visible
 * against a beat. [INV-02 applied to t_master]
 */
export function samplesToFrames(
  samples: Samples, fps: number = HOUSE_FPS, rate: number = HOUSE_SAMPLE_RATE,
): Frames {
  assertSamples(samples);
  return Math.floor((samples / rate) * fps);
}

export function framesToSamples(
  frames: Frames, fps: number = HOUSE_FPS, rate: number = HOUSE_SAMPLE_RATE,
): Samples {
  assertFrames(frames);
  return Math.round((frames / fps) * rate);
}

/** Bars and beats, for a count-in and for snapping. [STUDIO-TWO §11, S-10] */
export function beatsToSamples(
  beats: number, bpm: number, rate: number = HOUSE_SAMPLE_RATE,
): Samples {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError(`bpm must be > 0, got ${bpm}`);
  if (!Number.isFinite(beats) || beats < 0) {
    throw new RangeError(`beats must be >= 0, got ${beats}`);
  }
  return Math.round((beats / bpm) * 60 * rate);
}

/**
 * Position on the music clock, for people.
 *
 * MM:SS.mmm rather than the video timecode's HH:MM:SS.mmm — a song is minutes
 * long and an hour field is a column of zeroes nobody reads.
 */
export function formatMasterPosition(
  samples: Samples, rate: number = HOUSE_SAMPLE_RATE,
): string {
  /*
   * Negative is a real answer here, and only here: a take whose device delay
   * was measured begins slightly BEFORE the song does, because the performer
   * heard the first beat late and their reply landed later still. Positions on
   * the song are never negative; a take's offset onto it can be. [§10, S-3]
   */
  if (!Number.isInteger(samples)) {
    throw new RangeError(`sample values must be integers, got ${samples}`);
  }
  if (samples < 0) return `-${formatMasterPosition(-samples, rate)}`;
  const totalMs = Math.round((samples / rate) * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(totalSec / 60))}:${p(totalSec % 60)}.${p(ms, 3)}`;
}
