/**
 * The pulse of the song, found rather than typed.
 * [Doctrine STUDIO-TWO §11, S-8, INV-06, U-15]
 *
 * "The system detects musical beats and lets you snap camera changes to them."
 *
 * S-8 settled what that means here before any of it was built: **a detected
 * beat is a suggestion, not a fact.** Cutting on the beat is the thing that
 * makes an edit look professional, and a cut that moved forty milliseconds
 * because a detector was confident is a cut the author did not make. So the
 * grid is stored with no authority at all until somebody accepts it, snapping
 * is visible while it happens, and every snapped boundary can be dragged
 * afterwards like any other.
 *
 * WHAT THE DETECTOR IS, said plainly rather than hidden behind the word
 * "detected": an autocorrelation of the onset envelope — the same envelope
 * alignment already builds — over the lags a human tempo can occupy, and then
 * a comb search for the phase that best explains where the loud moments are.
 * It is arithmetic, it runs offline, and it is wrong in one specific way that
 * the interface has to allow for: it can land an octave out, hearing half or
 * double the tempo somebody would tap. That is why halving and doubling are
 * one press each rather than a re-detect.
 */

import { ENVELOPE_RATE, onsetEnvelope } from './align.js';
import { HOUSE_SAMPLE_RATE, type Samples } from './time.js';

/** The tempos a person taps along to. Outside this it is not a beat, it is a
 *  pulse, and snapping a camera change to it helps nobody. */
export const SLOWEST_BPM = 60;
export const FASTEST_BPM = 200;

/**
 * Under this, the detector says it is unsure rather than sounding certain.
 *
 * Measured rather than chosen: a click track scores 0.89 to 0.97, and white
 * noise — onsets everywhere and a period nowhere — tops out at 0.56. The line
 * sits above the noise and below the music. It changes what the studio SAYS
 * and never what it does: the tempo is shown either way and the author is the
 * one who accepts it. [S-8]
 */
export const BEATS_USABLE_CONFIDENCE = 0.65;

export const BEAT_DETECTOR = 'onset-autocorrelation@1';

/** Milliseconds either side, in the envelope's own bins. */
const SMOOTH_BINS = 2;

/** Where people land when asked to tap along: two beats a second. */
const PREFERRED_BPM = 120;
/** How far from that a tempo may sit before it has to argue for itself. */
const TEMPO_SPREAD_OCTAVES = 0.9;

/**
 * How far a cut may be moved to land on a beat.
 *
 * A twelfth of a second: inside a frame or two either way at house rate, and
 * far enough to catch a keypress that was honestly aimed at the beat. Beyond
 * it the author meant somewhere else, and moving them there anyway is the
 * behaviour S-8 refuses.
 */
export const SNAP_WINDOW_SAMPLES = Math.round(HOUSE_SAMPLE_RATE / 12);

export interface BeatGrid {
  bpm: number;
  /** Where the first beat falls, on the music clock. */
  phaseSamples: Samples;
  /** 0..1, measured. How much better this period explains the song than none. */
  confidence: number;
  /** What ran. Never a friendly label. [U-15] */
  detector: string;
  detectedAt: string;
  /**
   * A human said yes.  [INV-06]
   *
   * Absent until the author turns snapping on, and nothing in the product may
   * move one of their cuts while it is absent. The detector has no prompt to
   * hash, so this records what a heuristic can honestly record — who accepted
   * it, and when — rather than borrowing the shape of a model's provenance and
   * filling it with blanks.
   */
  acceptedBy?: string;
  acceptedAt?: string;
}

export class BeatsNotAccepted extends Error {
  constructor(what: string) {
    super(`[INV-06] ${what} would move a cut using beats nobody has accepted [S-8]`);
    this.name = 'BeatsNotAccepted';
  }
}

/** INV-06, at the one place a detected beat can change the document. */
export function assertBeatsAccepted(grid: BeatGrid | undefined, what: string): void {
  if (!grid?.acceptedBy?.trim() || !grid.acceptedAt?.trim()) {
    throw new BeatsNotAccepted(what);
  }
}

export interface DetectedBeats {
  bpm: number;
  phaseSamples: Samples;
  confidence: number;
}

/**
 * Find the tempo and where the bar starts.
 *
 * Takes the master's samples, not an envelope, so a caller cannot pass one
 * built at a rate this function does not expect — the envelope's rate is part
 * of the arithmetic below, not a detail of how it was made.
 */
