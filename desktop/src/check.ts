/**
 * Asking the room whether the clock was right.  [TAKE-DESKTOP T-4]
 *
 * > *"Where the sources share audible room sound — the case
 * > `align.ts` describes and never gets on a phone —
 * > correlation is offered as a check on the measured start,
 * > stored beside it, never silently replacing it."*
 *
 * A CHECK IS NOT A CORRECTION, AND `align.ts` SAYS WHY IN ITS
 * OWN WORDS: a blind search *"is both slow and a good way to land
 * confidently on the second chorus."* The measured start came
 * from the machine that did the recording. The correlation came
 * from a search over a few seconds of room noise read on a frame
 * timer. Where they disagree, that is worth telling somebody; it
 * is not worth silently preferring the search.
 *
 * `measureAlignment` IS REUSED AND NOT REWRITTEN. It is in
 * `shared/` for exactly this: the installation correlates a take
 * against a master, and this correlates one angle against
 * another. Same onset envelope, same centred search, same
 * hard-won fix about searching EITHER side of the hint rather
 * than before it. [D-19]
 *
 * THE FIRST ANGLE IS THE REFERENCE, because something has to be,
 * and it is the one every offset is already measured from. A
 * different choice would mean the check and the clock disagree
 * about what zero means before either of them has said anything.
 */

import { MASTER_AUDIBLE_THRESHOLD, measureAlignment } from '../../shared/src/align.js';
import { type Agreement, agreement } from '../../shared/src/capture.js';
import { HOUSE_SAMPLE_RATE } from '../../shared/src/time.js';

/**
 * Whether there was anything in common to correlate is
 * `align.ts`'s question, not this file's.
 *
 * A LOWER THRESHOLD HERE WAS WRITTEN FIRST AND WAS A FALSE
 * REASSURANCE. `measureAlignment` returns
 * `offsetSamples: masterAudible ? fine : hintSamples` — below
 * `MASTER_AUDIBLE_THRESHOLD` it hands the HINT STRAIGHT BACK. A
 * check gated at 0.3 would therefore have recorded, between 0.3
 * and 0.6, an "agreement" between the clock and an echo of
 * itself: a tick beside every angle, meaning nothing.
 *
 * So the gate is `masterAudible`. The name is about a backing
 * track and the question is not — *was there enough common
 * signal to trust this number* — and that question is the same
 * one. A second threshold would be a second answer. [D-19]
 */
export const HEARD_THRESHOLD = MASTER_AUDIBLE_THRESHOLD;

export interface Room {
  sourceId: string;
  samples: Float32Array;
  rate: number;
  /** What the clock said, in samples at the house rate. */
  measuredSamples: number;
}

/**
 * What the room sound says about each angle's start.
 *
 * NOTHING AT ALL FOR FEWER THAN TWO, which is not an edge case:
 * one camera has nothing to agree with, and a check that
 * returned a confident zero there would be a reassurance about a
 * question nobody asked.
 *
 * AND NOTHING WHERE THERE WAS NOTHING TO HEAR. Four cameras in
 * four different rooms share no sound, and `align.ts` already
 * has the concept — `MASTER_AUDIBLE_THRESHOLD` exists because a
 * correlation against silence is a confident number about
 * nothing. A capture with no common sound simply carries no
 * checks, and the manifest says so by their absence.
 */
export function checkAgainstRoom(rooms: readonly Room[]): Agreement[] {
  /*
   * THIS GUARD CANNOT BE KILLED BY MUTATION AND IS KEPT ANYWAY.
   * `rooms.slice(1)` is already empty for one source, so
   * removing it changes nothing observable — but it is what
   * makes `rooms[0]!` below TRUE rather than an assertion about
   * an array that might be empty. `registry.ts` kept its
   * `usableNumber` filter for the same reason: *"it is what makes
   * the return type true."* A guard that only narrows a type
   * cannot be judged by mutation alone.
   */
  if (rooms.length < 2) return [];
  const reference = rooms[0]!;

  /*
   * TWO EMPTINESS GUARDS STOOD HERE AND NEITHER COULD BE
   * OBSERVED. An empty reference and an empty probe both
   * correlate at zero, and `masterAudible` below already refuses
   * everything that does — so a source that recorded no sound at
   * all is skipped by the question that was going to be asked
   * anyway. A guard nothing can observe is decoration, and
   * decoration in front of a measurement reads as though the
   * measurement were being checked twice.
   * [the twenty-seventh and twenty-eighth]
   */
  const out: Agreement[] = [];
  for (const one of rooms.slice(1)) {
    /*
     * THE HINT IS WHAT THE CLOCK SAID, converted into the rate
     * the samples are actually at. `measureAlignment` searches
     * around the hint rather than everywhere, which is the whole
     * reason it can be trusted at all — and a hint in the wrong
     * rate would send it searching in the wrong place and let it
     * answer confidently from there.
     */
    const hint = Math.round(
      one.measuredSamples * one.rate / HOUSE_SAMPLE_RATE);
    const said = measureAlignment(
      reference.samples, one.samples, hint, { rate: one.rate });
    /* Not `correlation < HEARD_THRESHOLD`: the same comparison,
       asked of the function that made it. */
    if (!said.masterAudible) continue;
    out.push(agreement(
      one.sourceId,
      one.measuredSamples,
      /* Back into the house rate, which is the unit everything
         downstream places takes in. [U-08] */
      Math.round(said.offsetSamples * HOUSE_SAMPLE_RATE / one.rate),
      said.correlation,
    ));
  }
  return out;
}
