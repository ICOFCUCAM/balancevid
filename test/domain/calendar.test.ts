/**
 * A date written by one machine and read by another.
 *   [Doctrine D-19, U-02; CHANNEL §2, §5]
 *
 * THE FAULT THESE ANSWER was a control room that failed to hydrate on
 * every load: the server wrote `Mon 05 Oct` into Studio Three's
 * schedule header and the browser re-derived `Mon, 05 Oct` from the
 * same instant with the same options, because Node ships CLDR 48 and
 * the browser ships an older one. React threw the centre column away
 * and drew it again.
 *
 * So these fix the SPELLING in this repository and leave the ZONE to
 * `Intl`, and the sharpest of them below patches `Intl` to lie about
 * names — the only way to prove, in one process, that two differently
 * versioned processes now agree.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  SHORT_MONTHS, SHORT_WEEKDAYS,
  civilDay, dayStamp, sameCivilDay, shortDay,
} from '../../src/domain/calendar.js';
import { blockAt, localDay } from '../../src/domain/channel.js';
import type { Channel } from '../../src/domain/channel.js';

/** Monday 5 October 2026, noon UTC. */
const MONDAY_NOON = Date.parse('2026-10-05T12:00:00.000Z');

describe('the civil day', () => {
  it('reads an instant on the wall of the place that is asking', () => {
    expect(civilDay(MONDAY_NOON, 'UTC')).toMatchObject({
      year: 2026, month: 10, day: 5, hour: 12, minute: 0, minuteOfDay: 720,
    });
    /* Tokyo is nine ahead: the same instant is nine in the evening. */
    expect(civilDay(MONDAY_NOON, 'Asia/Tokyo')).toMatchObject({
      year: 2026, month: 10, day: 5, hour: 21, minuteOfDay: 21 * 60,
    });
    /* Los Angeles is seven behind in October: five in the morning. */
    expect(civilDay(MONDAY_NOON, 'America/Los_Angeles')).toMatchObject({
      year: 2026, month: 10, day: 5, hour: 5, minuteOfDay: 300,
    });
  });

  /*
   * MIDNIGHT IS MINUTE ZERO, NOT MINUTE 1440. Left to the locale, the
   * hour cycle British English resolves to has moved between ICU
   * versions, and under `h24` midnight formats as `24` — so the
   * overnight block would start at a minute no day contains.
   */
  it('puts midnight at minute zero', () => {
    const midnight = Date.parse('2026-10-05T00:00:00.000Z');
    expect(civilDay(midnight, 'UTC').hour).toBe(0);
    expect(civilDay(midnight, 'UTC').minuteOfDay).toBe(0);
    expect(civilDay(midnight - 60_000, 'UTC').minuteOfDay).toBe(23 * 60 + 59);
  });

  it('crosses the date where the zone says, not where UTC does', () => {
    /* Eleven at night in London on the 5th is eight in the morning on
       the 6th in Tokyo. */
    const late = Date.parse('2026-10-05T23:00:00.000Z');
    expect(dayStamp(late, 'Europe/London')).toBe('2026-10-06');
    expect(dayStamp(late, 'Asia/Tokyo')).toBe('2026-10-06');
    expect(dayStamp(late, 'America/Los_Angeles')).toBe('2026-10-05');
    expect(sameCivilDay(late, MONDAY_NOON, 'America/Los_Angeles')).toBe(true);
    expect(sameCivilDay(late, MONDAY_NOON, 'Asia/Tokyo')).toBe(false);
  });

  /*
   * THE REASON THE ZONE STAYS WITH `Intl`. Arithmetic on the instant is
   * wrong twice a year, and the morning that moves is the bug nobody
   * can reproduce in summer.
   */
  it('keeps breakfast at breakfast across a clock change', () => {
    const marchMorning = Date.parse('2027-03-28T08:00:00.000Z');
    const juneMorning = Date.parse('2027-06-28T08:00:00.000Z');
    expect(civilDay(marchMorning, 'Europe/London').minuteOfDay).toBe(9 * 60);
    expect(civilDay(juneMorning, 'Europe/London').minuteOfDay).toBe(9 * 60);
  });
});

