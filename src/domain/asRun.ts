/**
 * What actually went out.  [Doctrine CHANNEL §5, §18, D-18, D-20, C-32]
 *
 *     21:00:04  21:30:00  Everlasting Love      render  perf_9c13…
 *     21:30:00  21:34:00  —                     black   (nothing scheduled)
 *     21:34:00  21:58:00  History Discussion    render  perf_404f…
 *
 * THE AUDIT'S LAST OPEN ROW: *"As-run | None | A log of what actually
 * transmitted, which broadcasters need."*
 *
 * IT IS NOT THE AUDIT LOG, which this product already has. That one
 * records what somebody DID TO THE DOCUMENT — created a channel,
 * added a turn to the rotation — and it is a record of intentions.
 * This records what came out of the transmitter, which is a record
 * of outcomes, and the two disagree exactly when it matters: a
 * programme that was scheduled and never played appears in one and
 * not the other. That gap is the whole reason broadcasters keep an
 * as-run.
 *
 * NOR IS IT THE SCHEDULE WALKED. `airtime` answers *what will this
 * channel show*, from the document, for a timeline. This answers
 * *what did it show*, from the segments the engine actually wrote.
 * A channel whose encoder failed for ten minutes has an untouched
 * schedule and a very different as-run, and a log derived from the
 * document would report the ten minutes as perfect. [C-24]
 *
 * AND IT IS THE ONE THING HERE THAT IS AN ARCHIVE. D-18 is careful
 * that segments are transport and not an archive — written, served
 * for half a minute, swept. The as-run is the opposite by design: it
 * is what survives them, and nothing deletes it. It is also tiny,
 * because it is coalesced: four seconds at a time goes in, half-hour
 * stretches come out.
 */

import type { ProgrammeSource } from './channel.js';
import { SEGMENT_MS } from './playout.js';

/** One segment, as it was actually produced. */
export interface Aired {
  /** The segment index, which is also its instant. */
  index: number;
  /** What went out, or nothing when the channel had nothing on. */
  source: ProgrammeSource | null;
  /** What it was called at the time. Titles get edited; this does not. */
  title: string;
  /**
   * THE ENCODER COULD NOT RENDER IT AND PUT BLACK OUT INSTEAD.
   *
   * The fact C-24 existed to surface, and the reason an as-run
   * derived from the schedule would be worthless: those four seconds
   * were black on the wire and perfect in the document.
   */
  fellBack: boolean;
}

/** One continuous thing that was transmitted. */
export interface Ran {
  /** When it started, as an instant. */
  fromMs: number;
  /** When it stopped — exclusive, so stretches tile without gaps. */
  toMs: number;
  source: ProgrammeSource | null;
  title: string;
  /** How many of its segments the encoder could not render. */
  blackSegments: number;
  /** How many segments in total. `toMs - fromMs` over the segment length. */
  segments: number;
}

/** The key two segments must share to be one entry. */
function sameThing(a: Ran, b: Aired): boolean {
  if (a.title !== b.title) return false;
  const key = (source: ProgrammeSource | null) =>
    source === null ? '' : JSON.stringify(source);
  return key(a.source) === key(b.source);
}

/**
 * Fold one produced segment into the log.
 *
 * APPEND-ONLY AND IN ORDER, which is what makes this safe to call
 * from the engine's hot path: it either extends the last entry or
 * starts a new one, and never rewrites what is behind it.
 *
 * A GAP STARTS A NEW ENTRY even when the thing is the same. The
 * engine can be stopped and restarted, and two stretches of the same
 * programme either side of an outage are two stretches — joining
 * them would be the log claiming continuous transmission across the
 * hole it exists to record. [§18]
 */
export function fold(log: Ran[], aired: Aired): Ran[] {
  const fromMs = aired.index * SEGMENT_MS;
  const toMs = fromMs + SEGMENT_MS;
  const last = log[log.length - 1];
  if (last && last.toMs === fromMs && sameThing(last, aired)) {
    last.toMs = toMs;
    last.segments += 1;
    if (aired.fellBack) last.blackSegments += 1;
    return log;
  }
  log.push({
    fromMs,
    toMs,
    source: aired.source,
    title: aired.title,
    blackSegments: aired.fellBack ? 1 : 0,
    segments: 1,
  });
  return log;
}

/** How long a stretch ran, in whole seconds. */
export function secondsOf(ran: Ran): number {
  return Math.round((ran.toMs - ran.fromMs) / 1000);
}

/**
 * Did any of it fail to render?
 *
 * REPORTED AS A COUNT AND NOT A FLAG, because "three segments of a
 * thirty-minute programme were black" and "all of it was black" are
 * different events and a regulator asking about the second does not
 * want to be shown the first.
 */
export function wasClean(ran: Ran): boolean {
  return ran.blackSegments === 0;
}

const CELL = /[",\n\r]/;

/** One CSV field, quoted only where it has to be. */
function cell(text: string): string {
  return CELL.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const AS_RUN_COLUMNS = [
  'start', 'end', 'seconds', 'title', 'source', 'id', 'black_seconds',
] as const;

/**
 * The log as a broadcaster's spreadsheet.
 *
 * CSV BECAUSE THAT IS WHAT GETS HANDED OVER. An as-run is evidence —
 * for a regulator, a rights holder, an advertiser — and the people
 * who ask for one ask for a file they can open, not an endpoint they
 * can query. JSON is available from the same route for anybody
 * building on it.
 *
 * TIMES IN UTC AND IN FULL. A log whose timestamps are in the
 * channel's local zone is a log that is ambiguous for one hour every
 * autumn, which is exactly the hour somebody will ask about.
 */
export function asRunCsv(log: readonly Ran[]): string {
  const rows = log.map((ran) => [
    new Date(ran.fromMs).toISOString(),
    new Date(ran.toMs).toISOString(),
    String(secondsOf(ran)),
    ran.title,
    ran.source?.kind ?? 'none',
    ran.source === null ? ''
      : ran.source.kind === 'media' ? ran.source.assetId
        : ran.source.kind === 'render' ? ran.source.documentId
          : ran.source.kind === 'live' ? ran.source.ingestId : '',
    String(Math.round(ran.blackSegments * SEGMENT_MS / 1000)),
  ].map(cell).join(','));
  return [AS_RUN_COLUMNS.join(','), ...rows].join('\n') + (rows.length ? '\n' : '\n');
}
