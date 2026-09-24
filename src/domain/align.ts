/**
 * Where a take really sits on the song.  [Doctrine STUDIO-TWO §10, S-3, INV-14]
 *
 * Pure arithmetic over audio that somebody else decoded. No I/O, no ffmpeg
 * (U-23) — the worker hands this two arrays of samples and it answers a
 * question about them, which is what makes the answer testable against ground
 * truth rather than against a recording somebody made once.
 *
 * WHAT THIS IS FOR, AND WHAT IT HONESTLY CANNOT DO.
 *
 * §10 says "the system records" where a take began. A browser cannot simply be
 * asked: `MediaRecorder.start()` does not begin capturing when it is called,
 * and the master the performer HEARS is behind the master's own clock by the
 * output latency of their device. So the offset recorded at capture time is an
 * estimate, and this module is how it is checked.
 *
 * It is checked by asking whether the master is AUDIBLE IN THE TAKE. Cross
 * correlation finds the lag at which two signals best agree, which is how
 * every multicam alignment tool works — and it works because all the cameras
 * heard the same room. That has a consequence the brief does not draw out and
 * this module must be honest about:
 *
 *   IF THE PERFORMER WORE HEADPHONES, AS §10 SAYS THEY SHOULD, THE MASTER IS
 *   NOT IN THE TAKE AND THERE IS NOTHING TO CORRELATE.
 *
 * Which is exactly the right outcome, and it makes one function answer two
 * questions from one measurement:
 *
 *   HIGH agreement  the master is leaking from speakers into the microphone.
 *                   The take can be aligned precisely — and the author must be
 *                   told, because the finished video will carry the backing
 *                   track twice, slightly apart, and that cannot be removed
 *                   afterwards.
 *   LOW agreement   headphones, as intended. Alignment falls back to the
 *                   clock measured at capture, improved by calibration, and
 *                   corrected by the author's own ear if it needs it.
 *
 * The same numbers, read two ways. Pretending otherwise — silently trusting a
 * correlation against a signal that is not there — would produce confident
 * alignments that are noise, which is worse than admitting the method has a
 * precondition.
 */

import { type Samples, HOUSE_SAMPLE_RATE } from './time.js';

/**
 * The rate the coarse search runs at.
 *
 * Correlating eleven million samples against eleven million samples is not a
 * thing anybody does. An ONSET ENVELOPE at a kilohertz keeps everything that
 * matters for alignment — where the transients are — and throws away the
 * carrier, which is what makes the search affordable. One millisecond of
 * resolution, refined afterwards at full rate.
 */
export const ENVELOPE_RATE = 1000;

/** How far either side of the hint the coarse search looks, by default. */
export const SEARCH_SECONDS = 0.75;

/** How far either side of the coarse answer the fine pass looks. */
const FINE_SEARCH_SAMPLES = Math.round(0.004 * HOUSE_SAMPLE_RATE);

/**
 * ONE THRESHOLD, TWO CONSEQUENCES.
 *
 * The first version of this had two — one above which the offset could be
 * trusted, a higher one above which the author was warned about leakage — and
 * measuring showed that the band between them is exactly where the wrong
 * answers live. Normalised correlation over synthetic ground truth:
 *
 *   master leaking from speakers, loud    0.94
 *   master leaking from speakers, faint   0.83
 *   a different song entirely             0.26   ← offset wrong by 55ms
 *   a performer singing in time           0.21
 *   a performer singing out of time       0.16
 *
 * A performer singing along DOES correlate with the song — they are in time
 * with it, which is the whole idea — and the middle band was quietly treating
 * that partial agreement as an alignment. Fifty-five milliseconds is nearly
 * three times the tolerance a listener notices.
 *
 * So there is one question: IS THE MASTER AUDIBLE IN THIS TAKE? The offset can
 * be trusted exactly when it is, and the author must be warned exactly when it
 * is, because those are the same fact. 0.6 sits in the measured gap with
 * room on both sides.
 */
export const MASTER_AUDIBLE_THRESHOLD = 0.6;

