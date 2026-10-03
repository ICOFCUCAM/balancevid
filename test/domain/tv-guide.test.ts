/**
 * The grid.  [CHANNEL §2, §4, D-04, N-5]
 *
 * One clock for every channel, which is the whole problem: each
 * carries its own timezone, and a grid that drew each row in its
 * own would put 20:00 in twelve places.
 */

import { describe, expect, it } from 'vitest';

import { newChannel, setStation } from '../../src/domain/channelEdit.js';
import { listingFor } from '../../src/domain/channelListing.js';
import {
  GUIDE_SPAN_MS, GUIDE_STEP_MS, columnsFor, guideWindow, placeOf, rowFor,
} from '../../src/domain/tvGuide.js';

const MIN = 60_000;
const AT = Date.parse('2026-10-02T20:00:00.000Z');

function looping(zone: string, titles: string[], each = 30) {
  const channel = newChannel('A Channel', zone, new Date(AT).toISOString());
  setStation(channel, {});
  channel.rotation = titles.map((title, at) => ({
    id: `r${at}`, title, durationMs: each * MIN,
    source: { kind: 'media', assetId: `a${at}`, form: 'video' },
  })) as never;
  return channel;
}

describe('the window (N-5)', () => {
  /*
   * SNAPPED BACKWARDS so the first column is the one in progress.
   * A guide beginning at the current instant shows every programme
   * already started as though it started now, and what is on at
   * this moment is the thing a viewer most wants.
   */
  it('opens on the column already in progress', () => {
    const { from, to } = guideWindow(AT + 7 * MIN);
    expect(from).toBeLessThanOrEqual(AT + 7 * MIN);
    expect(from % GUIDE_STEP_MS).toBe(0);
    expect(to - from).toBe(GUIDE_SPAN_MS);
  });

  it('has a column per step', () => {
    const { from, to } = guideWindow(AT);
    const columns = columnsFor(from, to);
    expect(columns.length).toBe(GUIDE_SPAN_MS / GUIDE_STEP_MS);
    expect(columns[0]).toBe(from);
    expect(columns.every((at) => at < to)).toBe(true);
  });
});

describe('a row (N-5)', () => {
  it('is what is actually on, loop and all', () => {
    const channel = looping('Europe/London', ['Worship', 'Live Talk']);
    const row = rowFor(channel, listingFor(channel)!, AT, AT + 90 * MIN);
    expect(row.slots.map((s) => s.title))
      .toEqual(['Worship', 'Live Talk', 'Worship']);
  });

  /*
   * CLIPPED AT BOTH ENDS. A three-hour film that began an hour ago
   * starts before the grid does, and a row whose first slot has a
   * negative offset is drawn off the left of the page.
   */
  it('clips a programme that began before the window', () => {
    const channel = looping('Europe/London', ['Long Film'], 180);
    const row = rowFor(channel, listingFor(channel)!, AT + 60 * MIN, AT + 120 * MIN);
    expect(row.slots).toHaveLength(1);
    expect(row.slots[0]!.fromMs).toBe(AT + 60 * MIN);
    expect(row.slots[0]!.toMs).toBe(AT + 120 * MIN);
  });

  it('drops a slot the clipping empties', () => {
    const channel = looping('Europe/London', ['Worship']);
    const row = rowFor(channel, listingFor(channel)!, AT, AT);
    expect(row.slots).toEqual([]);
  });

  /*
   * ONE CLOCK. Two channels in different zones, both playing the
   * same thing at the same instant, must produce the same slot
   * boundaries — the grid is instants, and a locale is applied at
   * the edge where one is known.
   */
  it('puts two channels in different zones on one clock', () => {
    const london = looping('Europe/London', ['Worship', 'Talk']);
    const lagos = looping('Africa/Lagos', ['Worship', 'Talk']);
    const a = rowFor(london, listingFor(london)!, AT, AT + 60 * MIN);
    const b = rowFor(lagos, listingFor(lagos)!, AT, AT + 60 * MIN);
    expect(a.slots.map((s) => [s.fromMs, s.toMs]))
      .toEqual(b.slots.map((s) => [s.fromMs, s.toMs]));
  });

  it('carries the listing, never the channel document', () => {
    const channel = looping('Europe/London', ['Worship']);
    const row = rowFor(channel, listingFor(channel)!, AT, AT + 30 * MIN);
    expect(JSON.stringify(row.channel)).not.toContain('rotation');
    expect(row.channel.slug).toBeTruthy();
  });
});

describe('where a slot sits (N-5)', () => {
  /* A fraction, because the grid is drawn by a browser that knows
     its own width and this module does not know what a pixel is. */
  it('is a fraction of the window', () => {
    const place = placeOf({ fromMs: AT + 30 * MIN, toMs: AT + 60 * MIN },
      AT, AT + 120 * MIN);
    expect(place.left).toBeCloseTo(0.25);
    expect(place.width).toBeCloseTo(0.25);
  });

  it('never starts before the window or runs past its end', () => {
    const early = placeOf({ fromMs: AT - 90 * MIN, toMs: AT + 30 * MIN },
      AT, AT + 120 * MIN);
    expect(early.left).toBe(0);
    const late = placeOf({ fromMs: AT + 90 * MIN, toMs: AT + 900 * MIN },
      AT, AT + 120 * MIN);
    expect(late.left + late.width).toBeLessThanOrEqual(1);
  });

  it('says nothing about a window with no time in it', () => {
    expect(placeOf({ fromMs: AT, toMs: AT }, AT, AT)).toEqual({ left: 0, width: 0 });
  });
});

describe('the contract the row relies on (N-5)', () => {
  /*
   * `rowFor` CLIPPED EVERY STRETCH TO THE WINDOW and dropped the
   * empty ones. All three clauses survived every mutation, because
   * `airtime` already guarantees it: it starts at `fromMs`, stops
   * at `toMs`, and takes `Math.min(toMs, …)` for every end.
   *
   * Deleted, and the guarantee asserted here instead — which is
   * where a change to `airtime` that broke it would be caught,
   * rather than in a clause no test could reach.
   */
  it('airtime never hands back a stretch outside the window', () => {
    const channel = looping('Europe/London', ['Long Film'], 180);
    for (const [from, to] of [
      [AT + 60 * MIN, AT + 120 * MIN],
      [AT, AT + 30 * MIN],
      [AT - 500 * MIN, AT + 500 * MIN],
    ] as const) {
      for (const slot of rowFor(channel, listingFor(channel)!, from, to).slots) {
        expect(slot.fromMs, `${from}`).toBeGreaterThanOrEqual(from);
        expect(slot.toMs, `${to}`).toBeLessThanOrEqual(to);
        expect(slot.toMs).toBeGreaterThan(slot.fromMs);
      }
    }
  });
});
