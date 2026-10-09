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
  /**
   * MILLISECONDS OF BROADCAST PRODUCED, PER CHANNEL.
   *
   * PER CHANNEL IS THE WHOLE OF IT, and summing instead is the
   * fault that let this product run over capacity reporting
   * `easy`. A pass visits every channel in turn, so one pass
   * produces segments for many channels at once — and a caller
   * that handed in `made * SEGMENT_MS` was claiming the engine had
   * produced seventeen channels' worth of SEQUENTIAL broadcast,
   * when what each channel got was a seventeenth of it.
   *
   * Measured on a live installation:
   *
   *     17 channels, round trip 73.6s, 272 segments made
   *       summed:      272 x 4s = 1088s "covered"  -> load 0.11, easy
   *       per channel: 1088s / 17 =   64s covered  -> load 1.15, BEHIND
   *
   * Each channel advanced 64 seconds while 73.6 seconds passed.
   * Every one of them fell further behind the clock every cycle,
   * and the gauge built to catch exactly that said there was 89%
   * of the clock to spare. Understated by the channel count. [U-02]
   */
  coveredMs: number;
}

/**
 * What one pass produced, in the terms `load` needs.
 *
 * WRITTEN HERE SO THE DIVISION CANNOT BE FORGOTTEN AGAIN. The
 * engine had `made * SEGMENT_MS` inline at its one call site, which
 * is correct for one channel, silently wrong for two and wrong by a
 * factor of seventeen on the installation that reported it. A
 * caller cannot get this right by being careful; it has to be the
 * only thing on offer. [D-19]
 */
export function covered(
  made: number, channels: number, segmentMs: number,
): number {
  if (channels <= 0 || made <= 0) return 0;
  return (made * segmentMs) / channels;
}

/**
 * Spent over produced, per channel. **One is the edge of the cliff.**
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
 * HOW MANY ENGINES THIS WOULD TAKE.  [shard.ts, §11, §15, D-20]
 *
 * THE ADVICE NAMED EVERY REMEDY BUT THE PRODUCT'S OWN. *"Fewer
 * channels, a simpler source, or a bigger box"* — three things the
 * operator must give up or pay for, and not one mention of
 * `PLAYOUT_SHARDS`, which exists for exactly this and was measured
 * on exactly this installation: seventeen channels on one engine
 * ran at **2.36 of real time** and every channel ran out of
 * playlist; a third of them on one engine ran at **0.66** and none
 * did. [serve.sh]
 *
 * Load scales with the number of channels an engine is given, so
 * this is arithmetic rather than hope: to bring each engine under
 * `COMFORTABLE`, divide the channels among enough of them.
 *
 * NEVER FEWER THAN THERE ARE. This answers "how many would it
 * take", and an installation already running three must not be
 * told to run two — removing an engine mid-broadcast takes its
 * channels off the air.
 *
 * AND NEVER MORE ENGINES THAN THERE ARE CHANNELS, which the
 * first version of this got wrong and said so in production.
 * Sharding divides CHANNELS between engines; a channel is the
 * indivisible unit. A one-channel installation at 122% of real
 * time was told *"split the channels across 2 playout services"*
 * — the second engine would have taken a third of nothing and
 * idled, while the operator paid for it and the picture still
 * stalled. Advice that cannot work is worse than silence,
 * because somebody acts on it. [U-02, D-21]
 */
export const COMFORTABLE = 0.7;

export function enginesNeeded(
  worst: number | null, shards = 1, channels?: number,
): number {
  const now = Number.isInteger(shards) && shards >= 1 ? shards : 1;
  if (worst === null || !Number.isFinite(worst) || worst <= 0) return now;
  const want = Math.max(now, Math.ceil((now * worst) / COMFORTABLE));
  if (channels === undefined || !Number.isFinite(channels)) return want;
  /* An engine with no channel to serve is not a remedy. */
  return Math.max(now, Math.min(want, Math.max(1, Math.floor(channels))));
}

