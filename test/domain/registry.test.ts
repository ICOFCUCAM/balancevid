/**
 * Channel numbers.  [CHANNEL §2, D-04, D-18, N-6]
 *
 * > *"I would not allow every user to choose any number they
 * > want."*
 *
 * Allocated, never chosen, which is why this is a record the owner
 * does not reach rather than a field on a document they edit.
 */

import { describe, expect, it } from 'vitest';

import {
  FIRST_NUMBER, LAST_NUMBER, lineupOf, numberFor, numberSays, takenNumbers,
  tuneFrom, usableNumber,
} from '../../src/domain/registry.js';

describe('what a number may be (N-6)', () => {
  /*
   * 000–099 IS THE NETWORK'S OWN. The one part of the brief's
   * namespace kept, because it is not a category: a station
   * taking CH 1 would be taking the front of a lineup it does
   * not own.
   */
  it('starts above the network’s own range', () => {
    expect(FIRST_NUMBER).toBe(100);
    expect(usableNumber(99)).toBe(false);
    expect(usableNumber(100)).toBe(true);
  });

  it('ends where a keypad does', () => {
    expect(usableNumber(LAST_NUMBER)).toBe(true);
    expect(usableNumber(LAST_NUMBER + 1)).toBe(false);
    expect(String(LAST_NUMBER).length).toBeLessThanOrEqual(4);
  });

  /* Checked rather than assumed, because assignments come off
     disk where a hand-edited file can say anything. */
  it('refuses anything that is not a whole number in range', () => {
    for (const bad of [100.5, NaN, Infinity, -1, 0, '102', null, undefined, {}]) {
      expect(usableNumber(bad), String(bad)).toBe(false);
    }
  });
});

describe('allocation (N-6)', () => {
  it('gives the first channel the first number', () => {
    expect(numberFor({}, 'chan_a')).toBe(FIRST_NUMBER);
  });

  /*
   * IDEMPOTENT, which is the property everything else depends on.
   * Asking twice gives the same answer and never moves a channel
   * that already has one.
   */
  it('gives a channel the number it already has', () => {
    const held = { chan_a: 177 };
    expect(numberFor(held, 'chan_a')).toBe(177);
    expect(numberFor(held, 'chan_a')).toBe(177);
  });

  it('never moves a channel because another arrived', () => {
    const held = { chan_a: 100, chan_b: 101 };
    const given = numberFor(held, 'chan_c');
    expect(given).toBe(102);
    expect(numberFor({ ...held, chan_c: given }, 'chan_a')).toBe(100);
    expect(numberFor({ ...held, chan_c: given }, 'chan_b')).toBe(101);
  });

  it('fills the lowest gap a deletion left', () => {
    expect(numberFor({ chan_a: 100, chan_c: 102 }, 'chan_new')).toBe(101);
  });

  /* A number nothing can use does not reserve anything. */
  it('ignores a corrupt assignment when choosing', () => {
    expect(numberFor({ chan_a: 'rubbish' as never }, 'chan_b')).toBe(FIRST_NUMBER);
    expect(numberFor({ chan_a: 7 }, 'chan_b')).toBe(FIRST_NUMBER);
  });

  it('gives a channel whose own number is corrupt a real one', () => {
    expect(numberFor({ chan_a: 3 }, 'chan_a')).toBe(FIRST_NUMBER);
  });

  /*
   * A FULL LINEUP IS NOT A CRASH. Throwing would take down the
   * directory for every channel that does have a number, and zero
   * is outside the usable range by construction, so it reads as
   * "no number" wherever one is drawn.
   */
  it('answers with no number rather than throwing when full', () => {
    const full: Record<string, number> = {};
    for (let at = FIRST_NUMBER; at <= LAST_NUMBER; at += 1) full[`c${at}`] = at;
    expect(numberFor(full, 'chan_new')).toBe(0);
    expect(usableNumber(numberFor(full, 'chan_new'))).toBe(false);
  });
});

describe('which numbers are spoken for (N-6)', () => {
  it('collects them', () => {
    expect([...takenNumbers({ a: 100, b: 101 })].sort()).toEqual([100, 101]);
  });

  /*
   * THE FILTER IS WHAT MAKES THE RETURN TYPE TRUE. This reads a
   * record that comes off disk, and a `Set<number>` that can
   * contain `'rubbish'` is a lie told in the type system's own
   * words. It survived every mutation about *choosing* a number,
   * because a corrupt entry blocks nothing either way — so it is
   * asserted on the contract instead.
   */
  it('holds only numbers a channel could actually have', () => {
    const fromDisk = {
      a: 100, b: 'rubbish' as never, c: 7, d: 100.5 as never,
      e: null as never, f: 102,
    };
    const taken = takenNumbers(fromDisk);
    expect([...taken].sort((x, y) => x - y)).toEqual([100, 102]);
    for (const number of taken) expect(usableNumber(number)).toBe(true);
  });
});

describe('the lineup (N-6)', () => {
  /*
   * ORDERED BY NUMBER, which is what a channel number is for. The
   * directory can be alphabetical because a viewer browsing wants
   * names; a lineup is read in the order the numbers go.
   */
  it('is in number order, not in document order', () => {
    const rows = lineupOf(
      [{ id: 'z' }, { id: 'a' }, { id: 'm' }],
      { z: 104, a: 102, m: 103 });
    expect(rows.map((r) => r.number)).toEqual([102, 103, 104]);
    expect(rows.map((r) => r.channel.id)).toEqual(['a', 'm', 'z']);
  });

  it('leaves out a channel with no number', () => {
    const rows = lineupOf([{ id: 'a' }, { id: 'b' }], { a: 102 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.channel.id).toBe('a');
  });
});

describe('the remote (N-6)', () => {
  const LINEUP = [102, 103, 107];

  it('steps up and down the lineup', () => {
    expect(tuneFrom(LINEUP, 102, 1)).toBe(103);
    expect(tuneFrom(LINEUP, 103, -1)).toBe(102);
  });

  /*
   * IT WRAPS, because a lineup is a ring on every television ever
   * made. A viewer who presses CH− on the first channel and goes
   * nowhere thinks the set is broken.
   */
  it('wraps at both ends', () => {
    expect(tuneFrom(LINEUP, 107, 1)).toBe(102);
    expect(tuneFrom(LINEUP, 102, -1)).toBe(107);
  });

  /* A channel removed while somebody is watching it. */
  it('lands on the nearest in the direction asked', () => {
    expect(tuneFrom(LINEUP, 105, 1)).toBe(107);
    expect(tuneFrom(LINEUP, 105, -1)).toBe(103);
    expect(tuneFrom(LINEUP, 999, 1)).toBe(102);
    expect(tuneFrom(LINEUP, 1, -1)).toBe(107);
  });

  it('has nowhere to go in a lineup of one or none', () => {
    expect(tuneFrom([102], 102, 1)).toBe(null);
    expect(tuneFrom([], 102, 1)).toBe(null);
    expect(tuneFrom([102], 999, 1)).toBe(102);
  });

  it('ignores numbers that are not numbers', () => {
    expect(tuneFrom([102, 7, 103, NaN as never], 102, 1)).toBe(103);
  });
});

describe('what a number looks like (N-6)', () => {
  it('reads as a channel', () => {
    expect(numberSays(102)).toBe('CH 102');
  });

  it('says nothing for a channel that has none', () => {
    expect(numberSays(undefined)).toBe('');
    expect(numberSays(0)).toBe('');
  });
});
