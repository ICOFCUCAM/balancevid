import Link from 'next/link';

import Icon from './Icon.js';
import Still from './Still.js';
import type { Room } from '../src/domain/rooms.js';

/**
 * The frame every production room stands in.
 *   [D-19, D-24, U-19; rooms.ts]
 *
 * *"The common BalanceVid shell can remain shared, but each room should
 * immediately communicate what kind of production is happening there."*
 *
 * ONE FRAME, THREE IDENTITIES, AND THE DIFFERENCE IS DATA. Studio One's
 * landing page was written first and invented this layout for itself;
 * writing it twice more would have produced three shells that drift —
 * the back link in a different place, the heading a different size, the
 * empty state phrased three ways. What varies between the rooms is in
 * `rooms.ts`, which is four fields, and what does not vary is here.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is arrange the room's contents. Each
 * room hands it a way in and a list, and those are genuinely different
 * work: a conversation has a source, a performance has takes, a channel
 * is on air or it is not. A frame that also tried to lay those out would
 * be a frame with three branches in it, which is three shells again with
 * extra steps.
 */
export default function Room({
  room, start, children,
}: {
  room: Room;
  /** The way in — this room's own intake. */
  start: React.ReactNode;
  /** What has been made here. */
  children: React.ReactNode;
}) {
  return (
    <div className="shell-scroll" data-testid="room" data-room={room.id}
         style={{
           padding: 'var(--space-7) var(--space-6)',
           maxWidth: 1080, margin: '0 auto',
         }}>
      <Link href="/" data-testid="back-home" className="small" style={{
        textDecoration: 'none', color: 'var(--muted)',
      }}>
        <span className="row" style={{ gap: 6 }}>
          <Icon name="chevron" size={11} turn={180} />Home
        </span>
      </Link>

      <h1 style={{
        fontSize: 'var(--text-2xs)', letterSpacing: '0.1em',
        fontWeight: 'var(--weight-bold)', color: 'var(--ink-400)',
        margin: '10px 0 0',
      }}>{room.label}</h1>

      {/*
        * THE SHAPE OF THE WORK, DRAWN.  [rooms.ts]
        *
        * `SOURCE → RESPONSE`, `TAKES → TIMELINE → MASTER`,
        * `PROGRAMME → PLAYOUT → LIVE`. The arrows are the product's own
        * glyph rather than the character, for the reason `StudioCard`
        * already gives: `→` is a different length, weight and baseline
        * in every font, and these sit beside type that must line up.
        *
        * IT IS NOT DECORATION AND IT IS NOT A DIAGRAM. It is the one
        * line that answers "what kind of production happens in here"
        * before a sentence has been read — and it is the only thing on
        * the page that is different in each of the three rooms for a
        * reason other than content.
        */}
      <p data-testid="room-stages" className="row" style={{
        gap: 8, margin: '8px 0 0', flexWrap: 'wrap',
        fontSize: 'var(--text-sm)', letterSpacing: '0.08em',
        fontWeight: 'var(--weight-semi)', color: 'var(--text-faint)',
      }}>
        {room.stages.map((stage, index) => (
          <span key={stage} className="row" style={{ gap: 8 }}>
            {index > 0 && (
              <span aria-hidden="true" style={{ color: 'var(--ink-450)' }}>
                <Icon name="arrow" size={12} />
              </span>
            )}
            {stage}
          </span>
        ))}
      </p>

      <p data-testid="room-says" style={{
        margin: '8px 0 0', fontSize: 'var(--text-md)',
        color: 'var(--text-faint)', maxWidth: 660,
        lineHeight: 'var(--leading-snug)',
      }}>{room.says}</p>

      <section style={{ marginTop: 'var(--space-6)' }} className="panel">
        {start}
      </section>

      {children}
    </div>
  );
}

/** One thing made in a room, as a row. */
export interface RoomRow {
  id: string;
  href: string;
  poster: string | null;
  title: string;
  /** Under the title — what it is, in this room's terms. */
  under: string;
  /**
   * The three right-hand columns.
   *
   * THREE, IN EVERY ROOM, and the same widths — because the three lists
   * are read by the same person on the same day and a column that moves
   * between them is a column they have to find again. What is IN them
   * differs entirely: where a source came from, how many takes there
   * are, whether a channel is on air.
   *
   * A `null` prints an em dash rather than an empty cell, because a
   * blank column reads as a rendering fault and this product's own rule
   * is that an unmeasured number is said to be unmeasured. [U-02]
   */
  facts: [string | null, string | null, string | null];
  /** Drawn as a lamp rather than as a word. */
  live?: boolean;
}