/**
 * WHAT ONE CHANNEL COSTS, AND THE CHEAPEST WAY TO SPEND LESS.
 *   [quality.ts `streamLadder`, §7, §23]
 *
 * THE LADDER IS A MULTIPLIER NOTHING EVER MENTIONED. Every
 * channel is encoded once at the house rung and once more for
 * every rung below it, so the default 720p deployment does TWO
 * encodes per channel per segment. That is the whole of the
 * difference between 122% of real time and 61% on a box with one
 * channel on it, and `STREAM_LADDER=off` is an environment
 * variable rather than a new service.
 *
 * IT IS NOT FREE, AND THE SENTENCE SAYS SO. The lower rung is
 * what a viewer on a poor line steps down to; turning it off
 * means they get the 720p stream or nothing. That is a real
 * trade and an operator can only make it if they are told both
 * halves. [D-21]
 */
export function ladderSays(rungs: number | undefined): string {
  if (rungs === undefined || !Number.isFinite(rungs) || rungs <= 1) return '';
  return `Each channel is encoded ${rungs} times — the house picture plus `
    + `${rungs - 1} lower ${rungs === 2 ? 'rung' : 'rungs'} of the quality `
    + 'ladder. `STREAM_LADDER=off` removes those and viewers on a poor '
    + 'line lose the step down. ';
}

/**
 * What to tell the operator, in one line they can act on.
 *
 * AND THE SENTENCE FOR `behind` NAMES THE CONSEQUENCE, because
 * "slow" is not a thing anybody acts on and "the picture will start
 * arriving late" is. [D-21]
 *
 * AND NOW IT NAMES THE REMEDY THE PRODUCT ALREADY HAS, first,
 * because it is the only one of the four that costs the operator
 * no television. It was missing, and `RotationEntry.loop` is what
 * happens to a capability nothing points at. [D-13]
 */
export function paceSays(
  state: Pacing, worst: number | null, shards = 1,
  how: { channels?: number; rungs?: number } = {},
): string {
  const percent = worst === null ? '' : ` (${Math.round(worst * 100)}% of real time)`;
  switch (state) {
    case 'behind': {
      const want = enginesNeeded(worst, shards, how.channels);
      /*
       * THE REMEDIES THAT FIT THIS INSTALLATION, AND ONLY THOSE.
       * Splitting is named only when there are channels to split;
       * the ladder only when there is one. An operator reading a
       * remedy that cannot apply to them stops reading the line.
       * [D-04, D-21]
       */
      const split = want > shards
        ? `Split the channels across ${want} playout services `
          + `(PLAYOUT_SHARDS=${want}${shards > 1 ? `, up from ${shards}` : ''}) `
          + '— each one then encodes its share and no channel changes. '
        : '';
      const ladder = ladderSays(how.rungs);
      const rest = split || ladder
        ? 'Or fewer channels, a simpler source, or a bigger box.'
        : 'Fewer channels, a simpler source, or a bigger box.';
      return 'The engine is taking longer to make the broadcast than the '
        + `broadcast lasts${percent}. The picture will start arriving late `
        + `and players will stall. ${split}${ladder}${rest}`;
    }
    case 'crowded':
      return `Little headroom left${percent}. It is keeping up, and a `
        + 'longer programme or a second channel would not.';
    case 'easy':
      return `Keeping up comfortably${percent}.`;
    default:
      return 'Nothing produced yet, so there is nothing to measure.';
  }
}

/* ------------------------------------------------------------------------ *
 *  How far ahead, and whether it is far enough.
 *    [CHANNEL §15, §18, §7; Doctrine D-19, D-20, D-21, U-02, C-41]
 * ------------------------------------------------------------------------ */

/**
 * THE SECOND QUESTION, AND `load` CANNOT ANSWER IT.
 *
 * Everything above asks *can this box make television faster than
 * real time*. Measured on a live seventeen-channel installation the
 * answer was 0.18 — `easy`, with 82% of the clock to spare — and
 * every channel on it was running out of playlist several times a
 * minute.
 *
 * BECAUSE `load` DIVIDES BY THE SUM. A pass visits every channel in
 * turn, so it produces seventeen channels' worth of television in
 * one wall-clock period: 51 segments, 204 seconds of broadcast, in
 * 20 seconds. That ratio is honest about the ENGINE and says
 * nothing whatever about any one CHANNEL, which is the only thing a
 * viewer is watching. A metric that averages over every channel is
 * structurally unable to see one channel starve, and this one was
 * reporting `easy` while all seventeen did. [U-02]
 *
 * THE QUESTION A VIEWER IS ASKING is whether the segments written
 * for THEIR channel last until the engine comes back to it. The
 * engine writes a fixed lead and then walks away for as long as the
 * other channels take, and nothing connected the two numbers:
 *
 *     measured, 17 channels:  lead  8s   round trip  20.1s
 *                             ────────────────────────────
 *                             out of playlist for 12s of every 20
 *
 * And the round trip grows with every channel added, so no constant
 * lead can be right for an installation that grows. The lead has to
 * be derived from the round trip, which is what the rest of this
 * section is for.
 */

