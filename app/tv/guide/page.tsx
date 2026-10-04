import Link from 'next/link';

import {
  byGenre, directory, inDirectory, listingFor,
} from '../../../src/domain/channelListing.js';
import {
  GUIDE_STEP_MS, columnsFor, guideWindow, placeOf, rowFor,
} from '../../../src/domain/tvGuide.js';
import { listChannels } from '../../../src/store/channels.js';
import type { Assignments } from '../../../src/domain/registry.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { nowAndNext } from '../../../src/domain/onAir.js';
import Icon from '../../Icon.js';
import { TvFrame } from '../Tv.js';
import { asWord, markFor } from '../kinds.js';
import Grid, { GuideDate } from './Grid.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'TV guide — BalanceVid TV',
  description: 'What is on, across every channel on the BalanceVid network.',
};

/**
 * HOW FAR AHEAD THE GRID LOOKS, AND WHY THERE IS NO *WEEK*.
 *
 * The design this page was built against offers DAY and WEEK
 * beside the date. A week is not a longer version of this grid —
 * it is a different one. This grid's horizontal axis is time
 * itself, two hundred pixels to the hour; a week on that axis is
 * thirty-three thousand pixels. A real week view is a table of
 * seven DAY COLUMNS against channels, which is a second layout
 * answering a second question, and drawing a WEEK button that
 * quietly showed six hours would be the worse of the two
 * outcomes. [D-04, D-21]
 *
 * So the control offers the three reaches this grid can honestly
 * draw, and the hours per column widen with the span rather than
 * squeezing twenty-four headings into the same width.
 */
const SPANS = {
  '3': { says: '3 hours', hours: 3, step: GUIDE_STEP_MS },
  '6': { says: '6 hours', hours: 6, step: GUIDE_STEP_MS * 2 },
  '12': { says: '12 hours', hours: 12, step: GUIDE_STEP_MS * 4 },
} as const;
type SpanId = keyof typeof SPANS;

function spanFrom(said: string | undefined): SpanId {
  return said === '6' || said === '12' ? said : '3';
}

/** Two hundred pixels to the hour, whatever the span. */
const PER_HOUR = 200;
/**
 * What the channel column takes, matching `--gd-names` in the
 * sheet. The narrower phone value only ever makes the grid
 * smaller than this, which is the safe direction for a minimum.
 */
const NAMES = 220;

/**
 * The guide.  [TV-NETWORK N-5]
 *
 * > *"That is what makes hundreds of channels feel like a
 * > television network, rather than hundreds of independent web
 * > streams."*
 *
 * THE ROWS ARE BUILT ON THE SERVER AND THE CLOCK IS APPLIED ON THE
 * CLIENT. The walk needs the channel documents, which only this
 * machine has; the column headings need the VIEWER'S timezone,
 * which only their browser knows. Formatting the times here would
 * print the server's timezone to everybody — the fault the domain
 * module exists to avoid, committed at the last step. [§2]
 *
 * WHAT IS ON RIGHT NOW IS MARKED IN TWO PLACES and both are
 * instants rather than wall times, so neither needs a timezone:
 * the one block per row that contains `now`, and a hairline down
 * the grid. A guide snaps its first column BACKWARDS to the half
 * hour so that the programme in progress is visible, which means
 * *now* is almost never at the left edge — without the line, a
 * reader has to do arithmetic to tell what has already started.
 */
