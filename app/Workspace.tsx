'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import RecordMenu from './RecordMenu.js';
import SignOut from './SignOut.js';

/**
 * The workspace.  [Doctrine §19, §13, STUDIO-TWO §13, CHANNEL §13]
 *
 *   ┌──────────┬──────────────────────────────────────────────┐
 *   │ BalanceVid│ Search                            Sign out  │
 *   │          ├──────────────────────────────────────────────┤
 *   │ Home     │  Welcome back                                │
 *   │ Convers. │  ┌────────┐ ┌────────┐ ┌────────┐            │
 *   │ Studio 1 │  │STUDIO 1│ │STUDIO 2│ │ONLINE  │            │
 *   │ Studio 2 │  └────────┘ └────────┘ └────────┘            │
 *   │ Online TV│  Recent work                                 │
 *   │ Library  │  ▢ ▢ ▢ ▢                                     │
 *   │          │  Conversations · Performances · Channels     │
 *   │ Storage  │                                              │
 *   └──────────┴──────────────────────────────────────────────┘
 *
 * WHY A RAIL HERE AND A BAR IN THE STUDIOS. A studio is one room and its bar
 * says which room you are in. This is the building: it has to show every
 * room at once, and a horizontal strip that grows with the product is a
 * strip that starts truncating. The two carry the same places in the same
 * order, because a person who learns them here should recognise them there.
 *
 * NOTHING ON THIS PAGE IS DECORATION. Every nav row goes somewhere, the
 * storage figure is a measurement of this disk, the search filters what is
 * actually below it, and the card art is a frame from the person's own work
 * rather than a stock photograph of a studio they have never been in. A
 * dashboard with a notification bell behind which nothing ever happens is a
 * dashboard teaching people not to look at it.
 *
 * AND EVERY RECORD CAN BE THROWN AWAY. A library that only grows is a
 * library nobody keeps tidy, and most of what a studio makes is a failed
 * experiment. The one hazard is D-18: a channel schedules by reference, so
 * the server asks the channels before it deletes anything and refuses with
 * the name of the programme that would go off the air.
 */

export type Studio = 'one' | 'two' | 'tv';

export interface WorkRecord {
  id: string;
  kind: 'conversation' | 'performance' | 'channel';
  title: string;
  /** "7 responses · 02:04:39", already assembled by the server. */
  detail: string;
  /** `04:17`, drawn in the corner of the card. */
  duration: string | null;
  poster: string | null;
  href: string;
  updatedAt: string;
  published: boolean;
  live?: boolean;
}

export interface SpaceReading {
  used: string;
  free: string;
  total: string;
  fraction: number;
  partial: boolean;
}

const STUDIOS: {
  studio: Studio;
  kind: WorkRecord['kind'];
  label: string;
  name: string;
  blurb: string;
  accent: string;
  glyph: string;
  open: string;
}[] = [
  {
    studio: 'one', kind: 'conversation',
    label: 'STUDIO ONE', name: 'Conversation Studio',
    blurb: 'Watch, interrupt and respond to any video.',
    accent: '#2f6fd0', glyph: '▣', open: 'Open Studio One',
  },
  {
    studio: 'two', kind: 'performance',
    label: 'STUDIO TWO', name: 'Performance Studio',
    blurb: 'One song, many takes. Cut between them afterwards.',
    accent: '#7d56c4', glyph: '♪', open: 'Open Studio Two',
  },
  {
    studio: 'tv', kind: 'channel',
    label: 'ONLINE TV', name: 'Online TV',
    blurb: 'Run a 24/7 channel from what you have already made.',
    accent: '#1f8a70', glyph: '◉', open: 'Open Online TV',
  },
];