export interface AlignmentMeasurement {
  /**
   * Where the take's first sample sits on the master clock.
   *
   * Only meaningful when `masterAudible` is true. When it is false this is
   * the hint it was given back, unchanged, and the caller keeps its own.
   */
  offsetSamples: Samples;
  /** 0–1. How much the two signals actually agree at that lag. */
  correlation: number;
  /**
   * Is the master audible in this take?
   *
   * The one question, and it has two consequences that point in opposite
   * directions:
   *
   *   TRUE   the offset above is precise and can be used — AND the author
   *          should be told, because the master is coming out of speakers
   *          into their microphone, and the finished video will carry the
   *          backing track twice, a few milliseconds apart, which cannot be
   *          removed afterwards. [§10]
   *   FALSE  headphones, as §10 asks for. There is nothing to correlate, the
   *          offset stands as measured at capture, and that is the NORMAL
   *          outcome rather than a failure.
   */
  masterAudible: boolean;
}

/**
 * An onset envelope: how much the signal is CHANGING, a millisecond at a time.
 *
 * Rectified difference rather than plain loudness, because two recordings of
 * the same room at different gains have different loudness and the same
 * transients. What survives is the rhythm, which is the thing being aligned.
 */
export function onsetEnvelope(
  samples: Float32Array | number[],
  rate: number = HOUSE_SAMPLE_RATE,
  envelopeRate: number = ENVELOPE_RATE,
): Float32Array {
  const step = Math.max(1, Math.round(rate / envelopeRate));
  const out = new Float32Array(Math.max(0, Math.floor(samples.length / step)));
  let previous = 0;
  for (let i = 0; i < out.length; i += 1) {
    let peak = 0;
    const from = i * step;
    const to = from + step;
    for (let j = from; j < to; j += 1) {
      const v = Math.abs(samples[j] ?? 0);
      if (v > peak) peak = v;
    }
    // Half-wave rectified difference: rises count, falls do not. A note
    // starting is an event; a note ending is the absence of one.
    out[i] = Math.max(0, peak - previous);
    previous = peak;
  }
  return out;
}

/**
 * The lag at which two envelopes agree best, and how well.
 *
 * Normalised so the score means the same thing whatever the recording level:
 * a loud take and a quiet one of the same room score alike, which is the whole
 * point of asking about agreement rather than about sum of products.
 */
export function bestLag(
  reference: Float32Array, probe: Float32Array, searchLags: number,
  centre = 0,
): { lag: number; correlation: number } {
  let bestLagValue = centre;
  let best = -1;
  const span = Math.min(reference.length, probe.length);
  if (span === 0) return { lag: centre, correlation: 0 };

  /*
   * Centred, and this is not a decoration. The first version sliced the
   * master starting a search-width BEFORE the hint and then searched ±width
   * from there, which put the whole search window EARLIER than the hint: a
   * take whose true offset was later than the browser reported could not be
   * found at all, and the measurement settled confidently on the nearest
   * earlier beat. Found by testing the error in both directions, which is the
   * only reason it was found at all.
   */
  for (let lag = centre - searchLags; lag <= centre + searchLags; lag += 1) {
    let dot = 0;
    let refEnergy = 0;
    let probeEnergy = 0;
    let counted = 0;
    for (let i = 0; i < span; i += 1) {
      const r = reference[i + lag];
      const p = probe[i];
      if (r === undefined || p === undefined) continue;
      dot += r * p;
      refEnergy += r * r;
      probeEnergy += p * p;
      counted += 1;
    }
    if (counted === 0 || refEnergy === 0 || probeEnergy === 0) continue;
    const score = dot / Math.sqrt(refEnergy * probeEnergy);
    if (score > best) { best = score; bestLagValue = lag; }
  }
  return { lag: bestLagValue, correlation: Math.max(0, best) };
}

/**
 * Check where a take sits, against the master.
 *
 * `hintSamples` is what the browser measured at capture time. This does not
 * search the whole song — it looks either side of the hint, because a blind
 * search over four minutes is both slow and a good way to land confidently on
 * the second chorus.
 */