/**
 * What has been made in a room.
 *
 * THE SAME LIST IN ALL THREE, for the same reason the frame is the same:
 * three hand-written tables would have three row heights, three poster
 * sizes and three answers to what happens when a title is too long. The
 * one that matters is the last: `minmax(0, 1fr)` on the title column,
 * because a grid item will not shrink below its content without it —
 * which this project has already paid for once, in the Take App.
 */
export function RoomList({
  rows, heading, empty, more,
}: {
  rows: RoomRow[];
  heading: string;
  /** What to say when the room is empty, in the room's own noun. */
  empty: string;
  /** "All 161 in the Library", when there are more than are shown. */
  more?: React.ReactNode;
}) {
  /*
   * A COLUMN OF EMPTY WELLS IS NOT A COLUMN.
   *
   * A channel has no poster and never will — it is not a thing with a
   * first frame, it is a schedule — so the control room was printing a
   * 56px dark rectangle beside every row for a picture that cannot
   * exist. Where NOTHING in a list has one, the column goes; where some
   * rows have one and others do not, it stays, because then the gap is
   * information.
   */
  const pictures = rows.some((one) => one.poster !== null);
  return (
    <>
      <div className="row" style={{
        margin: '30px 0 12px', flexWrap: 'nowrap',
        alignItems: 'baseline', gap: 12,
      }}>
        <h2 className="grow" style={{
          margin: 0, minWidth: 0, fontSize: 'var(--text-lg)',
          letterSpacing: 'var(--tracking-tight)',
        }}>{heading}</h2>
        {more}
      </div>

      {rows.length === 0 ? (
        <p className="muted" data-testid="nothing-yet">{empty}</p>
      ) : (
        <div data-testid="room-list" className="panel" style={{ padding: 0 }}>
          {rows.map((one, index) => (
            /*
              * THE ROW'S COLUMNS ARE IN CSS, and this one was the last
              * inline grid in the building to move — it survived a
              * sweep because its value was a VARIABLE rather than a
              * string, which the rule's matcher did not look at. A
              * browser run at 412px found what that cost: five columns
              * needing 256px of fixed width left about fifty for the
              * title, so every performance in the list read "2 takes"
              * with no name at all.
              */
            <Link key={one.id} href={one.href} data-testid="room-row"
                  className={pictures ? 'room-row room-row-art' : 'room-row'}
                  style={{
                    textDecoration: 'none', color: 'inherit',
                    borderTop: index === 0 ? 'none'
                      : 'var(--border) solid var(--line)',
                  }}>
              {/*
                * A PICTURE IS ROUNDED LIKE A SCREEN, NOT LIKE A CARD.
                * `console.test.ts` holds that, and it caught this well
                * carrying `--radius-sm` — a card's corner on a monitor,
                * which is the difference between a thumbnail and a tile.
                * `--radius-screen` is 2px, deliberately.
                */}
              {pictures && (
                <span aria-hidden="true" style={{
                  width: 56, height: 32, borderRadius: 'var(--radius-screen)',
                  overflow: 'hidden', background: 'var(--surface-sunk)',
                  display: 'block', position: 'relative',
                }}>
                  <Still src={one.poster} />
                </span>
              )}
              <span style={{ minWidth: 0 }}>
                <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {/*
                    * ON AIR IS A LAMP AND A WORD, never a colour alone.
                    * Somebody who cannot separate the red loses nothing,
                    * which is the rule this product holds itself to
                    * everywhere a state is shown. [U-19]
                    */}
                  {one.live && (
                    <span data-testid="row-live" className="row" style={{
                      gap: 4, flex: '0 0 auto',
                      fontSize: 'var(--text-2xs)',
                      fontWeight: 'var(--weight-bold)',
                      letterSpacing: '0.08em', color: 'var(--bad)',
                    }}>
                      <span aria-hidden="true" style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--bad)',
                      }} />
                      ON AIR
                    </span>
                  )}
                  <span style={{
                    minWidth: 0, fontWeight: 'var(--weight-medium)',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>{one.title}</span>
                </span>
                <span className="small muted" style={{
                  display: 'block', fontSize: 'var(--text-2xs)',
                }}>{one.under}</span>
              </span>
              {one.facts.map((fact, column) => (
                <span key={column} className="small muted room-fact"
                      data-testid="room-fact" data-fact={column}
                      style={{
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: column === 2 ? 'right' : 'left',
                      }}>{fact ?? '—'}</span>
              ))}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
