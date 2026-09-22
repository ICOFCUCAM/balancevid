/**
 * The two clocks.  [Doctrine U-08]
 *
 * Every time value in this system belongs to exactly one clock, and its name
 * says which. A bare `time`, `start`, or `timestamp` is a defect.
 *
 *   t_source  — position within the original video
 *   t_output  — position within the final rendered video
 *
 * The authoritative unit is the FRAME, not the second.  [Doctrine U-07]
 * Seconds are derived from frames for display. Never the reverse: seconds
 * round-trip lossily and the product's central promise is frame-exactness.
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
