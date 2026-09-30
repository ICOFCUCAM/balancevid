/**
 * Where somebody is singing.  [MASTER-EDIT §16, C-L1; L3]
 *
 * *"BalanceVid can use the actual song audio to generate timed lyrics."*
 *
 * It can, and this is the measurement it uses. Given the master's own
 * samples, it says where the voice starts and stops — nothing more. It
 * does not know what is being sung and does not try: `lyrics.ts` rejected
 * speech recognition on singing for good reason, and alignment does not
 * need it, because the words are already known.
 *
 * WHY NOT A MODEL, when `silero_vad.onnx` is already downloaded. Two
 * reasons, and the second is the one that decided it:
 *
 *   the model lives in the WORKER, so using it means a queued job, a
 *     poll, and an author watching a spinner for a measurement that takes
 *     less time than the request to start it; and
 *   a VAD is trained to find SPEECH, and its whole job is to reject the
 *     things a song is made of — sustained tones, music under the voice,
 *     a held note across a bar. On singing it is not obviously better
 *     than energy, and it is certainly slower to reach.
 *
 * WHAT THIS MEASURES INSTEAD is loudness above the master's own floor,
 * which for a mixed song is the accompaniment. That is a cruder question
 * than "is this a voice" and the right one here: the lines are known and
 * in order, so what alignment needs is the BOUNDARIES of the sung
 * phrases, and a phrase boundary in a mix is a change in level.
 *
 * AND IT IS HONEST ABOUT WHAT THAT COSTS. A song with a wall of sound
 * under the vocal has no quiet between phrases, so this finds one long
 * phrase and the studio says the lines shared it. That is the true
 * answer for such a master, and it is why `alignLyrics` marks shared
 * lines for review rather than presenting them as measured.
 */

import type { Samples } from './time.js';
import type { Phrase } from './lyrics.js';

/**
 * How much of the song is looked at per step.
 *
 * Twenty milliseconds is the window every speech measurement in this
 * product uses, and short enough that a phrase boundary is located to
 * within about a syllable.
 */
export const WINDOW_MS = 20;

/**
 * How far above the floor counts as singing.
 *
 * NOT AN ABSOLUTE LEVEL. A song mastered quietly and the same song
 * mastered loud have the same phrases, and a fixed threshold would find
 * them in one and not the other. This is a multiple of the track's own
 * measured quiet, which is the same shape as the plate matte's threshold
 * and for the same reason. [STUDIO-TWO §4]
 */
export const ABOVE_FLOOR = 2.2;

/**
 * A gap shorter than this is a breath, not a phrase boundary.
 *
 * Chosen from what the numbers mean: a breath between lines is 150–350ms
 * and a rest between phrases is longer. At 400ms a singer's breath stays
 * inside its line, which is what `alignLyrics` then has to un-join if it
 * is wrong — cheap — where splitting a line in two is a caption that
 * appears mid-sentence, which is not.
 */
export const BREATH_MS = 400;

/** Shorter than this is a click, a cough or the end of a reverb tail. */
export const SHORTEST_MS = 300;

/**
 * The quiet of a track, measured rather than assumed.
 *
 * THE TENTH PERCENTILE, not the minimum: a digital silence of one sample
 * makes the minimum zero and every multiple of zero is zero. The tenth
 * percentile of a song is its accompaniment between phrases, which is
 * exactly the thing the voice has to rise above.
 */
export function floorOf(levels: readonly number[]): number {
  if (levels.length === 0) return 0;
  const sorted = [...levels].sort((a, b) => a - b);
  const at = Math.floor(sorted.length * 0.1);
  return sorted[Math.min(at, sorted.length - 1)]!;
}

/** Root mean square per window. The loudness of a stretch of samples. */
export function levelsOf(
  samples: Float32Array, rate: number, windowMs = WINDOW_MS,
): number[] {
  const width = Math.max(1, Math.round((rate * windowMs) / 1000));
  const out: number[] = [];
  for (let start = 0; start + width <= samples.length; start += width) {
    let sum = 0;
    for (let i = start; i < start + width; i += 1) {
      const value = samples[i]!;
      sum += value * value;
    }
    out.push(Math.sqrt(sum / width));
  }
  return out;
}

/**
 * The sung phrases of a track.
 *
 * Pure, and over numbers rather than over an `AudioBuffer`, so the whole
 * measurement is testable against a signal somebody wrote down — which
 * is the difference between a rule this product can defend and one that
 * happened to work on the song it was written against.
 */
export function phrasesIn(
  samples: Float32Array, rate: number,
  { windowMs = WINDOW_MS, aboveFloor = ABOVE_FLOOR,
    breathMs = BREATH_MS, shortestMs = SHORTEST_MS } = {},
): Phrase[] {
  if (rate <= 0 || samples.length === 0) return [];
  const levels = levelsOf(samples, rate, windowMs);
  if (levels.length === 0) return [];

  const floor = floorOf(levels);
  const loudest = Math.max(...levels);
  /*
   * A TRACK WITH NO DYNAMICS HAS NO PHRASES, and the threshold below is
   * what says so: silence, a sine tone and a fully limited master all
   * have a floor equal to their loudest, so nothing ever rises above
   * `floor × aboveFloor` and the result is empty. `alignLyrics` then
   * refuses with a sentence naming the two ways out.
   *
   * AN EXPLICIT GUARD STOOD HERE AND A MUTATION SWEEP REMOVED IT WITH
   * NOTHING NOTICING, because it could only ever be true where this
   * line already returns nothing. The fifth of the session, and deleted
   * for the same reason: a branch that cannot change an outcome reads
   * as though it were deciding something.
   *
   * A FLOOR OF ZERO IS A TRACK WITH REAL SILENCE IN ITS QUIET TENTH,
   * and zero times anything is zero — so that case falls back to a
   * fraction of the loudest, which is the only number available.
   */
  const over = floor > 0 ? floor * aboveFloor : loudest * 0.1;
  const perWindow = (windowMs / 1000) * rate;
  const breath = Math.round(breathMs / windowMs);
  const shortest = Math.round(shortestMs / windowMs);

  const found: { from: number; to: number }[] = [];
  let start: number | null = null;
  let quiet = 0;
  for (let i = 0; i < levels.length; i += 1) {
    if (levels[i]! > over) {
      if (start === null) start = i;
      quiet = 0;
    } else if (start !== null) {
      quiet += 1;
      /* A gap longer than a breath ends the phrase, at the window the
         quiet began rather than at the window it was noticed. */
      if (quiet > breath) {
        found.push({ from: start, to: i - quiet + 1 });
        start = null;
        quiet = 0;
      }
    }
  }
  if (start !== null) found.push({ from: start, to: levels.length });

  return found
    .filter((one) => one.to - one.from >= shortest)
    .map((one) => ({
      fromSample: Math.round(one.from * perWindow) as Samples,
      toSample: Math.round(one.to * perWindow) as Samples,
    }));
}
