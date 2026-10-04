/**
 * The grid.  [Doctrine CHANNEL §2, §4, D-04, TV-NETWORK N-5]
 *
 *               20:00       20:30       21:00
 *     ────────────────────────────────────────────
 *     Redemption TV
 *               Worship     Live Talk   Music
 *     Afrin Kong TV
 *               Cameroon    Fako        Uganda
 *
 * > *"That is what makes hundreds of channels feel like a
 * > television network, rather than hundreds of independent web
 * > streams."*
 *
 * ONE CLOCK FOR EVERY CHANNEL, WHICH IS THE WHOLE PROBLEM. Each
 * channel carries its own `timezone` and schedules against it, and
 * a grid that drew each row in its own zone would put 20:00 in
 * twelve places. The rows are drawn against the VIEWER'S clock —
 * instants, not wall times — and the formatting happens at the
 * edge where a locale is known. [§2]
 *
 * THE WALK IS `airtime`, which is the function the control room's
 * own timeline is drawn from, and it already answers "what is on
 * across this window" including the loop. A guide that read the
 * programme list alone would be a guide that lies about every gap
 * the loop fills, which is most of a channel's day. [§4, §5]
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Channel, OnAirKind, Programme } from './channel.js';
import {
  orderedProgrammes, programmeEnd, programmeStart,
} from './channel.js';
import { airtime } from './airtime.js';
import { viewerTitle } from './onAir.js';
import { type Listing } from './channelListing.js';

/** How much of the evening a guide shows at once. */
export const GUIDE_SPAN_MS = 3 * 60 * 60 * 1000;
/** The column width, in time. */
export const GUIDE_STEP_MS = 30 * 60 * 1000;

/**
 * WHAT A LISTED BLOCK CAN BE, which is one more than what can be
 * ON AIR: a booked live event is announced and not broadcast —
 * see `withBookings`. [§6]
 */
export type SlotKind = OnAirKind | 'live_event';

export interface Slot {
  fromMs: number;
  toMs: number;
  title: string;
  /**
   * WHAT SORT OF THING THIS IS, carried rather than inferred.
   *
   * A grid has to tell *Off air* from a programme — it must not
   * paint a dead hour in the colour it reserves for what you can
   * watch right now. The only other way to know is to compare the
   * title against the words `Off air`, which is a surface reading
   * a sentence this module wrote, and which stops being true the
   * first time anything is translated. [D-19]
   */
  kind: SlotKind;
}

export interface Row {
  channel: Listing;
  slots: Slot[];
}

/**
 * The window a guide opens on, snapped to the column.
 *
 * SNAPPED BACKWARDS so the first column is the one in progress. A
 * guide that began at the current instant would show every
 * programme already started as though it started now, and the
 * thing a viewer most wants from a guide is what is on at this
 * moment. [D-04]
 */
export function guideWindow(
  nowMs: number, spanMs = GUIDE_SPAN_MS, stepMs = GUIDE_STEP_MS,
): { from: number; to: number } {
  const from = Math.floor(nowMs / stepMs) * stepMs;
  return { from, to: from + spanMs };
}

/**
 * One channel's row.
 *
 * ALREADY CLIPPED, AND NOT CLIPPED AGAIN HERE.
 *
 * This re-clamped every stretch to the window and dropped the
 * empty ones, against a three-hour film that began before the grid
 * opened. All three clauses survived every mutation, because
 * `airtime` starts at `fromMs`, stops at `toMs` and takes
 * `Math.min(toMs, …)` for every end: a stretch outside the window
 * cannot come back from it.
 *
 * And `airtime` had already deleted a guard of its own for exactly
 * this reason, in words that apply unchanged one layer up:
 *
 * > *"an untested guard against a case the layer below forbids is
 * > a guard nobody can check."*
 *
 * The contract is asserted in the guide's own test instead, which
 * is where a change to `airtime` that broke it would be caught.
 * [the nineteenth]
 */
export function rowFor(
  channel: Channel, listing: Listing, fromMs: number, toMs: number,
): Row {
  const slots = airtime(channel, fromMs, toMs).map((stretch) => ({
    fromMs: stretch.fromMs,
    toMs: stretch.toMs,
    title: viewerTitle(channel, stretch.on),
    kind: stretch.on.kind,
  }));
  return { channel: listing, slots: withBookings(channel, slots, fromMs, toMs) };
}