export function detectBeats(
  samples: Float32Array, rate: number = HOUSE_SAMPLE_RATE,
): DetectedBeats | null {
  const raw = onsetEnvelope(samples, rate);
  if (raw.length < ENVELOPE_RATE * 4) return null; // Under four seconds says nothing.

  /*
   * Smoothed by a few milliseconds before anything is correlated.
   *
   * The envelope is built in one-millisecond bins and a tempo almost never
   * divides evenly into them: at 140 BPM the beats fall at 428.6ms, so
   * successive onsets land on alternating sides of a bin boundary. Correlating
   * that unsmoothed compares a spike against its neighbour and finds nothing,
   * and the detector answers with half the tempo — which it did, until this
   * existed. A real onset is ten to thirty milliseconds wide anyway; the sharp
   * single-bin edge is an artefact of the measurement, not a property of
   * music.
   */
  const envelope = smooth(raw, SMOOTH_BINS);

  /* Centred, so silence contributes nothing rather than a constant. */
  let mean = 0;
  for (const value of envelope) mean += value;
  mean /= envelope.length;
  const centred = new Float32Array(envelope.length);
  for (let i = 0; i < envelope.length; i += 1) centred[i] = envelope[i]! - mean;

  let energy = 0;
  for (const value of centred) energy += value * value;
  if (energy <= 0) return null; // A silent master has no tempo, and says so.

  const shortest = Math.round((60 / FASTEST_BPM) * ENVELOPE_RATE);
  const longest = Math.round((60 / SLOWEST_BPM) * ENVELOPE_RATE);

  let chosen = 0;
  let best = 0;
  let confidence = 0;
  for (let lag = shortest; lag <= longest; lag += 1) {
    const r = correlationAt(centred, lag);
    /*
     * THE OCTAVE PROBLEM, handled where it arises rather than patched
     * afterwards. Autocorrelation is exactly as happy with half the tempo as
     * with the tempo — every other beat lines up just as well — so a click
     * track at 140 comes back as 70 on a coin toss. People do not hear it
     * that way: asked to tap along they converge near two beats a second, and
     * the further a candidate is from there the better it has to be to win.
     * This is the standard tempo prior, and it is a preference rather than a
     * rule: a genuine 70 BPM song still wins, because at that tempo nothing
     * else correlates at all.
     */
    const bpm = (60 * ENVELOPE_RATE) / lag;
    const octaves = Math.log2(bpm / PREFERRED_BPM);
    const weighted = r * Math.exp(-0.5 * (octaves / TEMPO_SPREAD_OCTAVES) ** 2);
    if (weighted > best) { best = weighted; chosen = lag; confidence = r; }
  }
  if (chosen === 0) return null;

  const { phase } = combPhase(envelope, chosen);
  return {
    bpm: Number(((60 * ENVELOPE_RATE) / chosen).toFixed(2)),
    phaseSamples: Math.round((phase / ENVELOPE_RATE) * HOUSE_SAMPLE_RATE),
    confidence: Number(Math.max(0, Math.min(1, confidence)).toFixed(4)),
  };
}

/**
 * How much the envelope repeats at this lag, between 0 and 1.
 *
 * Normalised over the OVERLAP rather than the whole signal. Dividing by the
 * total energy makes long lags look worse than short ones purely because
 * fewer terms are summed, which is a bias towards fast tempos disguised as a
 * measurement.
 */
function correlationAt(centred: Float32Array, lag: number): number {
  let product = 0;
  let energy = 0;
  for (let i = 0; i + lag < centred.length; i += 1) {
    product += centred[i]! * centred[i + lag]!;
    energy += centred[i]! * centred[i]!;
  }
  return energy > 0 ? product / energy : 0;
}

/** Where the beats sit, for drawing and for snapping. */
export function beatPositions(
  grid: Pick<BeatGrid, 'bpm' | 'phaseSamples'>, durationSamples: Samples,
): Samples[] {
  const period = beatPeriod(grid.bpm);
  if (period <= 0) return [];
  const out: Samples[] = [];
  // Backwards from the phase as well as forwards: a song whose first beat was
  // found at 0.4s still has a beat at 0.4s minus a period if that is positive.
  let first = grid.phaseSamples % period;
  if (first < 0) first += period;
  for (let at = first; at < durationSamples; at += period) out.push(Math.round(at));
  return out;
}

export function beatPeriod(bpm: number): Samples {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  return Math.round((60 / bpm) * HOUSE_SAMPLE_RATE);
}

/**
 * The nearest beat, if one is near enough.
 *
 * Returns the sample unchanged when nothing is within the window, which is the
 * behaviour that makes snapping safe to leave on: a deliberate cut between
 * beats stays where it was put.
 */
export function snapToBeat(
  sample: Samples, grid: Pick<BeatGrid, 'bpm' | 'phaseSamples'>,
  window: Samples = SNAP_WINDOW_SAMPLES,
): { sample: Samples; snapped: boolean } {
  const period = beatPeriod(grid.bpm);
  if (period <= 0) return { sample, snapped: false };
  let first = grid.phaseSamples % period;
  if (first < 0) first += period;

  const index = Math.round((sample - first) / period);
  const candidate = Math.max(0, Math.round(first + index * period));
  if (Math.abs(candidate - sample) > window) return { sample, snapped: false };
  return { sample: candidate, snapped: candidate !== sample };
}

/* ------------------------------------------------------------------------ */

/**
 * How well a period explains the song, and at what phase.
 *
 * A comb: sum the envelope at every position this period would call a beat,
 * for each possible starting point, and keep the best. Divided by the number
 * of beats so that periods of different lengths can be compared.
 */
function smooth(envelope: Float32Array, width: number): Float32Array {
  if (width <= 0) return envelope;
  const out = new Float32Array(envelope.length);
  for (let i = 0; i < envelope.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - width); j <= Math.min(envelope.length - 1, i + width); j += 1) {
      sum += envelope[j]!;
      count += 1;
    }
    out[i] = sum / count;
  }
  return out;
}

function combPhase(
  envelope: Float32Array, lag: number,
): { phase: number; score: number } {
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let phase = 0; phase < lag; phase += 1) {
    let sum = 0;
    let beats = 0;
    for (let at = phase; at < envelope.length; at += lag) { sum += envelope[at]!; beats += 1; }
    const score = beats > 0 ? sum / beats : 0;
    if (score > bestScore) { bestScore = score; bestPhase = phase; }
  }
  return { phase: bestPhase, score: bestScore };
}
