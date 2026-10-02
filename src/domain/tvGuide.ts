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

import type { Channel } from './channel.js';
import { airtime } from './airtime.js';
import { viewerTitle } from './onAir.js';
import { type Listing } from './channelListing.js';

/** How much of the evening a guide shows at once. */
export const GUIDE_SPAN_MS = 3 * 60 * 60 * 1000;
/** The column width, in time. */
export const GUIDE_STEP_MS = 30 * 60 * 1000;

export interface Slot {
  fromMs: number;
  toMs: number;
  title: string;
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
  }));
  return { channel: listing, slots };
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