describe('the weekday', () => {
  it('is counted off the date', () => {
    const days = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
      '2026-10-08', '2026-10-09', '2026-10-10'];
    expect(days.map((day) => civilDay(Date.parse(`${day}T12:00:00Z`), 'UTC').weekday))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('turns over at local midnight, not at UTC midnight', () => {
    /* Monday 23:00 UTC is already Tuesday in Tokyo. */
    const late = Date.parse('2026-10-05T23:00:00.000Z');
    expect(civilDay(late, 'UTC').weekday).toBe(1);
    expect(civilDay(late, 'Asia/Tokyo').weekday).toBe(2);
  });
});

describe('the short day', () => {
  it('reads the way a module head needs it to', () => {
    expect(shortDay(MONDAY_NOON, 'UTC')).toBe('Mon 05 Oct');
    expect(shortDay(Date.parse('2026-01-01T12:00:00Z'), 'UTC')).toBe('Thu 01 Jan');
    expect(shortDay(Date.parse('2026-12-31T12:00:00Z'), 'UTC')).toBe('Thu 31 Dec');
  });

  it('pads the day, because a column that reflows is a column that is read twice', () => {
    expect(shortDay(Date.parse('2026-10-09T12:00:00Z'), 'UTC')).toHaveLength(10);
    expect(shortDay(Date.parse('2026-10-10T12:00:00Z'), 'UTC')).toHaveLength(10);
  });

  it('names the day the zone is in, not the one UTC is in', () => {
    const late = Date.parse('2026-10-05T23:00:00.000Z');
    expect(shortDay(late, 'Asia/Tokyo')).toBe('Tue 06 Oct');
    expect(shortDay(late, 'America/Los_Angeles')).toBe('Mon 05 Oct');
  });
});

/* ------------------------------------------------------------------- *
 *  The proof.
 * ------------------------------------------------------------------- */

/**
 * A SECOND MACHINE, IN THIS PROCESS.
 *
 * The real fault needed two ICU versions to show itself, and a test
 * suite has one. So `Intl.DateTimeFormat` is replaced with a version
 * that spells every name differently — a comma after the weekday, full
 * stops in the month — while leaving every NUMBER exactly as it was.
 * A date function that reads names off the platform changes its answer
 * under this; one that reads only numbers cannot.
 *
 * The zones below are used nowhere else in this file, because the real
 * formatters are cached per zone and a cached one would not be patched.
 */
function underADifferentCldr<T>(run: () => T): T {
  const real = Intl.DateTimeFormat;
  class Lying extends (real as unknown as { new(...a: unknown[]): Intl.DateTimeFormat }) {
    override formatToParts(date?: Date | number) {
      return (super.formatToParts as (d?: Date | number) =>
        Intl.DateTimeFormatPart[]).call(this, date).map((part) => (
        /* A NAME IS A PART THAT IS NOT A NUMBER. Numbers are the same
           in every version of every locale, so those are left alone —
           it is only the spelling that moves. */
        /^\d+$/.test(part.value) ? part : { ...part, value: `${part.value}.,` }
      ));
    }
  }
  (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = Lying;
  try {
    return run();
  } finally {
    (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = real;
  }
}

/**
 * A PLATFORM THAT COUNTS MIDNIGHT AS TWENTY-FOUR.
 *
 * `hour12: false` leaves the hour cycle to the locale, and a locale
 * that resolves to `h24` formats midnight as `24` rather than `00` —
 * minute 1440 of a day that has 1440 of them, so an overnight block
 * starting at midnight never starts at all.
 *
 * This is that platform: a formatter built WITHOUT a pinned hour cycle
 * reports midnight as `24`, and one built with `h23` is left alone. It
 * is the option under test that decides, not the fake.
 */
function onAnH24Platform<T>(run: () => T): T {
  const real = Intl.DateTimeFormat;
  class H24 extends (real as unknown as {
    new(locales?: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat;
  }) {
    readonly pinned: boolean;

    constructor(locales?: string, options?: Intl.DateTimeFormatOptions) {
      super(locales, options);
      this.pinned = Boolean(options?.hourCycle);
    }

    override formatToParts(date?: Date | number) {
      const parts = (super.formatToParts as (d?: Date | number) =>
        Intl.DateTimeFormatPart[]).call(this, date);
      if (this.pinned) return parts;
      return parts.map((part) => (
        part.type === 'hour' && Number(part.value) === 0
          ? { ...part, value: '24' }
          : part
      ));
    }
  }
  (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = H24;
  try {
    return run();
  } finally {
    (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = real;
  }
}

describe('a machine that counts midnight as twenty-four', () => {
  it('still starts the day at minute zero', () => {
    const midnight = Date.parse('2026-11-01T23:00:00.000Z');
    /* Midnight on the 2nd in Berlin, which is an hour ahead in November. */
    expect(onAnH24Platform(() => civilDay(midnight, 'Europe/Berlin')))
      .toMatchObject({ day: 2, hour: 0, minuteOfDay: 0 });
  });

  it('still puts the overnight block on the air at midnight', () => {
    const channel = {
      timezone: 'Europe/Berlin',
      blocks: [
        { id: 'blk_overnight', name: 'Overnight', fromMinute: 0, rotation: ['rot_a'] },
        { id: 'blk_breakfast', name: 'Breakfast', fromMinute: 7 * 60, rotation: ['rot_a'] },
      ],
      rotation: [{ id: 'rot_a' }],
    } as unknown as Channel;
    const midnight = Date.parse('2026-11-01T23:00:00.000Z');
    expect(onAnH24Platform(() => blockAt(channel, midnight)?.block.id))
      .toBe('blk_overnight');
  });
});

describe('a machine whose locale data disagrees', () => {
  it('still writes the same short day', () => {
    const at = Date.parse('2026-11-02T12:00:00.000Z');
    const honest = shortDay(at, 'Europe/Madrid');
    const lying = underADifferentCldr(() => shortDay(at, 'Europe/Lisbon'));
    expect(honest).toBe('Mon 02 Nov');
    expect(lying).toBe(honest);
  });

  it('still counts the same weekday', () => {
    const at = Date.parse('2026-11-02T12:00:00.000Z');
    expect(underADifferentCldr(() => civilDay(at, 'Europe/Dublin').weekday)).toBe(1);
    expect(underADifferentCldr(() => civilDay(at, 'Europe/Brussels').weekday)).toBe(1);
  });

  /*
   * AND THE SCHEDULE STILL RUNS ON THE RIGHT DAY. This is the half of
   * the fault that no screenshot would have shown: `localDay` found
   * the weekday by looking its short name up in a list, and a miss
   * returned -1, which `Math.max(0, …)` made Sunday. A channel whose
   * breakfast block ran on Sundays because a browser spelled `Mon`
   * with a full stop is a bug found by a viewer, not by a developer.
   */
  it('still puts a Monday block on the air on a Monday', () => {
    const channel = {
      timezone: 'Europe/Vienna',
      blocks: [{
        id: 'blk_morning', name: 'Breakfast', fromMinute: 7 * 60,
        days: [1], rotation: ['rot_a'],
      }],
      rotation: [{ id: 'rot_a' }],
    } as unknown as Channel;
    const mondayMorning = Date.parse('2026-11-02T08:00:00.000Z');

    expect(underADifferentCldr(() => localDay(channel, mondayMorning).weekday)).toBe(1);
    expect(underADifferentCldr(() => blockAt(channel, mondayMorning)?.block.id))
      .toBe('blk_morning');
  });
});

/* ------------------------------------------------------------------- *
 *  Nobody goes back to the platform for a name.
 * ------------------------------------------------------------------- */

/**
 * The file with its prose taken out.
 *
 * These rules are about what the code DOES, and every one of them is
 * explained in a comment directly above the line it governs — so a scan
 * of the raw file finds its own explanation and fails.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the rule', () => {
  it('keeps the names in this repository and not in the platform', () => {
    /* The formatter it builds asks for numbers only. */
    expect(code('src/domain/calendar.ts')).not.toMatch(/(weekday|month):\s*'(short|long|narrow)'/);
    expect(SHORT_WEEKDAYS).toHaveLength(7);
    expect(SHORT_MONTHS).toHaveLength(12);
  });

  /*
   * THE ORIGINAL SITE. Studio Three's schedule header is the markup
   * that failed to hydrate, and the way it fails again is for somebody
   * to reach for `toLocaleDateString` the next time a date is needed
   * there.
   */
  it('leaves no locale-named date in the room that failed to hydrate', () => {
    expect(code('app/t/[id]/ChannelStudio.tsx')).not.toMatch(/toLocaleDateString/);
    expect(code('app/t/[id]/ChannelStudio.tsx')).toMatch(/shortDay\(/);
  });

  /* And the schedule's own weekday is not a string lookup any more. */
  it('leaves no weekday-name lookup in the schedule', () => {
    expect(code('src/domain/channel.ts')).not.toMatch(/days\.indexOf/);
    expect(code('src/domain/channel.ts')).not.toMatch(/weekday:\s*'short'/);
  });
});