export default async function GuidePage(
  { searchParams }: {
    searchParams: Promise<{ genre?: string; span?: string }>;
  },
) {
  const { genre: asked, span: wanted } = await searchParams;
  const spanId = spanFrom(wanted);
  const span = SPANS[spanId];

  const channels = (await listChannels().catch(() => []));
  const lineup: Assignments = await lineupFor(channels.map((one) => one.id))
    .catch(() => ({}));

  const nowMs = Date.now();
  const { from, to } = guideWindow(nowMs, span.hours * 60 * 60 * 1000);
  const listed = channels.filter(inDirectory);

  /*
   * THE KINDS ARE COUNTED OFF THE WHOLE DIRECTORY AND NOT OFF
   * WHAT IS SHOWING. A sidebar whose counts changed when you
   * pressed one of them would be a sidebar you could not use to
   * choose the next one.
   */
  const all = directory(listed, lineup);
  const kinds = byGenre(all);
  /* A filter that can return nothing is never offered. [D-21] */
  const genre = kinds.some(([kind]) => kind === asked) ? asked : undefined;

  const rows = listed
    .map((channel) => {
      const listing = listingFor(channel, lineup[channel.id]);
      if (!listing) return null;
      if (genre && listing.genre !== genre) return null;
      return { ...rowFor(channel, listing, from, to), on: nowAndNext(channel, nowMs) };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    /*
     * BY NUMBER, UNLIKE THE DIRECTORY. A guide IS a lineup — it is
     * read down the channels in the order a remote steps through
     * them — where the directory is browsed by name. Two
     * orderings for two questions. A channel with no number goes
     * last rather than first, so an unnumbered one never sits at
     * the top of the grid. [D-04, N-6]
     */
    .sort((a, b) => (a.channel.number ?? Infinity) - (b.channel.number ?? Infinity)
      || a.channel.name.localeCompare(b.channel.name))
    .map((row) => ({
      channel: row.channel,
      live: row.on.live,
      slots: row.slots.map((slot) => ({
        ...slot,
        ...placeOf(slot, from, to),
        /*
         * ONE BLOCK PER ROW CAN ANSWER *what is on* — and an
         * instant is the same number in every timezone, so this
         * is decided here and not in the browser.
         *
         * AND *OFF AIR* IS NOT AN ANSWER TO IT. The highlight
         * means *this is the thing you can watch now*; painting
         * a dead hour in it would make a channel that is showing
         * nothing look like the one worth pressing. A channel
         * that is off has nothing on, and the row says so by
         * having no lit block in it. [D-21, U-19]
         */
        on: slot.kind !== 'off' && slot.fromMs <= nowMs && nowMs < slot.toMs,
      })),
    }));

  const kindLink = (kind: string | undefined) => {
    const held = new URLSearchParams();
    if (kind) held.set('genre', kind);
    if (spanId !== '3') held.set('span', spanId);
    const query = held.toString();
    return query ? `/tv/guide?${query}` : '/tv/guide';
  };
  const spanLink = (id: SpanId) => {
    const held = new URLSearchParams();
    if (genre) held.set('genre', genre);
    if (id !== '3') held.set('span', id);
    const query = held.toString();
    return query ? `/tv/guide?${query}` : '/tv/guide';
  };

  return (
    <TvFrame here="/tv/guide" bare>
      <div className="gd-head">
        <div className="gd-head-row">
          <div style={{ minWidth: 0 }}>
            <h1 className="gd-title">
              <Icon name="calendar" size={24} />
              TV guide
            </h1>
            <p className="gd-lede">
              What is on now and what follows, across every channel on the
              network, on your clock.
            </p>
          </div>
          <div className="gd-when">
            <span className="gd-date" data-testid="guide-date">
              <Icon name="calendar" size={14} />
              <GuideDate at={nowMs} />
            </span>
            <div className="gd-spans" role="group" aria-label="How far ahead">
              {(Object.keys(SPANS) as SpanId[]).map((id) => (
                <Link key={id} href={spanLink(id)} className="gd-span"
                      data-testid="guide-span"
                      {...(id === spanId ? { 'aria-current': 'page' as const } : {})}>
                  {SPANS[id].says}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="gd-body">
        {/*
          * THE KINDS, DOWN THE SIDE, COUNTED.
          *
          * A guide of a thousand channels is unreadable in one
          * scroll, and the cut a viewer actually makes is by what
          * kind of thing it is. Every entry here has channels
          * under it, because the one thing a person does with a
          * filter is press it. [D-21]
          */}
        <nav className="gd-kinds" data-testid="guide-kinds"
             aria-label="Kinds of channel">
          <Link href={kindLink(undefined)} className="gd-kind"
                {...(genre ? {} : { 'aria-current': 'page' as const })}>
            <span aria-hidden="true" className="gd-kind-mark">
              <Icon name="broadcast" size={13} />
            </span>
            <span className="gd-kind-name">All channels</span>
            <span className="gd-kind-count">{all.length}</span>
          </Link>
          {kinds.map(([kind, under]) => (
            <Link key={kind} href={kindLink(kind)} className="gd-kind"
                  data-testid="guide-kind"
                  {...(genre === kind ? { 'aria-current': 'page' as const } : {})}>
              <span aria-hidden="true" className="gd-kind-mark">
                <Icon name={markFor(kind)} size={13} />
              </span>
              <span className="gd-kind-name">{asWord(kind)}</span>
              <span className="gd-kind-count">{under.length}</span>
            </Link>
          ))}
        </nav>

        {rows.length === 0
          ? (
            <p className="muted" data-testid="tv-empty">
              No channels are listed yet. A channel appears here when its owner
              publishes it and asks to be listed.
            </p>
          )
          : (
            <Grid rows={rows} columns={columnsFor(from, to, span.step)}
                  from={from} to={to} nowMs={nowMs}
                  width={NAMES + span.hours * PER_HOUR}
                  track={span.hours * PER_HOUR} />
          )}
      </div>
    </TvFrame>
  );
}
