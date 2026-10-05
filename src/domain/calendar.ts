/**
 * The civil day, spelled the same on every machine.
 *   [Doctrine D-19, U-02; CHANNEL §2, §5]
 *
 * THE FAULT THIS FILE EXISTS TO FIX, measured rather than reasoned:
 *
 *   Studio Three's schedule header rendered the day through
 *   `toLocaleDateString('en-GB', { weekday:'short', day:'2-digit',
 *   month:'short' })`. The server wrote `Mon 05 Oct` into the HTML;
 *   the browser hydrating it produced `Mon, 05 Oct`, so React threw
 *   out the whole centre column and drew it again — a hydration
 *   failure on every load of the control room.
 *
 *   NEITHER SIDE WAS WRONG. Node ships ICU 78 / CLDR 48, which
 *   dropped that comma from British English; the browser ships an
 *   older one, which keeps it. Same locale, same options, same
 *   instant, two strings. A date written by one machine and
 *   re-derived by another cannot come out of locale data, because
 *   locale data is a version, not a constant.
 *
 * SO THE NAMES LIVE HERE AND THE ZONE STILL DOES NOT. The part of a
 * date that is genuinely about the world — which day it is in Lagos
 * while it is still yesterday in Los Angeles — is exactly the part
 * `Intl` gets right and arithmetic gets wrong twice a year, so the
 * zone is still resolved through `Intl`. Only the SPELLING is taken
 * back: numbers out of the platform, names out of this file. The
 * control room already speaks one language by decision — every call
 * in it names `en-GB` — and these two tables are the one place to
 * change if it is ever to speak another.
 *
 * WHY NOT ASK THE PLATFORM FOR THE WEEKDAY NAME AND LOOK IT UP: that
 * is what `localDay` did, and a lookup that misses returns -1, which
 * `Math.max(0, …)` turned into Sunday. A channel whose breakfast
 * block ran on the wrong day because a browser spelled `Mon` with a
 * full stop is a bug nobody would find. The weekday here is counted,
 * not recognised.
 */

/** Sunday first, because `Date#getUTCDay` counts from Sunday. */
export const SHORT_WEEKDAYS = [
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
] as const;

export const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Where an instant falls on the wall of one place. */
export interface CivilDay {
  year: number;
  /** 1–12, as a person counts months. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0 Sunday … 6 Saturday, counted from the date, never recognised. */
  weekday: number;
  /** 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
  /** Minutes past local midnight, which is what a schedule is written in. */
  minuteOfDay: number;
}

/*
 * ONE FORMATTER PER ZONE. Building an `Intl.DateTimeFormat` is the
 * expensive part, and the schedule walk asks this question once per
 * five-minute step across a day — some hundreds of times for one
 * render of one lane.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function numericParts(timezone: string): Intl.DateTimeFormat {
  let formatter = FORMATTERS.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      /*
       * STATED, NOT INHERITED. `hour12: false` leaves the hour cycle to
       * the locale, and the cycle British English resolves to has moved
       * between ICU versions — under `h24` midnight formats as `24`,
       * which reads as minute 1440 of a day that has 1440 of them, so
       * the overnight block simply never starts. `h23` is the contract
       * this file needs, so this file says so.
       */
      hourCycle: 'h23',
    });
    FORMATTERS.set(timezone, formatter);
  }
  return formatter;
}

/**
 * The wall-clock reading of an instant, in one place, as numbers.
 *
 * Throws nothing on an unknown zone — `Intl` does that itself, loudly,
 * and a silent fall back to UTC is how a channel in Tokyo runs its
 * evening at lunchtime.
 */
export function civilDay(at: number, timezone: string): CivilDay {
  const parts = numericParts(timezone).formatToParts(new Date(at));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };
  const year = read('year');
  const month = read('month');
  const day = read('day');
  const hour = read('hour');
  const minute = read('minute');
  return {
    year,
    month,
    day,
    /*
     * COUNTED FROM THE DATE. `Date.UTC` of a y/m/d is a fixed point in
     * the proleptic Gregorian calendar, so its weekday is arithmetic —
     * no zone, no locale, no table.
     */
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
  };
}

/**
 * `2026-10-05` — the day itself, for comparing two instants.
 *
 * Sortable and unambiguous, which `05/10/2026` is neither of in a
 * product that is read in more than one country.
 */
export function dayStamp(at: number, timezone: string): string {
  const { year, month, day } = civilDay(at, timezone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
    + `-${String(day).padStart(2, '0')}`;
}

/** True when two instants land on the same date in one place. */
export function sameCivilDay(a: number, b: number, timezone: string): boolean {
  return dayStamp(a, timezone) === dayStamp(b, timezone);
}

/** `Mon 05 Oct` — short enough for a module head, written here, not looked up. */
export function shortDay(at: number, timezone: string): string {
  const { month, day, weekday } = civilDay(at, timezone);
  return `${SHORT_WEEKDAYS[weekday]} ${String(day).padStart(2, '0')} `
    + `${SHORT_MONTHS[month - 1]}`;
}
