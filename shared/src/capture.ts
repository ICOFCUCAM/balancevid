/**
 * One capture, and how far apart its angles started.
 *   [Doctrine U-06, U-08; STUDIO-TWO S-3; TAKE-DESKTOP T-4, B-1]
 *
 * > *"All recorders start from one call, to local disk. Each
 * > source's measured start is written into the session."*
 *
 * THE NUMBER THIS FILE EXISTS FOR IS THE SPREAD. Four recorders
 * asked to start together do not start together, and the whole
 * claim a multi-camera capture makes is that its angles agree
 * about when they began. PART THREE measured that spread at under
 * a millisecond across eight recorders in a container; this is
 * where it becomes **a recorded number per session on real
 * hardware** rather than an assumption carried from a fake
 * device.
 *
 * SHARED, BECAUSE BOTH ENDS HAVE TO AGREE ABOUT IT. The desktop
 * application writes these offsets and the installation reads
 * them to place angles on one clock (B-1). Two definitions of
 * "how far into the capture did this angle begin" is two
 * placements of the same footage.
 *
 * AND NONE OF IT IS `useMasterRecording`'s ARITHMETIC. That hook
 * answers *where was the song when the recorder opened*, corrected
 * by the device latency the author calibrated — and it already
 * says what happens with no song: `masterUrl ? placeTakeOnSong(…)
 * : 0`. **There is no song here.** A capture station records a
 * room, not a performance against a backing track, so the
 * question is not "where in the master" but "how far apart from
 * each other", and the one copy of the master arithmetic stays
 * exactly where it is, used by the clients that have a master.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import { type Samples, HOUSE_SAMPLE_RATE, SYNC_TOLERANCE_SAMPLES } from './time.js';

/**
 * When one recorder actually began.
 *
 * TWO INSTANTS, BECAUSE THEY ARE TWO DIFFERENT FACTS.
 * `MediaRecorder.start()` does not begin capturing at the moment
 * it is called — which is the first line of `useMasterRecording`'s
 * own list of errors in play — so the call is when it was ASKED
 * and the first chunk closing is when capture demonstrably
 * EXISTED. Both are written down; the second is the one the
 * offsets are computed from.
 *
 * ON `performance.now()`, AND THAT IS MEASURED RATHER THAN
 * ASSUMED. The audio clock would be the better clock for anything
 * relating to audio playback, and `useMasterRecording` is right to
 * use it for that. It is the wrong clock for this:
 * `AudioContext.currentTime` advances per render quantum, and in
 * a tight loop of four thousand reads it returned **one distinct
 * value** where `performance.now()` returned seventeen. A clock
 * that cannot tell two events in the same task apart cannot
 * measure a sub-millisecond spread.
 */
export interface SourceStart {
  id: string;
  /** When `start()` was called on this recorder. */
  calledAtMs: number;
  /** When its first chunk closed. Absent until one has. */
  firstChunkAtMs?: number;
}

/**
 * The instant this source began, as well as it can be known.
 *
 * THE FIRST CHUNK WHERE THERE IS ONE. A recorder that was asked
 * to start and produced nothing has not started, and using the
 * call would record a start for a camera that never delivered a
 * frame.
 */
export function startedAt(one: SourceStart): number {
  return one.firstChunkAtMs ?? one.calledAtMs;
}

/** The earliest any of them began. Everything is measured from here. */
export function earliestOf(starts: readonly SourceStart[]): number {
  return starts.length === 0
    ? 0 : Math.min(...starts.map(startedAt));
}

/**
 * How far apart the first and last began, in milliseconds.
 *
 * ZERO FOR ONE SOURCE, which is true rather than a special case:
 * one recorder cannot disagree with itself.
 */
export function spreadMs(starts: readonly SourceStart[]): number {
  if (starts.length < 2) return 0;
  const at = starts.map(startedAt);
  return Math.max(...at) - Math.min(...at);
}

/**
 * How far into the capture this angle begins, in samples.
 *
 * SAMPLES, NOT MILLISECONDS, because that is the unit the
 * installation places takes in — *"a Performance aligns its takes
 * in samples and cuts its pictures on frames, and the two are
 * never confused."* A number handed over in milliseconds would be
 * converted by whoever read it, which is where the two ends come
 * to disagree. [U-08]
 */
export function offsetSamples(
  starts: readonly SourceStart[], id: string,
  rate: number = HOUSE_SAMPLE_RATE,
): Samples {
  const one = starts.find((each) => each.id === id);
  if (!one) return 0;
  return Math.round((startedAt(one) - earliestOf(starts)) * rate / 1000);
}