/** How long the engine's own cycle takes, and how far ahead it writes. */
export interface Reaching {
  /** Milliseconds until the engine comes back to a given channel. */
  roundTripMs: number;
  /** Milliseconds of television written beyond the playhead per visit. */
  leadMs: number;
}

/**
 * The least lead worth writing, in segments.
 *
 * TODAY'S VALUE, KEPT AS THE FLOOR. One channel on an idle box has a
 * round trip near zero, and a lead derived from that would be a lead
 * of nothing — so this is where it starts, and it is exactly the
 * `AHEAD_SEGMENTS = 2` the engine used to hold as a constant. A
 * single-channel installation behaves precisely as it did.
 */
export const LEAST_LEAD = 2;

/**
 * The most lead worth writing, in segments.
 *
 * SIXTY SECONDS, AND THE REASON IS NOT CAPACITY. The engine's own
 * note on the constant this replaces made the argument, and it still
 * holds: *"A channel that ran a minute ahead would ignore a
 * correction made at 20:59 for a programme at 21:00, which is the
 * one moment corrections are made."* Segments already written are
 * not rewritten, so lead is committed television.
 *
 * WHAT CHANGED IS THAT RESPONSIVENESS WAS NEVER THE BINDING
 * CONSTRAINT. A channel whose engine returns every twenty seconds is
 * already twenty seconds from reacting to anything; a lead that
 * matches the round trip costs nothing that the round trip had not
 * already cost. It is only beyond the round trip that lead buys
 * staleness for nothing, which is what this ceiling stops.
 *
 * AND A ROUND TRIP THAT NEEDS MORE THAN THIS IS A FACT, NOT A
 * NUMBER TO RAISE. `reach` reports it as `starving`, because an
 * installation whose engine cannot get back inside a minute needs
 * fewer channels or another engine, and silently committing two
 * minutes of television would hide that rather than fix it. [D-21]
 */
export const MOST_LEAD = 15;

/**
 * How far ahead to write, so the playlist survives until we return.
 *
 * SIZED TO THE SAME HEADROOM `reach` DEMANDS, which is the one
 * thing a first draft of this got wrong: it sized the lead to just
 * cover the round trip, and `reach` — asking for `CROWDED` headroom
 * before it would say `covered`, exactly as `pacing` does about
 * load — then called the engine's own best choice `thin`. A planner
 * and a verdict that disagree about what "enough" means will always
 * be arguing, and the operator reads the argument.
 *
 * It is also right on the merits. The round trip is not a constant:
 * a pass that hits a long programme, a cold cache or a busy disk
 * takes longer than the one before, and a lead cut to the average
 * starves on every slow cycle. Under-writing puts black on the
 * wire, so the margin belongs here.
 *
 * ONE SEGMENT ON TOP OF THAT, for a different reason: the playhead
 * is somewhere inside the current segment rather than at its start,
 * so the engine writes from a `current` that began up to a segment
 * ago and the far end comes up short by that much.
 *
 * Clamped at both ends, and the clamp is the point: an installation
 * that needs more than `MOST_LEAD` is told rather than quietly
 * given it.
 */
