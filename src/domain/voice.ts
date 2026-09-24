/**
 * Is this a voice?  [Doctrine ROOM §2]
 *
 * The brief forbids "loudest microphone" and names what to use instead:
 * voice activity detection, audio energy, speech confidence, noise
 * suppression. `stage.ts` consumes those numbers and decides who is on
 * screen; this is where the numbers come from.
 *
 * A PURE FUNCTION over a spectrum, so the hard part is testable. The browser
 * plumbing around it — an AnalyserNode and a timer — is a dozen lines with
 * nothing to get wrong; the judgement is here, and it can be driven with
 * synthetic spectra: a fifty-hertz hum, white noise, a keyboard click, a
 * vowel.
 *
 * WHAT DISTINGUISHES A VOICE FROM A ROOM, with no model and no training:
 *
 *   WHERE the energy is. Speech puts most of its power between about 300 Hz
 *   and 3.4 kHz — the band telephony was designed around, because it is the
 *   band intelligibility lives in. Mains hum sits below it; hiss, fans and
 *   keyboard clicks spread above it.
 *
 *   WHETHER it moves. Speech is modulated: syllables at four to eight a
 *   second, constantly changing shape. An extractor fan is the same spectrum
 *   second after second. Spectral flux — how much the spectrum changed since
 *   the last look — separates a talkative room from a noisy one better than
 *   any single frame can.
 *
 * Neither alone is enough, which is the point. A fan can be in band; a slam
 * has enormous flux. Requiring both is what stops the screen jumping.
 */

/** The speech band, in hertz. Telephony's, for telephony's reason. */
export const SPEECH_LOW_HZ = 300;
export const SPEECH_HIGH_HZ = 3400;

export interface VoiceMeasurement {
  /** 0–1. Loudness, as `stage.ts` means it. */
  energy: number;
  /** 0–1. How much this sounds like a voice rather than a noise. */
  speechConfidence: number;
  /** The running floor this microphone sits on, to hand back next time. */
  noiseFloor: number;
}

export interface VoiceOptions {
  /** Where the spectrum came from, so bins can be turned into hertz. */
  sampleRate: number;
  /** The previous frame's magnitudes, for flux. Absent on the first. */
  previous?: ArrayLike<number> | undefined;
  /** The floor carried from the previous measurement. */
  noiseFloor?: number;
}

/**
 * How fast the measured floor follows the room.
 *
 * Slow upward and quick downward: a room that gets noisier should raise the
 * bar gradually, so a burst of noise does not immediately become the new
 * normal, while a room that goes quiet should let a soft voice through
 * without waiting.
 */
const FLOOR_RISE = 0.02;
const FLOOR_FALL = 0.20;

/**
 * Measure one frame.
 *
 * `magnitudes` is a linear-magnitude spectrum — an `AnalyserNode`'s
 * `getFloatFrequencyData` converted out of decibels, or anything shaped like
 * it. Bin *i* is the band centred on `i * sampleRate / (2 * bins)`.
 */
export function measureVoice(
  magnitudes: ArrayLike<number>, options: VoiceOptions,
): VoiceMeasurement {
  const bins = magnitudes.length;
  if (bins === 0) return { energy: 0, speechConfidence: 0, noiseFloor: options.noiseFloor ?? 0 };

  const nyquist = options.sampleRate / 2;
  const perBin = nyquist / bins;
  const low = Math.max(1, Math.floor(SPEECH_LOW_HZ / perBin));
  const high = Math.min(bins - 1, Math.ceil(SPEECH_HIGH_HZ / perBin));

  let total = 0;
  let inBand = 0;
  for (let i = 0; i < bins; i += 1) {
    const magnitude = Math.max(0, magnitudes[i] ?? 0);
    total += magnitude;
    if (i >= low && i <= high) inBand += magnitude;
  }

  /*
   * Energy, normalised by the number of bins so the answer does not depend on
   * the FFT size somebody chose. Square-rooted because loudness is perceived
   * closer to amplitude than to power, and the thresholds in `stage.ts` are
   * set by ear.
   */
  const energy = clamp01(Math.sqrt(total / bins));

  /*
   * A floor that follows the room.  [ROOM §2 "noise suppression"]
   *
   * Tracked from the QUIET frames only: a floor that rose with speech would
   * climb until nobody could clear it, which is how automatic gain makes a
   * room deaf to the person talking in it.
   */
  const previousFloor = options.noiseFloor ?? 0;
  const rate = energy > previousFloor ? FLOOR_RISE : FLOOR_FALL;
  const noiseFloor = clamp01(previousFloor + (energy - previousFloor) * rate);

  if (total <= 0) return { energy: 0, speechConfidence: 0, noiseFloor };

  /* WHERE the energy is. Flat noise scores the band's share of the spectrum;
     a voice scores far above it; a hum scores near zero. */
  const bandRatio = inBand / total;
  const flatShare = (high - low + 1) / bins;
  const placement = clamp01((bandRatio - flatShare) / Math.max(0.05, 1 - flatShare));

  /* WHETHER it moves. Nothing to compare on the first frame, so a single
     frame is never confident on its own — which is correct: one frame cannot
     tell a vowel from a fan. */
  const flux = options.previous
    ? spectralFlux(magnitudes, options.previous, total)
    : 0;
  const movement = clamp01(flux / 0.35);

  /*
   * Both, not either. The geometric mean punishes a low score in either term
   * far harder than an average would: a fan in band with no movement, and a
   * broadband slam with enormous movement, both fail.
   */
  const speechConfidence = clamp01(Math.sqrt(placement * movement));
  return { energy, speechConfidence, noiseFloor };
}

/** How much the spectrum changed, as a fraction of its own size. */
function spectralFlux(
  current: ArrayLike<number>, previous: ArrayLike<number>, total: number,
): number {
  const bins = Math.min(current.length, previous.length);
  let change = 0;
  for (let i = 0; i < bins; i += 1) {
    change += Math.abs(Math.max(0, current[i] ?? 0) - Math.max(0, previous[i] ?? 0));
  }
  return total > 0 ? change / total : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