export function measureAlignment(
  master: Float32Array | number[],
  take: Float32Array | number[],
  hintSamples: Samples,
  options: { rate?: number; searchSeconds?: number } = {},
): AlignmentMeasurement {
  const rate = options.rate ?? HOUSE_SAMPLE_RATE;
  const searchSeconds = options.searchSeconds ?? SEARCH_SECONDS;

  /*
   * The master, from where the hint says the take begins. Correlating the
   * take against the whole song would mean correlating it against three
   * minutes it was never in.
   */
  const from = Math.max(0, hintSamples - Math.round(searchSeconds * rate));
  const window = Math.min(take.length + 2 * Math.round(searchSeconds * rate),
    master.length - from);
  if (window <= 0) {
    return { offsetSamples: hintSamples, correlation: 0, masterAudible: false };
  }

  const masterSlice = slice(master, from, from + window);
  const masterEnvelope = onsetEnvelope(masterSlice, rate);
  const takeEnvelope = onsetEnvelope(take, rate);
  const searchLags = Math.round(searchSeconds * ENVELOPE_RATE);

  /*
   * The lag that means "exactly where the hint said": the master slice starts
   * a search-width before the hint, so that is where the search is centred.
   */
  const centre = Math.round(((hintSamples - from) / rate) * ENVELOPE_RATE);
  const coarse = bestLag(masterEnvelope, takeEnvelope, searchLags, centre);
  const coarseOffset = from + Math.round((coarse.lag / ENVELOPE_RATE) * rate);

  /*
   * A millisecond is not good enough. The tolerance this product holds itself
   * to is twenty milliseconds of perceived sync, and an alignment that is
   * only ever within one millisecond of correct leaves nothing for every
   * other error in the chain. A short pass at full rate around the coarse
   * answer costs little and removes the rounding.
   */
  const fine = refine(master, take, coarseOffset, rate);

  const correlation = Math.max(coarse.correlation, 0);
  const masterAudible = correlation >= MASTER_AUDIBLE_THRESHOLD;
  return {
    // Hand the hint straight back when there is nothing to improve on, rather
    // than a number that looks like a measurement and is not one.
    offsetSamples: masterAudible ? Math.max(0, fine) : hintSamples,
    correlation,
    masterAudible,
  };
}

/**
 * Round-trip latency, from a recording of the product's own click.
 *
 * The calibration §S-3 asks for: the product plays a click at a known moment,
 * the microphone hears it, and the gap is everything the device adds — output
 * latency on the way out and capture latency on the way back. Four seconds of
 * the author's time, and it is the difference between takes that line up and
 * takes that nearly do.
 *
 * Deliberately the SAME machinery as alignment rather than a second method:
 * one thing to get right, one thing to test.
 */
export function measureRoundTrip(
  clickAtSample: Samples,
  recorded: Float32Array | number[],
  options: { rate?: number; maxLatencySeconds?: number } = {},
): { latencySamples: Samples; confident: boolean } {
  const rate = options.rate ?? HOUSE_SAMPLE_RATE;
  const limit = Math.round((options.maxLatencySeconds ?? 1) * rate);

  // The loudest transient after the click was emitted is the click coming
  // back. Searching from the emission forward, because a device cannot hear
  // a sound before it makes it.
  let peak = 0;
  let at = -1;
  for (let i = clickAtSample; i < Math.min(recorded.length, clickAtSample + limit); i += 1) {
    const v = Math.abs(recorded[i] ?? 0);
    if (v > peak) { peak = v; at = i; }
  }
  if (at < 0 || peak < 0.02) return { latencySamples: 0, confident: false };

  /*
   * Walk back to where the transient STARTED. The peak of a click is a
   * fraction of a millisecond after its onset, and at this tolerance that
   * fraction is worth having.
   */
  const floor = peak * 0.2;
  let onset = at;
  while (onset > clickAtSample && Math.abs(recorded[onset - 1] ?? 0) > floor) onset -= 1;

  return { latencySamples: onset - clickAtSample, confident: true };
}

/* ------------------------------------------------------------------------ */

function slice(
  samples: Float32Array | number[], from: number, to: number,
): Float32Array {
  const out = new Float32Array(Math.max(0, to - from));
  for (let i = 0; i < out.length; i += 1) out[i] = samples[from + i] ?? 0;
  return out;
}

/** A short full-rate pass, to remove the envelope's rounding. */
function refine(
  master: Float32Array | number[], take: Float32Array | number[],
  around: Samples, rate: number,
): Samples {
  // Enough audio to be decisive, little enough to be quick: one second.
  const span = Math.min(rate, take.length);
  if (span <= 0) return around;

  let bestOffset = around;
  let best = -Infinity;
  for (let d = -FINE_SEARCH_SAMPLES; d <= FINE_SEARCH_SAMPLES; d += 1) {
    const offset = around + d;
    if (offset < 0) continue;
    let dot = 0;
    let energy = 0;
    for (let i = 0; i < span; i += 1) {
      const m = master[offset + i];
      const t = take[i];
      if (m === undefined || t === undefined) continue;
      dot += m * t;
      energy += m * m;
    }
    if (energy === 0) continue;
    const score = dot / Math.sqrt(energy);
    if (score > best) { best = score; bestOffset = offset; }
  }
  return bestOffset;
}
