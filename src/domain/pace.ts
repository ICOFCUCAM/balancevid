/**
 * Is the channel keeping up?  [Doctrine CHANNEL §18, §7, D-20, D-21,
 * C-24, C-28, C-41]
 *
 *     four seconds of television must be made in under four seconds
 *                            │
 *                   or the channel falls behind,
 *                   and then it stops being a channel
 *
 * THE ENGINE ALREADY KNEW AND THREW IT AWAY. `index.ts` has computed
 * `const spent = Date.now() - started` at the end of every pass since
 * it was written, and used it only to decide how long to sleep. The
 * number that says whether this product is a television station or a
 * slideshow was measured four times a second, for the life of every
 * broadcast, and never written down.
 *
 * SO THE ONLY WAY TO FIND OUT WAS A STOPWATCH SOMEWHERE ELSE. That is
 * how this stage started: a report from another machine, with
 * measurements taken in a different container against a synthetic
 * file, proposing a fix for a fault nobody could confirm on the
 * server it was happening on. The right answer to "is it falling
 * behind" is not a better guess. It is for the thing that knows to
 * say so.
 *
 * IT IS THE SAME ARGUMENT AS C-24 AND C-28. A render that failed
 * silently put black on the wire while every signal stayed green; a
 * confidence monitor was built because the one thing nobody could see
 * was the transmission. A channel that cannot keep up is the third of
 * those: nothing is broken, nothing throws, and the picture arrives
 * later and later until a player gives up.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/** How long four seconds of television took to make. */
export interface Pace {
  /** Milliseconds of wall clock spent. */
  spentMs: number;
  /** Milliseconds of broadcast produced. */
  coveredMs: number;
}

/**
 * Spent over produced. **One is the edge of the cliff.**
 *
 * Below one the engine has spare time and the channel runs for ever.
 * Above one every pass starts further behind the clock than the last,
 * and the gap grows without limit — there is no equilibrium above
 * one, which is why this is a ratio rather than a duration.
 *
 * A pass that produced nothing has no ratio rather than an infinite
 * one: the engine idles when a channel is up to date, and counting
 * that as "infinitely slow" would alarm on the healthiest state there
 * is.
 */
export function load(pace: Pace): number | null {
  if (pace.coveredMs <= 0) return null;
  return pace.spentMs / pace.coveredMs;
}

/**
 * HOW CLOSE IS TOO CLOSE.
 *
 * Not 1.0. A channel running at 95% of real time has no room for a
 * longer programme, a second viewer-facing render, or the minute the
 * operating system spends on something else — and the first anybody
 * would know is a stall. Broadcast engineering reserves headroom and
 * so does this: two thirds.
 */
export const CROWDED = 0.66;

/** More than a handful, so one slow segment is not a verdict. */
export const KEPT = 15;

export type Pacing = 'easy' | 'crowded' | 'behind' | 'unknown';

/**
 * What the last few passes say, together.
 *
 * THE WORST RECENT PASS, NOT THE AVERAGE. A channel that makes
 * nineteen segments in 0.3s and one in 5s has already dropped a
 * segment, and a mean of 0.5 would call that healthy. What matters
 * is whether it EVER ran out of time, because each time it does the
 * picture arrives late and nothing catches it up.
 *
 * The average is the honest number for "how hard is this box
 * working"; the maximum is the honest number for "did we make it".
 * This answers the second question, and `worst` is on the record so
 * the first can be asked too.
 */
export function pacing(recent: readonly Pace[]): Pacing {
  const loads = recent.map(load).filter((one): one is number => one !== null);
  if (loads.length === 0) return 'unknown';
  const worst = Math.max(...loads);
  if (worst >= 1) return 'behind';
  if (worst >= CROWDED) return 'crowded';
  return 'easy';
}

/** The worst of the recent passes, for the record. */
export function worstLoad(recent: readonly Pace[]): number | null {
  const loads = recent.map(load).filter((one): one is number => one !== null);
  return loads.length ? Math.max(...loads) : null;
}

/** Keep the last few and no more. A rolling window, not a log. */
export function keep(
  recent: readonly Pace[], one: Pace, most = KEPT,
): Pace[] {
  return [...recent, one].slice(-most);
}

/**
 * What to tell the operator, in one line they can act on.
 *
 * AND THE SENTENCE FOR `behind` NAMES THE CONSEQUENCE, because
 * "slow" is not a thing anybody acts on and "the picture will start
 * arriving late" is. [D-21]
 */
export function paceSays(state: Pacing, worst: number | null): string {
  const percent = worst === null ? '' : ` (${Math.round(worst * 100)}% of real time)`;
  switch (state) {
    case 'behind':
      return 'The engine is taking longer to make the broadcast than the '
        + `broadcast lasts${percent}. The picture will start arriving late `
        + 'and players will stall. Fewer channels, a simpler source, or a '
        + 'bigger box.';
    case 'crowded':
      return `Little headroom left${percent}. It is keeping up, and a `
        + 'longer programme or a second channel would not.';
    case 'easy':
      return `Keeping up comfortably${percent}.`;
    default:
      return 'Nothing produced yet, so there is nothing to measure.';
  }
}