export function leadSegments(
  roundTripMs: number, segmentMs: number,
  {
    /**
     * WHETHER THERE IS CAPACITY TO BUY A LONGER LEAD WITH.
     *
     * LEAD IS LATENCY, NOT CAPACITY, and buying it with capacity
     * the engine has not got makes the fault worse rather than
     * better. A pass works through the channels in turn: while it
     * writes a tenth segment for the first channel, the
     * seventeenth has none at all. When the engine is already
     * behind, the useful thing it can do with the next four
     * seconds is give SOMEBODY their next segment, not give
     * somebody else their tenth.
     *
     * So an engine that cannot keep up holds the floor and lets
     * `reach` and `pacing` say why. Raising the lead there would
     * be this product answering "it cannot keep up" with "then
     * ask it for more", and the first measurement after doing so
     * showed exactly that: a round trip of 20s became 74s.
     */
    behind = false,
    least = LEAST_LEAD,
    most = MOST_LEAD,
  }: { behind?: boolean; least?: number; most?: number } = {},
): number {
  if (behind) return least;
  if (!Number.isFinite(roundTripMs) || roundTripMs <= 0) return least;
  if (!Number.isFinite(segmentMs) || segmentMs <= 0) return least;
  /*
   * NOT CLAMPED UP TO THE FLOOR, BECAUSE IT CANNOT FALL BELOW IT.
   * `Math.ceil` of any positive number is at least one, so `needed`
   * is at least two for every round trip that reaches this line —
   * and `LEAST_LEAD` is two. A `Math.max(least, needed)` stood here
   * and no input could reach it: a mutation deleting it passed
   * every test, which is the honest verdict on a guard that cannot
   * be observed. Deleted rather than defended. [U-02]
   *
   * The floor is still real; it is the answer this returns above,
   * for a round trip nobody has measured and for an engine with no
   * capacity to spend on a longer one.
   */
  const needed = Math.ceil(roundTripMs / CROWDED / segmentMs) + 1;
  return Math.min(most, needed);
}

export type Reach =
  /** The lead outlasts the round trip with headroom. */
  | 'covered'
  /** It lasts, with nothing to spare. One slow pass and it does not. */
  | 'thin'
  /** It does not last. The channel is off the wire before we return. */
  | 'starving'
  /** No pass has been timed yet. */
  | 'unknown';

/**
 * Does what the engine wrote last until the engine comes back?
 *
 * THE SAME HEADROOM ARGUMENT `CROWDED` MAKES, applied to the other
 * axis. A lead that exactly equals the round trip leaves nothing for
 * the pass that runs long, and the first anybody knows is a stall —
 * so `covered` wants the round trip to be two thirds of the lead or
 * less, and the band between that and the cliff is `thin`.
 */
export function reach(what: Reaching | null | undefined): Reach {
  if (!what) return 'unknown';
  const { roundTripMs, leadMs } = what;
  if (!Number.isFinite(roundTripMs) || roundTripMs <= 0) return 'unknown';
  if (!Number.isFinite(leadMs) || leadMs <= 0) return 'starving';
  if (roundTripMs >= leadMs) return 'starving';
  return roundTripMs > leadMs * CROWDED ? 'thin' : 'covered';
}

/**
 * What to tell the operator, in one line they can act on.
 *
 * NAMING THE CONSEQUENCE AND NOT THE RATIO, which is the rule
 * `paceSays` already follows: "the engine comes back every 31
 * seconds and writes 8 seconds of television" is a measurement, and
 * "viewers see the picture stop" is the thing somebody acts on.
 */
