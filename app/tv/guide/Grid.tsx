'use client';

import Link from 'next/link';
import type React from 'react';

import type { SlotKind } from '../../../src/domain/tvGuide.js';
import type { Listing } from '../Tv.js';

interface Placed {
  fromMs: number; toMs: number; title: string;
  left: number; width: number; on: boolean; kind: SlotKind;
}

export interface GuideRow {
  channel: Listing;
  /** The channel is taking a live feed right now. */
  live: boolean;
  slots: Placed[];
}

/**
 * WHY EVERY TIME ON THIS PAGE IS WRITTEN BY THE BROWSER.
 *
 * Each channel carries its own `timezone` and schedules against
 * it; the grid is drawn against the VIEWER'S clock, which is a
 * thing only their machine knows. The server computed instants on
 * purpose and this is the edge where a locale finally exists. [§2]
 *
 * `suppressHydrationWarning` IS THE POINT RATHER THAN A PATCH:
 * the server's render of these characters is EXPECTED to differ
 * from the browser's, because the server is in the wrong timezone
 * by definition and the browser is the one that is right.
 */
function clockOf(at: number): string {
  return new Date(at)
    .toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Today, in the viewer's own calendar. */
export function GuideDate({ at }: { at: number }) {
  return (
    <span suppressHydrationWarning>
      {new Date(at).toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long',
      })}
    </span>
  );
}

/**
 * The grid, drawn.  [TV-NETWORK N-5]
 *
 * THE CHANNEL COLUMN AND THE HOUR HEADINGS DO NOT SCROLL AWAY.
 * Three hours is wider than a laptop, and a guide where you can
 * see a programme but no longer which channel it is on, or at
 * what time, has stopped being a guide. Both are sticky inside
 * the one scrolling box rather than drawn as a separate table,
 * because two tables side by side drift apart by a pixel per row.
 *
 * A SLOT TOO NARROW FOR ITS NAME SHOWS NOTHING RATHER THAN A
 * FRAGMENT — the lesson the control room's own strip learned the
 * hard way, where a day of eight-pixel blocks read `2: 5: 4036 9:2:
 * 5:`. Noise with the shape of text is harder to look past than an
 * empty block. The title stays on the `title` attribute, so the
 * block is still a thing you can ask about. [C-46]
 */
