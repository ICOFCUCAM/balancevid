/**
 * What a channel will actually show, across a window.
 * [Doctrine CHANNEL §4, §5, §18, D-04, D-22]
 *
 *     windowFrom ├──loop──┼───── off air ─────┼──programme──┤ windowTo
 *
 * WALKED, NOT LAID OUT. At each instant the same `whatIsOn` the playout
 * engine calls is asked what is on, and the answer's own end is where
 * the next question is asked. A lane drawn from the programme list
 * alone would be a lane that lies about every gap the loop fills — and
 * the gaps are most of a channel's day.
 *
 * THE FAULT THIS MODULE EXISTS TO FIX, which the author saw before
 * anybody measured it:
 *
 *   *"A full schedule timeline with '0 scheduled · 1 file' and 'no
 *   loop'. The 24/7 timeline drew repeating five-minute programme
 *   blocks while the footer and the landing page both said the loop
 *   was empty."*
 *
 * Both halves were true and the picture was a lie. Only a programme
 * and a turn of the loop know when they END; everything else — off
 * air, a live feed, the emergency cut-away — runs until somebody
 * changes it. The walk had to advance by SOMETHING, so it advanced by
 * five minutes and pushed a block each time. An empty channel
 * therefore drew a day of five-minute items, every one of them
 * nothing, beside a footer correctly reporting that nothing was
 * scheduled.
 *
 * A STEP IS NOT A STRUCTURE. The five minutes is how often the walker
 * asks, and asking twelve times an hour is not twelve things an hour.
 * Stretches with no end of their own are joined back together, so a
 * quiet afternoon is one quiet afternoon.
 *
 * AND TWO TURNS OF THE SAME LOOP ARE NOT JOINED, which is the line
 * that makes this a fix rather than a smoothing: a programme and a
 * rotation entry each have an `untilMs`, so where they end is a fact
 * about the schedule and not about the walker. Joining those would
 * hide the loop point, which is the one thing an operator looks at a
 * rotation lane to find.
 */

import type { Channel, OnAir } from './channel.js';
import { whatIsOn } from './channel.js';

/** One continuous thing, from here to there. */
export interface Stretch {
  fromMs: number;
  toMs: number;
  on: OnAir;
}

/**
 * How often the walker asks, where the answer has no end of its own.
 *
 * Five minutes is fine enough that a programme starting at 10:03 is
 * not drawn from 10:00, and coarse enough that a day is a few dozen
 * questions rather than a few thousand. It is a sampling rate and
 * nothing else — see the joining below.
 */
export const STEP_MS = 5 * 60_000;

/** The walk's ceiling, so a bad `untilMs` cannot spin. */
const MOST = 240;

/**
 * When this answer ends, if it knows.
 *
 * Only a programme and a turn of the loop do. Off air, a live feed
 * and the emergency cut-away run until somebody changes them, which
 * is why the walker has to sample instead — and why what it produces
 * for them is a sampling rate rather than a structure.
 */
export function endsAt(on: OnAir): number | null {
  return on.kind === 'programme' || on.kind === 'rotation'
    ? on.untilMs : null;
}

/** Does this answer know when it ends? */
export function ends(on: OnAir): boolean {
  return endsAt(on) !== null;
}

/**
 * Whether two adjacent stretches are one thing the walker cut in half.
 *
 * ONLY WHERE NEITHER KNOWS ITS OWN END. Where both do, the boundary
 * between them is the schedule's and must survive.
 */
export function joinable(before: OnAir, after: OnAir): boolean {
  if (ends(before) || ends(after)) return false;
  if (before.kind !== after.kind) return false;
  /*
   * AND IT IS STILL THE SAME SOURCE. A live feed that was taken down
   * and a different one brought up inside one window is two
   * stretches, even though both read `live`: `whatIsOn` answers
   * `live` with whatever is rolled in over the room (§7), so the
   * kind alone would join a film to the room it covered. [C-27]
   */
  const key = (on: OnAir) =>
    on.kind === 'off' ? 'off' : JSON.stringify(on.source);
  return key(before) === key(after);
}

/**
 * Every continuous stretch between two instants.
 *
 * Pure, and in the domain rather than the component, because "what
 * will this channel show this afternoon" is a question about a
 * document and a clock. It was walked inside a `useMemo` where the
 * five-minute step could not be seen for what it was.
 */
export function airtime(
  channel: Channel, fromMs: number, toMs: number,
): Stretch[] {
  const out: Stretch[] = [];
  let at = fromMs;
  for (let guard = 0; guard < MOST && at < toMs; guard += 1) {
    const on = whatIsOn(channel, at);
    /*
     * NO FLOOR UNDER THIS. A minimum step was here against a
     * malformed turn whose end is not after its start — and it
     * survived every mutation, including a document carrying a
     * zero-length rotation entry, because `whatIsOn` never answers
     * with an end at or before the instant it was asked about. The
     * invariant is held by the test that asserts every stretch has
     * width, which is where it belongs; an untested guard against a
     * case the layer below forbids is a guard nobody can check.
     */
    const next = Math.min(toMs, endsAt(on) ?? at + STEP_MS);
    const last = out[out.length - 1];
    if (last && joinable(last.on, on)) last.toMs = next;
    else out.push({ fromMs: at, toMs: next, on });
    at = next;
  }
  return out;
}