/**
 * A BOOKED LIVE SLOT IS IN THE LISTING EVEN THOUGH IT IS NOT ON
 * THE WIRE.  [§6, N-5, D-21]
 *
 *     19:00  LIVE — Evening Discussion
 *
 * That line is the brief's own illustration of what `live_event`
 * is for, and until now no listing could draw it. `whatIsOn`
 * deliberately falls a booked slot THROUGH to whatever would
 * otherwise have been on, because *"a listing cannot make
 * somebody turn up"* and a channel must not go to black at
 * nineteen hundred over a late presenter. That is right for
 * playout and wrong for a guide: `airtime` is what is going out,
 * and a guide is what is ANNOUNCED. The whole point of booking
 * Friday on Monday is that people can see it.
 *
 * So the walk stays untouched — this is a second reading of the
 * same document laid over it, not a change to what the channel
 * broadcasts.
 *
 * A BOOKING LOSES TO A LIVE FEED AND TO AN ORDINARY PROGRAMME.
 * If somebody turned up, the feed IS the booking and the walk
 * already named it; if the schedule has something else on, two
 * programmes cannot be on air at once and the editor refuses it
 * anyway. A booking only replaces the FALLBACK — the loop and
 * the dead air it was holding open.
 */
function withBookings(
  channel: Channel, slots: Slot[], fromMs: number, toMs: number,
): Slot[] {
  /*
   * NOT FILTERED TO THE WINDOW HERE, AND THAT IS NOT AN
   * OVERSIGHT. A clause dropping bookings outside `fromMs`–
   * `toMs` survived every mutation at the boundary, because the
   * clipping below already decides it: a booking before the
   * window clips to a width of nothing and finds no slot to
   * overlap, and one after it clips the same way. An untested
   * guard against a case the next six lines forbid is a guard
   * nobody can check. [the twentieth]
   */
  /*
   * AND THIS TEST OVERLAPS THE ONE BELOW, WHICH IS WORTH SAYING
   * OUT LOUD. Replacing it with *every programme* changes no
   * output any test can reach, because `whatIsOn` returns
   * `programme` across exactly the range an ordinary programme
   * occupies, so an ordinary programme never finds a yielding
   * slot to displace. It stays because it is what this function
   * IS rather than a guard on it: `yields` enforces the rule and
   * this states it, and a reader who met only `yields` would
   * have to derive the subject of the function from the list of
   * things it leaves alone. [§6]
   */
  const booked = orderedProgrammes(channel).filter(
    (one) => one.source.kind === 'live_event');

  let out = slots;
  for (const one of booked) {
    const at = Math.max(fromMs, programmeStart(one));
    const until = Math.min(toMs, programmeEnd(one));
    /*
     * ONLY WHERE THE AIR IS FREE. A booking that overlapped a
     * live feed would announce an empty studio over a broadcast
     * that is actually happening.
     */
    const free = out.some((slot) => yields(slot.kind)
      && slot.fromMs < until && slot.toMs > at);
    if (!free) continue;
    out = carve(out, at, until, {
      fromMs: at, toMs: until, title: titleOf(one), kind: 'live_event',
    });
  }
  return out.sort((a, b) => a.fromMs - b.fromMs);
}

/** What a booking displaces: the loop, and the dead air. */
function yields(kind: SlotKind): boolean {
  return kind === 'off' || kind === 'rotation';
}

/**
 * The booked slot's own name.
 *
 * `LIVE — ` IS NOT PREFIXED HERE. The brief writes the line that
 * way and a reader does need to know, but a title is data and the
 * marker is presentation: the grid has `kind` on every slot and
 * draws it, the way it draws the one block that is on air now. A
 * title carrying its own badge is a title that cannot be
 * translated or shown without one. [D-19]
 */
function titleOf(one: Programme): string {
  const note = one.source.kind === 'live_event' ? one.source.note : undefined;
  return one.title ?? note ?? 'Live';
}

/** The row with `at`–`until` cut out of the yielding slots and `put` in. */
function carve(slots: Slot[], at: number, until: number, put: Slot): Slot[] {
  const out: Slot[] = [];
  for (const slot of slots) {
    if (!yields(slot.kind) || slot.fromMs >= until || slot.toMs <= at) {
      out.push(slot);
      continue;
    }
    if (slot.fromMs < at) out.push({ ...slot, toMs: at });
    if (slot.toMs > until) out.push({ ...slot, fromMs: until });
  }
  out.push(put);
  return out;
}

/**
 * Where a slot sits in the window, as a fraction.
 *
 * RETURNED AS A FRACTION rather than a pixel count, because the
 * grid is drawn by a browser that knows its own width and this
 * module does not get to know what a pixel is. The same decision
 * `across()` makes on the control room's timeline. [§2]
 */
export function placeOf(
  slot: { fromMs: number; toMs: number }, fromMs: number, toMs: number,
): { left: number; width: number } {
  const span = toMs - fromMs;
  if (span <= 0) return { left: 0, width: 0 };
  const left = (slot.fromMs - fromMs) / span;
  const width = (slot.toMs - slot.fromMs) / span;
  return { left: Math.max(0, left), width: Math.max(0, Math.min(1 - Math.max(0, left), width)) };
}

/** The column headings: an instant per step across the window. */
export function columnsFor(
  fromMs: number, toMs: number, stepMs = GUIDE_STEP_MS,
): number[] {
  const out: number[] = [];
  for (let at = fromMs; at < toMs; at += stepMs) out.push(at);
  return out;
}