export default function Grid(
  { rows, columns, from, to, nowMs, width, track }: {
    rows: GuideRow[];
    columns: number[];
    from: number;
    to: number;
    nowMs: number;
    /** What the whole grid needs, in pixels, before it scrolls. */
    width: number;
    /** What the schedule itself needs, without the channel column. */
    track: number;
  },
) {
  const span = to - from;
  const across = (at: number) => ((at - from) / span) * 100;
  /*
   * THE LINE IS NOT DRAWN WHEN IT WOULD LAND ON THE EDGE. A
   * window that opens at `now` exactly — the half hour, on the
   * half hour — would put the hairline over the grid's own
   * border, where it reads as a rendering fault rather than as a
   * mark.
   */
  const herePct = across(nowMs);
  /*
   * WHAT FITS IS MEASURED IN PIXELS AND NOT IN FRACTIONS OF THE
   * WINDOW.
   *
   * The thresholds here were fractions — show the name above
   * seven per cent of the window — which is a rule that changes
   * its mind when the span does: the same half-hour programme
   * was labelled at three hours and a blank outlined box at six,
   * because six hours is twice as much window for it to be a
   * fraction of. A block is legible or not according to how many
   * pixels it has, which is a number this component is given.
   *
   * THE SMALLEST GRID IS THE ONE MEASURED. A wide window
   * stretches every block, so judging against the minimum hides
   * a little text that would have fitted and never shows a
   * fragment that does not. [C-46]
   */
  const px = (slot: Placed) => slot.width * track;
  /*
   * SEVENTY-EIGHT PIXELS IS WHERE A NAME BECOMES A NAME. Below
   * it the box fits three characters and an ellipsis — `The…`,
   * `Gra…`, `Gri…` down a column — which is the eight-pixel
   * block all over again: noise with the shape of text is harder
   * to look past than an empty block. The title is on `title`
   * either way. [C-46]
   */
  const NAME_PX = 78;
  /*
   * A BADGE IS A WHOLE WORD AND A CUT TITLE IS NOT, which is why
   * the badge gets the narrow blocks the name is refused. `LIVE`
   * at forty pixels tells a reader the true thing about that
   * block; `Gri…` at forty pixels tells them nothing and looks
   * like a fault. Where the block is wide enough for both they
   * both go in, and in between the NAME wins, because the badge
   * repeats what the tint already says. [C-46, D-21]
   */
  const BADGE_PX = 40;
  const BOTH_PX = 120;
  const showNow = herePct > 0.4 && herePct < 99.6;

  return (
    <div className="gd-grid" data-testid="tv-guide">
      <div className="gd-scroll">
        <div className="gd-inner" style={{ minWidth: width }}>
          <div className="gd-hours">
            <div className="gd-corner" />
            <div className="gd-hours-track">
              {columns.map((at) => (
                <span key={at} className="gd-hour mono readout"
                      data-testid="guide-column"
                      suppressHydrationWarning
                      style={{ left: `${across(at)}%` }}>{clockOf(at)}</span>
              ))}
            </div>
          </div>

          {rows.map((row) => (
            <div key={row.channel.slug} className="gd-line"
                 data-testid="guide-row" data-slug={row.channel.slug}>
              <Link href={`/tv/channels/${row.channel.slug}`} className="gd-who">
                {row.channel.number !== undefined && (
                  <span className="gd-num mono readout">{row.channel.number}</span>
                )}
                <span aria-hidden="true" className="gd-logo">
                  {row.channel.logoAssetId
                    /*
                      * THE STATION'S OWN ROUTE, NOT THE LIBRARY'S,
                      * which is owner-only and answered 401 to
                      * every signed-out viewer. [N-7]
                      */
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img alt="" src={`/api/tv/channels/${row.channel.slug}/logo`} />
                    : (row.channel.callsign
                        ?? row.channel.name.slice(0, 2).toUpperCase())}
                </span>
                <span className="gd-who-name">{row.channel.name}</span>
              </Link>
              <div className="gd-track">
                {row.slots.map((slot) => (
                  <div key={slot.fromMs} data-testid="guide-slot"
                       className="gd-slot" data-on={slot.on ? 'true' : 'false'}
                       data-kind={slot.kind}
                       suppressHydrationWarning
                       title={`${slot.title} — ${clockOf(slot.fromMs)}`}
                       style={{
                         left: `${slot.left * 100}%`,
                         width: `${slot.width * 100}%`,
                         minWidth: 3,
                       }}>
                    {/*
                      * THE LIVE DOT IS ON THE BLOCK THAT IS ON AIR
                      * AND NOWHERE ELSE. A channel taking a live
                      * feed is live NOW; marking its whole row
                      * would say the thing at the far right of the
                      * grid is live too, which is a claim about
                      * the future. [D-21, U-19]
                      */}
                    {slot.on && row.live && (
                      <span aria-hidden="true" className="gd-live-dot" />
                    )}
                    {/*
                      * `LIVE` ON A BOOKED SLOT, because that is
                      * what the brief's own listing line says —
                      * *19:00 LIVE — Evening Discussion* — and
                      * because it is the one block on the row
                      * whose picture does not exist yet. The
                      * badge is drawn and not written into the
                      * title, so the title stays data. [§6]
                      *
                      * THE NAME WINS THE ROOM, NOT THE BADGE.
                      * Drawn the other way round, a quarter-hour
                      * booking was a red box reading `LIVE` and
                      * nothing else — a guide telling you
                      * something is live without telling you
                      * what, which is the one question it
                      * exists to answer. The tint already says
                      * live; the badge is what goes in the room
                      * left over. [D-21]
                      */}
                    {slot.kind === 'live_event' && px(slot) >= BADGE_PX
                      && (px(slot) < NAME_PX || px(slot) >= BOTH_PX) && (
                      <span className="gd-booked">LIVE</span>
                    )}
                    {px(slot) >= NAME_PX && (
                      <span className="gd-slot-name">{slot.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/*
            * ONE LINE DOWN THE WHOLE GRID, drawn last and offset
            * past the channel column, because the question it
            * answers is about the clock and the clock does not
            * run through the names. It passes UNDER the sticky
            * column and the sticky headings, which is why it
            * carries no stacking order of its own.
            */}
          {showNow && (
            <span aria-hidden="true" className="gd-now" data-testid="guide-now"
                  style={{ '--gd-at': herePct / 100 } as React.CSSProperties} />
          )}
        </div>
      </div>
    </div>
  );
}