/**
 * Did they start close enough together to be called one capture?
 *
 * AGAINST `SYNC_TOLERANCE_SAMPLES`, which the product already
 * holds at twenty milliseconds and which every other
 * synchronisation question in it is judged by. A second threshold
 * here would be a second answer to "are these in sync". [D-19]
 */
export function startedTogether(
  starts: readonly SourceStart[], rate: number = HOUSE_SAMPLE_RATE,
): boolean {
  return Math.round(spreadMs(starts) * rate / 1000) <= SYNC_TOLERANCE_SAMPLES;
}

/** The spread, for somebody to read. */
export function spreadSays(starts: readonly SourceStart[]): string {
  if (starts.length < 2) return 'one source';
  const ms = spreadMs(starts);
  const how = ms < 1 ? `${Math.round(ms * 1000)} µs` : `${ms.toFixed(1)} ms`;
  return startedTogether(starts)
    ? `${starts.length} sources started within ${how}`
    : `${starts.length} sources started ${how} apart, which is wider than `
      + 'this product calls synchronised';
}

/* ------------------------------------------------------------------ *
 *  What is written down.
 * ------------------------------------------------------------------ */

/**
 * One angle of a capture, as it is recorded.
 *
 * `offsetSamples` IS THE ONE THE INSTALLATION READS. Everything
 * beside it is the evidence for it: a number with no measurement
 * behind it is a number somebody has to trust.
 */
export interface Angle {
  sourceId: string;
  label: string;
  /** The file, relative to the capture's own directory. */
  file: string;
  calledAtMs: number;
  firstChunkAtMs?: number;
  /** From the earliest angle, in samples at the house rate. */
  offsetSamples: Samples;
  bytes: number;
  width?: number;
  height?: number;
  frameRate?: number;
  hasAudio: boolean;
}

/**
 * A capture: N angles, recorded together, on one machine.
 *
 * > *"Takes sharing a capture are angles; takes not sharing one
 * > are attempts."* — B-1
 *
 * This is the record a submission carries, so the installation
 * can say which of four takes are four views of one moment.
 */
export interface Capture {
  id: string;
  label: string;
  /** Wall clock, for a person. Never used for arithmetic. */
  beganAt: string;
  endedAt?: string;
  /** The rate every offset above is expressed in. */
  sampleRate: number;
  /** How far apart they started, for a person and for a warning. */
  spreadMs: number;
  startedTogether: boolean;
  angles: Angle[];
  /**
   * What correlating the angles' own room sound said, where there
   * was any. NEVER replaces `offsetSamples` — see `agreement`.
   */
  checks?: Agreement[];
}

/**
 * What correlation said about a measured start.
 *
 * > *"correlation is offered as a check on the measured start,
 * > stored beside it, never silently replacing it."*
 *
 * A CHECK IS NOT A CORRECTION, and the reason is in `align.ts`'s
 * own caution: a confident correlation against the wrong part of
 * a recording lands on the second chorus. The measured start came
 * from the machine that did the recording; the correlation came
 * from a search. Where they disagree, that is worth telling
 * somebody, and it is not worth silently preferring the search.
 */
export interface Agreement {
  sourceId: string;
  /** What the clock said, in samples. */
  measuredSamples: Samples;
  /** What correlating the room sound said, in samples. */
  heardSamples: Samples;
  /** 0–1 from `bestLag`. Low means there was nothing in common. */
  confidence: number;
  /** Do the two agree inside the product's own tolerance? */
  agrees: boolean;
}

export function agreement(
  sourceId: string, measuredSamples: Samples, heardSamples: Samples,
  confidence: number,
): Agreement {
  return {
    sourceId,
    measuredSamples,
    heardSamples,
    confidence,
    agrees: Math.abs(heardSamples - measuredSamples) <= SYNC_TOLERANCE_SAMPLES,
  };
}

/** Everything written down about one capture. */
export function captureOf(spec: {
  id: string;
  label: string;
  beganAt: string;
  endedAt?: string;
  starts: readonly SourceStart[];
  angles: readonly Omit<Angle, 'offsetSamples'>[];
  rate?: number;
  checks?: readonly Agreement[];
}): Capture {
  const rate = spec.rate ?? HOUSE_SAMPLE_RATE;
  return {
    id: spec.id,
    label: spec.label,
    beganAt: spec.beganAt,
    ...(spec.endedAt ? { endedAt: spec.endedAt } : {}),
    sampleRate: rate,
    spreadMs: spreadMs(spec.starts),
    startedTogether: startedTogether(spec.starts, rate),
    angles: spec.angles.map((one) => ({
      ...one,
      offsetSamples: offsetSamples(spec.starts, one.sourceId, rate),
    })),
    ...(spec.checks?.length ? { checks: [...spec.checks] } : {}),
  };
}