export default function Workspace({
  records, space, starters,
}: {
  records: WorkRecord[];
  space: SpaceReading;
  /** The three creation forms, rendered by the server page. */
  starters: { one: React.ReactNode; two: React.ReactNode; tv: React.ReactNode };
}) {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<Studio | null>(null);
  /*
   * A deleted record vanishes at once rather than after a round trip to the
   * server and a re-render of the whole page. The server has already agreed
   * — `RecordMenu` only calls this once the DELETE returned — so this is not
   * optimism, it is not making somebody watch a reload for a decision that
   * is already made.
   */
  const [gone, setGone] = useState<Set<string>>(new Set());

  const live = useMemo(
    () => records.filter((record) => !gone.has(record.id)), [records, gone]);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return live;
    return live.filter((record) =>
      record.title.toLowerCase().includes(needle)
      || record.detail.toLowerCase().includes(needle));
  }, [live, query]);

  const of = (kind: WorkRecord['kind']) =>
    matching.filter((record) => record.kind === kind);
  /* Unfiltered: the rail is the building, not the search result. */
  const newest = (kind: WorkRecord['kind']) =>
    live.find((record) => record.kind === kind);
  const recent = matching.slice(0, 8);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 208px) minmax(0, 1fr)',
      height: '100dvh', overflow: 'hidden',
    }}>
      {/* ============ THE RAIL ======================================== */}
      {/*
        * THE RAIL IS THE BUILDING AND SITS BEHIND THE ROOMS. It was the
        * same tone as the panels in the work area, so the two read as
        * one continuous surface with a line drawn down it. A shade
        * darker puts the navigation BEHIND the work — which is where
        * navigation belongs, and it costs one token. [D-24]
        */}
      <nav data-testid="workspace-rail" style={{
        display: 'flex', flexDirection: 'column', minHeight: 0,
        borderRight: 'var(--border) solid var(--line)',
        background: 'var(--ink-850)',
      }}>
        <div className="row" style={{
          gap: 9, padding: '15px 16px', flexWrap: 'nowrap', flex: '0 0 auto',
        }}>
          <span aria-hidden="true" style={{
            width: 28, height: 28, borderRadius: 8, display: 'grid',
            placeItems: 'center', background: '#2f7fe0', color: '#fff',
            fontSize: 13, paddingLeft: 2, flex: '0 0 auto',
          }}>&#9654;</span>
          <strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>BalanceVid</strong>
        </div>

        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '4px 10px' }}>
          {/*
            * THE SAME PLACES AS THE STUDIO BAR, IN THE SAME ORDER, so a
            * person who learns them here recognises them there. A studio row
            * opens the studio — the newest thing in it — because a tab that
            * scrolled to a list would be a second Conversations row wearing
            * a different name. With nothing in it yet, it says so and
            * scrolls to the door instead of leading nowhere. [§13]
            */}
          <Rail href="#top" glyph="&#9750;" label="Home" current />
          <Rail href="#conversations" glyph="&#9723;" label="Conversations"
                count={of('conversation').length} />
          <Rail href={newest('conversation')?.href ?? '#top'} glyph="&#9635;"
                label="Studio One" empty={!newest('conversation')} />
          <Rail href={newest('performance')?.href ?? '#top'} glyph="&#9834;"
                label="Studio Two" empty={!newest('performance')} />
          <Rail href={newest('channel')?.href ?? '#top'} glyph="&#9673;"
                label="Online TV" empty={!newest('channel')} />
          <Rail href="#library" glyph="&#9776;" label="Library"
                count={live.length} />
          {/*
            * NO "SHARED WITH ME" AND NO BELL. This instance has one owner and
            * nothing notifies anybody, so both would be rows that never do
            * anything — and a menu that lies is worse than a short one.
            */}
        </div>

        <div style={{ flex: '0 0 auto', padding: 12, borderTop: '1px solid var(--line)' }}>
          <div className="panel" data-testid="storage" style={{ padding: 10 }}>
            <div className="row" style={{ gap: 7, flexWrap: 'nowrap' }}>
              <span aria-hidden="true" style={{ fontSize: 12 }}>&#9098;</span>
              <span className="grow" style={{ fontSize: 11, fontWeight: 600 }}>
                Storage
              </span>
            </div>
            {/*
              * TWO MEASUREMENTS, SAID SEPARATELY. What this workspace holds
              * and what the disk has left are different numbers, and one
              * line reading "10 GB used" above a bar drawn at ninety per
              * cent is a widget contradicting itself.
              */}
            <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
              {space.partial && 'over '}{space.used} of work
            </div>
            <div className="muted" style={{ fontSize: 10 }}>
              {space.free} free of {space.total}
            </div>
            <div style={{
              height: 4, borderRadius: 2, background: 'var(--panel-2)',
              marginTop: 6, overflow: 'hidden',
            }} title={`The disk is ${Math.round(space.fraction * 100)}% full. `
              + `This workspace holds ${space.used} of that.`}>
              <div style={{
                height: '100%', width: `${Math.min(100, space.fraction * 100)}%`,
                minWidth: space.fraction > 0 ? 2 : 0,
                background: space.fraction > 0.9 ? '#c0392b'
                  : space.fraction > 0.75 ? '#c99a2e' : '#2f7fe0',
              }} />
            </div>
          </div>
        </div>
      </nav>

      {/* ============ THE WORKSPACE =================================== */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <header className="row" style={{
          gap: 12, padding: '11px 22px', flex: '0 0 auto', flexWrap: 'nowrap',
          borderBottom: '1px solid var(--line)', background: 'rgba(10,11,13,0.92)',
        }}>
          <label className="row" style={{
            gap: 8, flex: '1 1 0', maxWidth: 420, margin: 0, flexWrap: 'nowrap',
            padding: '0 11px', borderRadius: 9, background: 'var(--panel-2)',
            border: '1px solid var(--line)',
          }}>
            <span aria-hidden="true" className="muted" style={{ fontSize: 12 }}>
              &#9906;
            </span>
            <input
              data-testid="workspace-search" value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your work…"
              style={{
                border: 0, background: 'none', padding: '8px 0', fontSize: 13,
                width: '100%',
              }}
            />
            {query && (
              <button type="button" aria-label="Clear" onClick={() => setQuery('')}
                      style={{
                        border: 0, background: 'none', color: 'var(--muted)',
                        cursor: 'pointer', padding: '0 2px', fontSize: 13,
                      }}>&times;</button>
            )}
          </label>
          <span className="grow" />
          {/* The one that already existed. A second sign-out button would
              be a second place the cookie name can go out of date. [D-19] */}
          <SignOut />
        </header>

        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
          <div id="top" style={{ padding: '22px 22px 34px', maxWidth: 1280 }}>
            <h1 style={{ fontSize: 27, margin: '0 0 4px' }}>Welcome back</h1>
            <p className="muted" style={{ margin: '0 0 20px', fontSize: 14 }}>
              Respond, perform and broadcast — all in one place.
            </p>

            {/* ---- the three doors --------------------------------- */}
            <div style={{
              display: 'grid', gap: 14, marginBottom: 30,
              gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            }}>
              {STUDIOS.map((studio) => {
                const mine = live.filter((record) => record.kind === studio.kind);
                const newest = mine[0];
                return (
                  <section
                    key={studio.studio} data-testid="studio-card"
                    data-studio={studio.studio}
                    style={{
                      borderRadius: 13, overflow: 'hidden',
                      border: '1px solid var(--line)', background: 'var(--panel)',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {/*
                      * THE ART IS THE PERSON'S OWN WORK, not a stock photo of
                      * a studio. Three frames from the newest things they
                      * made in this room, and a tinted field when the room is
                      * empty — which is itself information.
                      */}
                    <div aria-hidden="true" style={{
                      height: 118, display: 'grid', gap: 2, padding: 0,
                      gridTemplateColumns: mine.length > 1 ? '2fr 1fr' : '1fr',
                      background: `linear-gradient(135deg, ${studio.accent}2e, #0b0d10)`,
                      position: 'relative',
                    }}>
                      {mine.slice(0, 1).map((record) => (
                        <Frame key={record.id} poster={record.poster}
                               accent={studio.accent} glyph={studio.glyph} />
                      ))}
                      {mine.length > 1 && (
                        <div style={{ display: 'grid', gap: 2, gridTemplateRows: '1fr 1fr' }}>
                          {mine.slice(1, 3).map((record) => (
                            <Frame key={record.id} poster={record.poster}
                                   accent={studio.accent} glyph={studio.glyph} />
                          ))}
                          {mine.length === 2 && (
                            <Frame poster={null} accent={studio.accent}
                                   glyph={studio.glyph} />
                          )}
                        </div>
                      )}
                      {mine.length === 0 && (
                        <span className="muted" style={{
                          position: 'absolute', inset: 0, display: 'grid',
                          placeItems: 'center', fontSize: 'var(--text-2xl)', opacity: 0.35,
                        }}>{studio.glyph}</span>
                      )}
                      {studio.studio === 'tv' && mine.some((r) => r.live) && (
                        <span style={{
                          position: 'absolute', right: 9, top: 9, padding: '2px 8px',
                          borderRadius: 4, background: '#c0392b', color: '#fff',
                          fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
                        }}>ON AIR</span>
                      )}
                    </div>

                    <div style={{
                      padding: 15, display: 'flex', flexDirection: 'column',
                      gap: 5, flex: '1 1 auto',
                    }}>
                      <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <span aria-hidden="true" style={{
                          width: 26, height: 26, borderRadius: 8, flex: '0 0 auto',
                          display: 'grid', placeItems: 'center', fontSize: 12,
                          background: studio.accent, color: '#fff',
                        }}>{studio.glyph}</span>
                        <span className="muted" style={{
                          fontSize: 9, letterSpacing: 1, fontWeight: 700,
                        }}>{studio.label}</span>
                      </span>
                      <strong style={{ fontSize: 17 }}>{studio.name}</strong>
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                        {studio.blurb}
                      </p>
                      <span className="grow" />
                      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        {newest ? (
                          <Link
                            href={newest.href} data-testid="open-studio"
                            style={{
                              flex: '1 1 0', textAlign: 'center', padding: '9px 12px',
                              borderRadius: 9, background: studio.accent,
                              color: '#fff', textDecoration: 'none', fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {studio.open} &rarr;
                          </Link>
                        ) : (
                          <button
                            type="button" data-testid="open-studio"
                            onClick={() => setOpened(studio.studio)}
                            style={{
                              flex: '1 1 0', padding: '9px 12px', borderRadius: 9,
                              background: studio.accent, borderColor: studio.accent,
                              color: '#fff', fontSize: 13, fontWeight: 600,
                            }}
                          >
                            {studio.open} &rarr;
                          </button>
                        )}
                        <button
                          type="button" data-testid="new-in-studio"
                          aria-label={`New in ${studio.name}`}
                          onClick={() => setOpened(
                            opened === studio.studio ? null : studio.studio)}
                          style={{
                            flex: '0 0 auto', width: 38, padding: '9px 0',
                            borderRadius: 9, fontSize: 15,
                          }}
                        >+</button>
                      </div>
                      {mine.length > 0 && (
                        <span className="muted" style={{ fontSize: 11 }}>
                          {mine.length} {mine.length === 1 ? 'here' : 'here'}
                        </span>
                      )}
                    </div>

                    {opened === studio.studio && (
                      <div style={{
                        padding: 15, borderTop: '1px solid var(--line)',
                        background: 'var(--panel-2)',
                      }} data-testid="starter">
                        {starters[studio.studio]}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {/* ---- recent work ------------------------------------- */}
            <div className="row" style={{ marginBottom: 10, flexWrap: 'nowrap' }}>
              <strong className="grow" style={{ fontSize: 16 }}>Recent work</strong>
              <a href="#library" className="small" style={{ fontSize: 12 }}>
                All of it &rarr;
              </a>
            </div>
            {recent.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                {query
                  ? `Nothing matches “${query}”.`
                  : 'Nothing yet. Open a studio above and make something.'}
              </p>
            ) : (
              <div style={{
                display: 'grid', gap: 12, marginBottom: 30,
                gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
              }}>
                {recent.map((record) => (
                  <Card key={record.id} record={record}
                        onDeleted={() => setGone((was) => new Set(was).add(record.id))} />
                ))}
              </div>
            )}

            {/* ---- the library, by studio -------------------------- */}
            <div id="library" />
            {STUDIOS.map((studio) => {
              const mine = of(studio.kind);
              if (mine.length === 0) return null;
              return (
                <section
                  key={studio.kind}
                  id={studio.kind === 'conversation' ? 'conversations'
                    : studio.kind === 'performance' ? 'performances' : 'channels'}
                  data-testid={`${studio.kind}-library`}
                  style={{ marginBottom: 26 }}
                >
                  <div className="row" style={{ marginBottom: 9, flexWrap: 'nowrap' }}>
                    <span aria-hidden="true" style={{
                      width: 8, height: 8, borderRadius: 2, flex: '0 0 auto',
                      background: studio.accent,
                    }} />
                    <strong className="grow" style={{ fontSize: 15 }}>
                      {studio.kind === 'conversation' ? 'Conversations'
                        : studio.kind === 'performance' ? 'Performances' : 'Channels'}
                    </strong>
                    <span className="muted" style={{ fontSize: 12 }}>{mine.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {mine.map((record) => (
                      <Row key={record.id} record={record}
                           onDeleted={() => setGone(
                             (was) => new Set(was).add(record.id))} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Rail({
  href, glyph, label, count, current, empty,
}: {
  href: string; glyph: string; label: string; count?: number;
  current?: boolean;
  /** Nothing in this room yet, so the row is dimmed and says why. */
  empty?: boolean;
}) {
  return (
    <a
      href={href} data-testid="rail-item" data-label={label}
      data-empty={empty ? 'true' : 'false'}
      title={empty ? `Nothing in ${label} yet — start something from the card`
        : undefined}
      /*
        * THE CURRENT ROOM IS MARKED ON THE RAIL'S EDGE, not only by a
        * tinted pill. A fill alone is one of several things in this
        * column with a background, and the eye has to compare them; a
        * bar on the leading edge is found without comparing, and it is
        * the convention every editor and every mail client uses for the
        * same reason.
        *
        * It also survives greyscale, which a blue wash does not — and
        * the rail is the one piece of this product somebody screenshots
        * to ask a question about. [D-04, U-19]
        */
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
        padding: 'var(--space-4) var(--space-4)',
        borderRadius: 'var(--radius-md)', textDecoration: 'none',
        fontSize: 'var(--text-base)',
        color: current ? '#fff' : 'var(--text-dim)',
        background: current ? 'rgba(63,142,232,0.16)' : 'transparent',
        boxShadow: current ? 'inset 2px 0 0 #3f8ee8' : 'none',
        fontWeight: current ? 'var(--weight-semi)' : 'var(--weight-medium)',
        marginBottom: 1,
        opacity: empty ? 0.42 : 1,
        transition: 'background-color var(--motion-fast) var(--ease-out),'
          + ' color var(--motion-fast) var(--ease-out)',
      }}
    >
      <span aria-hidden="true" style={{
        opacity: current ? 0.95 : 0.6, width: 14,
        fontSize: 'var(--text-sm)',
      }} dangerouslySetInnerHTML={{ __html: glyph }} />
      <span className="grow" style={{ minWidth: 0 }}>{label}</span>
      {count !== undefined && count > 0 && (
        /*
          * A COUNT IS A QUANTITY, NOT A LABEL. Tabular figures so the
          * numbers in this column line up with each other, and the
          * faintest tone because nobody comes to the rail to read a
          * number — they come to go somewhere, and the number is only
          * there to say whether it is worth going. [U-08]
          */
        <span className="mono" style={{
          fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
          fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      )}
    </a>
  );
}

/**
 * An <img> that removes itself when there is nothing behind it.
 *
 * A POSTER THAT 404s IS NOT A POSTER. Responses recorded before stills
 * existed have none, and a broken-image glyph in a card is worse than an
 * honest empty one: it reads as a fault in the product rather than as a
 * fact about an old recording.
 *
 * `onError` ALONE IS NOT ENOUGH, and this cost a round of looking at torn
 * icons in a screenshot. The browser fetches images while parsing the
 * server's HTML, so a 404 has usually already failed by the time React
 * hydrates and attaches the handler — the event fired into nothing. The
 * only reliable signal afterwards is the element itself: a finished load
 * with no pixels. So it is asked, once, on mount.
 */
function useStill(src: string | null) {
  const [broken, setBroken] = useState(false);
  const check = (element: HTMLImageElement | null) => {
    if (element?.complete && element.naturalWidth === 0) setBroken(true);
  };
  return {
    show: Boolean(src) && !broken,
    imgProps: {
      ref: check,
      onError: () => setBroken(true),
    },
  };
}

/** A frame of the person's own work, or the room's colour. */
function Frame({
  poster, accent, glyph,
}: { poster: string | null; accent: string; glyph: string }) {
  const { show, imgProps } = useStill(poster);
  return (
    <span style={{
      display: 'block', position: 'relative', overflow: 'hidden',
      background: show ? '#05070a' : `${accent}1f`,
    }}>
      {show && (
        <img alt="" src={poster!} {...imgProps}
             style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {!show && (
        <span aria-hidden="true" style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontSize: 15, opacity: 0.3,
        }}>{glyph}</span>
      )}
    </span>
  );
}

/** The same, at card size, with what to say when there is nothing. */
function Poster({
  poster, empty,
}: { poster: string | null; empty: string }) {
  const { show, imgProps } = useStill(poster);
  if (!show) {
    return (
      /*
        * THE SAME HATCH THE CONTROL ROOM USES FOR AN EMPTY SLOT, so a
        * recording with no still yet and a schedule slot with no source
        * look like the same kind of nothing in both studios. A flat
        * panel with a word on it reads as a failed image; hatching
        * reads as a slot that is simply not filled.
        */
      <span style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontSize: 'var(--text-2xs)', letterSpacing: '0.06em',
        fontWeight: 'var(--weight-semi)', color: 'var(--ink-400)',
        background: 'repeating-linear-gradient(45deg,'
          + ' var(--ink-800) 0 3px, var(--ink-750) 3px 6px)',
      }}>{empty}</span>
    );
  }
  return (
    <img alt="" src={poster!} {...imgProps}
         style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  );
}

function Card({
  record, onDeleted,
}: { record: WorkRecord; onDeleted: () => void }) {
  return (
    <div data-testid="recent-card" data-kind={record.kind} style={{
      borderRadius: 11, overflow: 'hidden', border: '1px solid var(--line)',
      background: 'var(--panel)',
    }}>
      <Link href={record.href} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{
          position: 'relative', aspectRatio: '16 / 9', background: '#0d1319',
        }}>
          <Poster
            poster={record.poster}
            empty={record.kind === 'channel' ? 'CHANNEL' : 'no still yet'}
          />
          {record.duration && (
            <span className="mono" style={{
              position: 'absolute', right: 6, bottom: 6, padding: '1px 6px',
              borderRadius: 4, background: 'rgba(5,7,10,0.85)', fontSize: 10,
            }}>{record.duration}</span>
          )}
          {record.live && (
            <span style={{
              position: 'absolute', left: 6, top: 6, padding: '1px 7px',
              borderRadius: 4, background: '#c0392b', color: '#fff',
              fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
            }}>ON AIR</span>
          )}
        </div>
      </Link>
      <div className="row" style={{ gap: 6, padding: '8px 10px', flexWrap: 'nowrap' }}>
        <Link href={record.href} className="grow" style={{
          minWidth: 0, textDecoration: 'none', color: 'inherit',
        }}>
          <span style={{
            display: 'block', fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semi)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{record.title}</span>
          <span className="muted" style={{
            display: 'block', fontSize: 'var(--text-2xs)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {record.detail}{record.published ? ' · published' : ''}
          </span>
        </Link>
        <RecordMenu record={record} onDeleted={onDeleted} />
      </div>
    </div>
  );
}

function Row({
  record, onDeleted,
}: { record: WorkRecord; onDeleted: () => void }) {
  return (
    <div className="row" data-testid="library-row" data-kind={record.kind} style={{
      gap: 11, padding: 8, borderRadius: 9, flexWrap: 'nowrap',
      background: 'var(--panel)', border: '1px solid var(--line)',
    }}>
      <Link href={record.href} className="row grow" style={{
        gap: 11, minWidth: 0, textDecoration: 'none', color: 'inherit',
        flexWrap: 'nowrap',
      }}>
        <span style={{
          width: 74, height: 42, borderRadius: 6, flex: '0 0 auto',
          overflow: 'hidden', position: 'relative', background: '#0d1319',
          border: '1px solid var(--line)',
        }}>
          <Poster poster={record.poster}
                  empty={record.live ? '●' : '—'} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{
            display: 'block', fontWeight: 600, fontSize: 13, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{record.title}</span>
          <span className="muted" style={{ display: 'block', fontSize: 11 }}>
            {record.detail}
            {record.published ? ' · published' : ''}
          </span>
        </span>
      </Link>
      {record.duration && (
        <span className="mono muted" style={{ flex: '0 0 auto', fontSize: 11 }}>
          {record.duration}
        </span>
      )}
      <RecordMenu record={record} onDeleted={onDeleted} />
    </div>
  );
}