export function reachSays(
  state: Reach, what: Reaching | null | undefined,
  /**
   * WHETHER THE ENGINE IS ALSO OVER CAPACITY.  [pacing]
   *
   * The two faults look identical from a viewer's chair — the
   * picture stops — and have opposite remedies, so this sentence
   * must not guess. A starving channel on an engine with capacity
   * to spare needs its channels split up; a starving channel on an
   * engine that cannot make television fast enough needs a bigger
   * box, and telling that operator "the engine is not slow" sends
   * them to rearrange the one thing that was not the problem.
   *
   * This drafted as an unconditional *"The engine is not slow"*,
   * which was true of the installation it was written for and
   * false of the same installation an hour later. [D-21, U-02]
   */
  behind = false,
): string {
  const numbers = what
    ? ` (${Math.round(what.leadMs / 1000)}s written each visit, and the `
      + `engine returns every ${Math.round(what.roundTripMs / 1000)}s)`
    : '';
  switch (state) {
    case 'starving':
      return 'Each channel runs out of playlist before the engine comes '
        + `back to it${numbers}. Viewers see the picture stop and start. `
        + (behind
          /*
           * AND SPLITTING STILL HELPS WHEN IT IS BEHIND, which
           * this used to deny in so many words: *"this is not a
           * matter of rearranging"*. It is. An engine's load is
           * the work of the channels it was GIVEN, so handing
           * half of them to a second service halves it —
           * measured, 2.36 of real time on seventeen channels and
           * 0.66 on a third of them. Telling an operator at 111%
           * that the product's own scaling will not help them is
           * worse than saying nothing: it sends them to buy a
           * bigger box for a problem an environment variable solves.
           * [shard.ts, serve.sh, D-21, U-02]
           */
          ? 'It cannot make the television fast enough on its own either, '
            + 'so rearranging the channels between MORE engines is the fix '
            + 'rather than rearranging them between these: add a playout '
            + 'service. Fewer channels, a simpler source or a bigger box '
            + 'do it too.'
          : 'The engine is not slow — it has too many channels to get '
            + 'round, so split them across a second playout service or '
            + 'run fewer.');
    case 'thin':
      return `The playlist only just lasts until the engine returns${numbers}. `
        + 'One slow pass and viewers will see it stop.';
    case 'covered':
      return `Every channel keeps its playlist until the engine returns${numbers}.`;
    default:
      return 'No pass has been timed yet, so there is nothing to measure.';
  }
}

/**
 * THE ONE LINE THE CONTROL ROOM SHOWS ABOUT THE ENGINE.
 *   [§6, §18, D-04, D-13, D-19, D-21]
 *
 * `paceSays` HAD NO CALLERS. It was written, tested and reached by
 * nothing: the heartbeat carried `pacing` and `load` to the web
 * tier and no surface in this product turned either into a
 * sentence. An operator whose engine could not keep up was told
 * exactly nothing, which is why an installation ran over capacity
 * for as long as it did with every lamp green. A capability built
 * and never reached is the fault this repository keeps finding in
 * itself. [D-13]
 *
 * TWO SENTENCES CAN APPLY AT ONCE AND ONLY ONE MAY BE SHOWN, which
 * is the same argument `controlRoomNote` makes one module over: a
 * control room talking over itself teaches an operator to read
 * none of it. The order is decided here, where it can be tested,
 * rather than in a component where it cannot.
 *
 * STARVING OUTRANKS BEHIND, and it is the ranking that matters
 * most, because `reachSays` is the only sentence that holds BOTH
 * facts. A starving channel on an over-capacity engine and a
 * starving channel on an idle one look identical from a viewer's
 * chair and need opposite remedies, so the sentence that knows the
 * difference goes first and says which.
 */
export function engineNote(
  how: {
    pacing?: Pacing; load?: number;
    reach?: Reach; roundTripMs?: number; leadMs?: number;
    /* How many engines are already running, so the advice says how
       many it would TAKE rather than restating what there is. It
       travels in the heartbeat beside everything else the two
       processes share. [shard.ts, playoutHealth.ts] */
    shards?: number;
    /* And how many channels there are to divide between them, and
       what each one costs — without these the advice recommends
       splitting one channel in two. [enginesNeeded, ladderSays] */
    channels?: number;
    rungs?: number;
  } | null | undefined,
): string | null {
  if (!how) return null;
  const what: Reaching | null = how.roundTripMs && how.leadMs
    ? { roundTripMs: how.roundTripMs, leadMs: how.leadMs } : null;
  const behind = how.pacing === 'behind';
  if (how.reach === 'starving') return reachSays('starving', what, behind);
  if (behind) {
    return paceSays('behind', how.load ?? null, how.shards ?? 1,
      { ...(how.channels !== undefined ? { channels: how.channels } : {}),
        ...(how.rungs !== undefined ? { rungs: how.rungs } : {}) });
  }
  if (how.reach === 'thin') return reachSays('thin', what);
  if (how.pacing === 'crowded') {
    return paceSays('crowded', how.load ?? null, how.shards ?? 1);
  }
  /*
   * NOTHING, WHICH IS THE COMMON CASE AND HAS TO STAY SILENT. A
   * control room that says "keeping up comfortably" on every
   * healthy channel is a control room with one more line to read
   * past. `paceSays` still has the words for a surface that wants
   * to show them on purpose. [D-04]
   */
  return null;
}
