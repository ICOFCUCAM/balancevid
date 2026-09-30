'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon, { type IconName } from './Icon.js';
import Still from './Still.js';
import { BuildingRail, type SpaceReading } from './Rail.js';
import { MARK } from './platformMark.js';
import { roomFor } from '../src/domain/rooms.js';
import type { StudioId } from '../src/domain/account.js';
import { MenuButton, RightClickHint, useMenu, type MenuEntry } from './Menu.js';
import { useRecordActions } from './RecordMenu.js';
import AccountMenu, { GroundToggle } from './AccountMenu.js';

/**
 * The workspace.  [Doctrine §19, §13, D-24, STUDIO-TWO §13, CHANNEL §13]
 *
 *   ┌──────────┬───────────────────────────────────┬───────────┐
 *   │BalanceVid│ Search              ⌘K   🔔  James │  Local    │
 *   │          ├───────────────────────────────────┴───────────┤
 *   │ Home     │ WELCOME BACK                                  │
 *   │ Studio 1 │ Good evening, James.          Thu 26 Sep 23:58│
 *   │ Studio 2 │ ┌───────────────────────────┐ ┌─────────────┐ │
 *   │ Online TV│ │ ▶  Redemption TV  OFF AIR │ │Distribution │ │
 *   │ Library  │ │    Next — · 0 today       │ │ BalanceVid ●│ │
 *   │ ──────── │ └───────────────────────────┘ │ YouTube    ○│ │
 *   │ Channels │ Your production               └─────────────┘ │
 *   │ Distrib. │ ┌──────┐┌──────┐┌──────┐     ┌─────────────┐ │
 *   │ Settings │ │ One  ││ Two  ││  TV  │     │Quick actions│ │
 *   │          │ └──────┘└──────┘└──────┘     └─────────────┘ │
 *   │ Storage  │ Recent work …                                 │
 *   └──────────┴───────────────────────────────────────────────┘
 *
 * WHY A RAIL HERE AND A BAR IN THE STUDIOS. A studio is one room and its
 * bar says which room you are in. This is the building: it has to show
 * every room at once, and a horizontal strip that grows with the product
 * is a strip that starts truncating. The two carry the same places in the
 * same order, because a person who learns them here should recognise them
 * there.
 *
 * THE RAIL IS DARK AND THE WORK IS LIT, which is the shape of the whole
 * decision. DESIGN.md argues the product has no light theme and gives the
 * reason — a broadcast desk is operated in a dark room beside a live
 * monitor — and that reason is about the STUDIOS. The building is where
 * somebody arrives, reads and chooses, in daylight, on a laptop, with no
 * picture on screen to be judged. So the lobby is lit, navigation stays
 * behind the work where it belongs, and stepping into a studio is
 * stepping into a dark room on purpose. [D-24, and `styles/building.css`]
 *
 * NOTHING ON THIS PAGE IS DECORATION, and this is the rule that decided
 * every argument while it was being built:
 *
 *   The bell is silent unless the render queue has something in hand or
 *     something has failed. It is wired to `listJobs`, so it cannot show
 *     a dot that means nothing.
 *   The badge under the name says Owner, because there is one account and
 *     that is what it is. Not "Administrator", which implies others.
 *   The runtime pill says where this instance is actually running, read
 *     off the machine — Local on a laptop, the platform's name when the
 *     platform says so, "Self-hosted" when nobody says anything. It never
 *     guesses a brand.
 *   Every destination row says connected or not connected, truthfully.
 *     Four of the five are not, and saying so is the point: the panel
 *     answers "what could I connect", which is the question somebody
 *     looking at it has.
 *   The storage figure is this disk. The version is the one in
 *     package.json. The clock is the browser's.
 *
 * A dashboard with a bell behind which nothing ever happens is a dashboard
 * teaching people not to look at it.
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



export interface HeroChannel {
  id: string;
  name: string;
  href: string;
  timezone: string;
  live: boolean;
  onAir: string | null;
  next: { title: string; startsAt: string } | null;
  today: number;
  inLoop: number;
  destinations: {
    kind: string;
    label: string;
    state: 'connected' | 'off' | 'none';
  }[];
}

const STUDIOS: {
  studio: Studio;
  /*
   * THE ENTITLEMENT'S NAME FOR THE SAME THING.  [MASTER-EDIT §11, D-19]
   *
   * This file has called them `one | two | tv` since before an account
   * could own some and not others, and `src/domain/account.ts` calls them
   * `studio-one | studio-two | online-tv` because that is what a plan is
   * sold under. Two vocabularies for three things is one too many, and the
   * cheap fix — rename everything here — is a churn diff across a
   * fourteen-hundred-line file whose only content is the rename.
   *
   * So the mapping lives in the table that already names them, once, where
   * anybody adding a fourth studio has to fill it in.
   */
  id: StudioId;
  kind: WorkRecord['kind'];
  /**
   * WHAT THE ROOM IS CALLED IS NOT HERE ANY MORE.
   *
   * `label`, `name` and the entrance verb were fields of this table and
   * are now `rooms.ts`, read through `roomFor(id)`. They were duplicated
   * the moment a room had a page of its own — the card said
   * "Conversation Studio" and so did the page, from two different
   * string literals — and two copies of a name is how a rail and a card
   * come to disagree about what a room is called. [D-19]
   *
   * WHAT STAYS IS HOW A ROOM LOOKS ON THIS PAGE: its colour, its veil,
   * its photograph, its glyph, and the one line of pitch that only a
   * card needs. That is genuinely this file's business.
   */
  blurb: string;
  /**
   * THE PHOTOGRAPH, THE VEIL AND THE ACCENT MOVED TO `rooms.ts`.
   *
   * The argument for keeping them here was that they are "how a room
   * looks on this page". That held while the card was the only place a
   * room appeared; the room's own front door now shows the same
   * photograph under the same veil, so they belong to the room. What
   * stays is the wash, the glyph and the one line of pitch that only a
   * card needs. [D-19]
   */
  wash: string;
  /**
   * A PHOTOGRAPH OF THE ROOM THIS DOOR OPENS ON.
   *
   * Not a stock picture of "a studio": a conversation being recorded
   * at a desk with two microphones and the video under discussion on
   * the wall; a band playing to four cameras and a quad monitor; a
   * gallery cutting a programme to air. Each one shows the thing the
   * room is FOR, which is the only reason a photograph earns its
   * place on a card that already says the name in words.
   *
   * SERVED FROM `public/rooms/`, built by `scripts/room-art.mjs` from
   * the masters in `art/`.
   */
  icon: IconName;
}[] = [
  {
    studio: 'one', id: 'studio-one', kind: 'conversation',
    /*
     * *"The dashboard should simply say: Conversation Studio / Watch,
     * interrupt and respond to video, audio and live sources."* — with
     * "live sources" left out, because it is not built and the author
     * marked it Later himself. A card that lists a door which is not
     * there is the one kind of brevity this product cannot afford.
     */
    blurb: 'Watch, interrupt and respond to video, audio, a screen or '
      + 'your own camera.',
    wash: 'var(--studio-one-wash)', icon: 'conversation',
  },
  {
    studio: 'two', id: 'studio-two', kind: 'performance',
    blurb: 'One song, many takes. Cut between them afterwards, in a room '
      + 'you choose.',
    wash: 'var(--studio-two-wash)', icon: 'music',
  },
  {
    studio: 'tv', id: 'online-tv', kind: 'channel',
    blurb: 'Run a 24/7 channel from what you have already made, and go '
      + 'live to your audience.',
    wash: 'var(--studio-tv-wash)', icon: 'broadcast',
  },
];

export default function Workspace({
  records, space, account, runtime, pending, hero, version, owned,
}: {
  /**
   * The studios this account has.  [MASTER-EDIT §11]
   *
   * A courtesy and not the boundary: `isOwner` refuses a studio this
   * account does not have, whatever this bar chooses to draw, because "a
   * check in an interface is one refactor away from not being in the path".
   * What this buys is that nobody is shown a door they cannot open.
   */
  owned: StudioId[];
  records: WorkRecord[];
  space: SpaceReading;

  account: { name: string; role: string };
  runtime: { label: string; hosted: boolean };
  pending: { working: number; waiting: number; failed: number };
  hero: HeroChannel | null;
  version: string;
}) {
  const [query, setQuery] = useState('');
  /*
   * A deleted record vanishes at once rather than after a round trip to the
   * server and a re-render of the whole page. The server has already agreed
   * — the action only calls back once the DELETE returned — so this is not
   * optimism, it is not making somebody watch a reload for a decision that
   * is already made.
   */
  const [gone, setGone] = useState<Set<string>>(new Set());

  /*
   * ⌘K FOCUSES THE SEARCH, because the badge in the field says it does.
   * Registered here rather than on the input: the whole point of the
   * shortcut is that it works when the field is not focused.
   */
  const search = useRef<HTMLInputElement | null>(null);
  const [mac, setMac] = useState(true);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const key = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  /*
   * ONE MENU FOR THE WHOLE BUILDING, and one dialog behind it. Every card
   * and every row raises the same list, by right-click or by its `⋯`, and
   * the actions are written down once. [D-19]
   */
  const { menu, onRow, fromButton } = useMenu();
  const { itemsFor, dialog, banner } = useRecordActions(
    (record) => setGone((was) => new Set(was).add(record.id)));

  const live = useMemo(
    () => records.filter((record) => !gone.has(record.id)), [records, gone]);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return live;
    return live.filter((record) =>
      record.title.toLowerCase().includes(needle)
      || record.detail.toLowerCase().includes(needle));
  }, [live, query]);

  const mineStudios = STUDIOS.filter((studio) => owned.includes(studio.id));
  const has = (id: StudioId) => owned.includes(id);

  const of = (kind: WorkRecord['kind']) =>
    matching.filter((record) => record.kind === kind);
  /* Unfiltered: the rail is the building, not the search result. */
  const newest = (kind: WorkRecord['kind']) =>
    live.find((record) => record.kind === kind);
  const recent = matching.slice(0, 6);

  return (
    /*
      * THE BUILDING'S LAYOUT IS IN CSS NOW, AND THAT IS THE WHOLE FIX.
      *
      * It was `gridTemplateColumns: 'minmax(0, 236px) minmax(0, 1fr)'`
      * inline, with `height: 100dvh; overflow: hidden` — which is a fine
      * frame for a desk and, on a phone, a two-column grid inside a box
      * that cannot scroll. The measurement said so exactly: at 412px the
      * page did NOT scroll horizontally and the account menu, the
      * runtime pill and half the recent-work table sat outside the
      * viewport. Not cramped — unreachable.
      *
      * AND NO MEDIA QUERY COULD REACH IT, because an inline style is not
      * a stylesheet. `surfaces.css` had set `--rail-width` under a
      * breakpoint since the breakpoints were written, and nothing had
      * ever read it: the width that actually shipped was this literal.
      * The class reads the token, so that rule finally does something.
      */
    <div className="building" style={{ background: 'var(--ink-900)' }}>
      {/*
        * THE RAIL IS THE BUILDING'S, NOT THIS PAGE'S.
        *
        * It was drawn here, which meant the three rooms had no way to
        * each other and no way back except one "Home" link — a room you
        * can only leave by the door you came in is not a room in a
        * building. `app/Rail.tsx` holds it once and every surface that
        * is inside the building renders it. [D-19]
        */}
      <BuildingRail owned={owned} libraryCount={live.length} space={space}
                    current="home" atHome
                    {...(hero ? { heroHref: hero.href } : {})} />

      {/* ============ THE WORK — lit ================================= */}
      <div data-ground="light" data-building data-testid="building" style={{
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        {dialog}
        {menu}
        {banner}

        {/* ---- the top bar ---------------------------------------- */}
        <header className="row" style={{
          gap: 'var(--space-5)', padding: '0 24px', flex: '0 0 auto',
          flexWrap: 'nowrap', height: 62,
          borderBottom: 'var(--border) solid var(--line)',
          background: 'var(--surface-raised)',
        }}>
          <label className="row" style={{
            gap: 'var(--space-3)', flex: '1 1 0', maxWidth: 480, margin: 0,
            flexWrap: 'nowrap', padding: '0 12px',
            borderRadius: 'var(--radius-lg)', background: 'var(--ink-800)',
            border: 'var(--border) solid var(--line)',
          }}>
            <span aria-hidden="true" style={{ color: 'var(--ink-400)' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              ref={search}
              data-testid="workspace-search" value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your studios, channels, media…"
              style={{
                border: 0, background: 'none', padding: '9px 0',
                fontSize: 'var(--text-base)', width: '100%',
                boxShadow: 'none',
              }}
            />
            {/*
              * THE HINT IS SHOWN BECAUSE THE KEY WORKS. A ⌘K badge on a
              * field where ⌘K does nothing is the purest form of the
              * thing this page is trying not to be.
              */}
            <kbd data-testid="search-key" style={{
              flex: '0 0 auto', fontSize: 'var(--text-2xs)',
              fontFamily: 'inherit', color: 'var(--ink-400)',
              border: 'var(--border) solid var(--line-strong)',
              borderRadius: 'var(--radius-xs)', padding: '2px 6px',
              background: 'var(--surface-raised)', lineHeight: 1.4,
            }}>{mac ? '\u2318K' : 'Ctrl K'}</kbd>
          </label>

          <span className="grow" />

          <Bell pending={pending} />

          <GroundToggle />
          <AccountMenu name={account.name} role={account.role} />
          {/*
        * WRAPPED, BECAUSE A MEDIA QUERY CANNOT BEAT AN INLINE STYLE.
        *
        * The pill sets `display: inline-flex` on the element, and a
        * stylesheet rule loses to that without `!important`. A wrapper
        * that is `display: contents` normally and `display: none` at
        * phone width hides the subtree whatever the child declares —
        * and changes nothing about the pill itself.
        */}
      <span className="wide-only"><RuntimePill runtime={runtime} /></span>
        </header>

        {/* ---- the page ------------------------------------------- */}
        <div id="top" className="building-body">
          <div className="building-columns">
            {/* ======== the left column ========================== */}
            <div style={{ minWidth: 0 }}>
              <Greeting name={account.name} />

              {/*
                * THE RAIL LINKS HERE. `Channels` in the building rail is
                * `/#channels`, and there was no `#channels` — so it
                * landed at the top of the home page and looked broken.
                * The channel a person is looking for is the hero, or the
                * invitation to make one. [U-19]
                */}
              <div id="channels" style={{ scrollMarginTop: 20 }} />
              {hero
                ? <Hero channel={hero} onRow={onRow} open={fromButton}
                        items={itemsFor} records={live} />
                : <NoChannel />}

              {/* ---- the three doors ------------------------------ */}
              <div className="row" style={{
                margin: '30px 0 14px', flexWrap: 'nowrap', alignItems: 'baseline',
              }}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <h2 style={{
                    margin: 0, fontSize: 'var(--text-lg)',
                    letterSpacing: 'var(--tracking-tight)',
                  }}>Your production</h2>
                  <p style={{
                    margin: '2px 0 0', fontSize: 'var(--text-sm)',
                    color: 'var(--text-faint)',
                  }}>
                    Professional tools for creating, producing and broadcasting.
                  </p>
                </span>
              </div>

              <div style={{
                display: 'grid', gap: 14,
                gridTemplateColumns: 'repeat(auto-fit, minmax(226px, 1fr))',
              }}>
                {mineStudios.map((studio) => (
                  <StudioCard
                    key={studio.studio}
                    studio={studio}
                    mine={of(studio.kind)}
                  />
                ))}
              </div>

              {/* ---- what has been made --------------------------- */}
              <div className="row" style={{
                margin: '30px 0 12px', flexWrap: 'nowrap', alignItems: 'baseline',
              }}>
                <h2 className="grow" style={{
                  margin: 0, fontSize: 'var(--text-lg)',
                  letterSpacing: 'var(--tracking-tight)',
                }}>Recent work</h2>
                <a href="#library" style={{
                  fontSize: 'var(--text-sm)', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  All of it <Icon name="arrow" size={13} />
                </a>
              </div>

              <RecentWork rows={recent} query={query}
                          items={itemsFor} onRow={onRow} open={fromButton} />

              {/* ---- the library, by studio ----------------------- */}
              <div id="library" style={{ scrollMarginTop: 20 }} />
              {mineStudios.map((studio) => {
                const mine = of(studio.kind);
                if (mine.length === 0) return null;
                const room = roomFor(studio.id);
                return (
                  <section
                    key={studio.kind}
                    id={studio.kind === 'conversation' ? 'conversations'
                      : studio.kind === 'performance' ? 'performances' : 'channels'}
                    data-testid={`${studio.kind}-library`}
                    style={{ marginTop: 28, scrollMarginTop: 20 }}
                  >
                    <div className="row" style={{
                      marginBottom: 10, flexWrap: 'nowrap',
                    }}>
                      <span aria-hidden="true" style={{
                        width: 9, height: 9, borderRadius: 3, flex: '0 0 auto',
                        background: room.accent,
                      }} />
                      <strong className="grow" style={{
                        fontSize: 'var(--text-md)',
                      }}>
                        {studio.kind === 'conversation' ? 'Conversations'
                          : studio.kind === 'performance' ? 'Performances'
                            : 'Channels'}
                      </strong>
                      <span style={{
                        fontSize: 'var(--text-xs)', color: 'var(--ink-400)',
                      }}>{mine.length}</span>
                    </div>
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      {mine.map((record) => (
                        <Row key={record.id} record={record}
                             items={itemsFor} onRow={onRow} open={fromButton} />
                      ))}
                    </div>
                  </section>
                );
              })}

              {live.length > 0 && <RightClickHint what="anything you made" />}

              <footer className="row" style={{
                marginTop: 34, paddingTop: 16, flexWrap: 'nowrap',
                borderTop: 'var(--border) solid var(--line)',
                fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
              }}>
                <span className="grow">
                  BalanceVid <span data-testid="version">{version}</span>
                </span>
                <span>Create · Produce · Broadcast</span>
              </footer>
            </div>

            {/* ======== the right column ========================= */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0,
            }}>
              {hero && <Distribution channel={hero} />}
              <QuickActions hero={hero} />
              <RuntimeCard runtime={runtime} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 *  The rail.
 * ------------------------------------------------------------------------ */





/* ------------------------------------------------------------------------ *
 *  The top bar.
 * ------------------------------------------------------------------------ */

/**
 * WHAT IS ACTUALLY PENDING.  [D-07, D-13]
 *
 * A bell is the easiest thing in an interface to add and the easiest to
 * make dishonest: a dot that is always there teaches people to ignore it,
 * and a dot that can never be there is a picture of a bell. This one
 * counts the render queue — jobs in hand, jobs waiting, jobs that fell
 * over — and shows nothing at all when there is nothing.
 */
function Bell({
  pending,
}: { pending: { working: number; waiting: number; failed: number } }) {
  const busy = pending.working + pending.waiting;
  const said = [
    pending.failed > 0 ? `${pending.failed} failed` : null,
    pending.working > 0 ? `${pending.working} rendering` : null,
    pending.waiting > 0 ? `${pending.waiting} waiting` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span data-testid="pending" title={said || 'Nothing in the queue'}
          aria-label={said || 'Nothing in the queue'}
          style={{
            position: 'relative', flex: '0 0 auto', padding: 6,
            borderRadius: 'var(--radius-md)', color: 'var(--ink-300)',
          }}>
      <Icon name="bell" size={17} />
      {(busy > 0 || pending.failed > 0) && (
        <span aria-hidden="true" data-testid="pending-dot" style={{
          position: 'absolute', right: 4, top: 4,
          width: 7, height: 7, borderRadius: '50%',
          background: pending.failed > 0
            ? 'var(--state-bad)' : 'var(--accent)',
          boxShadow: '0 0 0 2px var(--surface-raised)',
        }} />
      )}
    </span>
  );
}

function RuntimePill({
  runtime,
}: { runtime: { label: string; hosted: boolean } }) {
  return (
    <span data-testid="runtime" title={runtime.hosted
      ? 'This instance is running on a server.'
      : 'This instance is running on this machine.'}
          style={{
            flex: '0 0 auto', display: 'inline-flex', alignItems: 'center',
            gap: 7, padding: '6px 11px', borderRadius: 'var(--radius-full)',
            border: 'var(--border) solid var(--line)',
            background: 'var(--ink-800)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
            whiteSpace: 'nowrap',
          }}>
      <span aria-hidden="true" style={{
        width: 7, height: 7, borderRadius: '50%',
        background: runtime.hosted ? 'var(--state-ok)' : 'var(--accent)',
      }} />
      {runtime.label}
    </span>
  );
}

/**
 * THE GREETING KNOWS THE TIME AND THE SERVER DOES NOT.
 *
 * "Good evening" rendered on the server is the server's evening, which
 * for anybody in another timezone is a small lie told in a large font. It
 * says "Welcome back" until the browser has mounted and can be asked,
 * which is also what somebody with JavaScript off keeps — and that is a
 * correct sentence rather than a broken one. [U-08]
 */
function Greeting({ name }: { name: string }) {
  const [part, setPart] = useState<string | null>(null);
  const [clock, setClock] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hour = now.getHours();
      setPart(hour < 5 ? 'Still up' : hour < 12 ? 'Good morning'
        : hour < 18 ? 'Good afternoon' : 'Good evening');
      setClock(now.toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      }));
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  /*
   * A DEFAULT IS NOT A NAME. Until somebody sets one in Settings the
   * account is called "Owner", and "Good evening, Owner." is a greeting
   * from a piece of software that has not met you. Without a name the
   * sentence simply ends.
   */
  const named = name.trim() && name.trim().toLowerCase() !== 'owner';
  const first = named ? (name.trim().split(/\s+/)[0] ?? name) : null;
  return (
    <div className="row" style={{
      marginBottom: 20, flexWrap: 'nowrap', alignItems: 'flex-end',
    }}>
      <span className="grow" style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 'var(--text-2xs)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          fontWeight: 'var(--weight-bold)', color: 'var(--ink-400)',
          marginBottom: 4,
        }}>Welcome back</span>
        <h1 data-testid="greeting" style={{
          margin: 0, fontSize: 'var(--text-2xl)',
          letterSpacing: 'var(--tracking-tighter)',
        }}>{first
          ? (part ? `${part}, ${first}.` : `Welcome back, ${first}.`)
          : (part ? `${part}.` : 'Welcome back.')}</h1>
        <p style={{
          margin: '5px 0 0', fontSize: 'var(--text-base)',
          color: 'var(--text-faint)',
        }}>
          Your broadcast environment is ready. Create, produce and reach
          your audience.
        </p>
      </span>
      {clock && (
        <span className="mono" data-testid="clock" style={{
          flex: '0 0 auto', fontSize: 'var(--text-xs)',
          color: 'var(--ink-400)', fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}>{clock}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 *  The channel at the top.
 * ------------------------------------------------------------------------ */

function Hero({
  channel, records, items, onRow, open,
}: {
  channel: HeroChannel;
  records: WorkRecord[];
} & Pick<Rowed, 'items' | 'onRow' | 'open'>) {
  const record = records.find((entry) => entry.id === channel.id);
  return (
    <section
      data-testid="hero" className="panel hero-grid"
      {...(record ? onRow(channel.name, () => items(record)) : {})}
      style={{
        gap: 0, padding: 0, overflow: 'hidden', position: 'relative',
        borderRadius: 'var(--radius-xl)',
      }}
    >
      {/*
        * THE ART IS A WELL, and dark, because it holds a picture. On an
        * otherwise lit page that is the one rectangle that must not be
        * white: a light placeholder behind a channel's poster makes the
        * empty state the brightest thing on the screen.
        */}
      {/*
        * THE ART AND THE ONE CONTROL THAT BELONGS TO IT, IN ONE BOX.
        *
        * The Edit link was `position: absolute; bottom: 12` against the
        * HERO, which is the same thing as "against the art" only while
        * the hero is one row 148px tall. Stacked on a phone the hero
        * became art-above-content and bottom-12 landed on top of "Open
        * Online TV" — a link sitting over a button, both clickable,
        * neither obviously the one you meant.
        *
        * It is pinned to the art now, in both layouts, by being inside
        * it. The wrapper is what carries `position: relative`; the
        * decorative layers keep `aria-hidden` and the link does not
        * inherit it, which it would have if the art div were simply
        * reused as the container.
        */}
      <div style={{ position: 'relative', minHeight: 148 }}>
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, background: 'var(--surface-sunk)',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(145deg, var(--studio-tv-veil),'
              + ' transparent 62%)',
          }} />
          <span style={{
            position: 'absolute', inset: 0, display: 'grid',
            placeItems: 'center', color: 'var(--studio-tv)', opacity: 0.55,
          }}><Icon name="broadcast" size={40} strokeWidth={1.2} /></span>
        </div>
      {/*
        * THE ONE THING YOU DO TO A CHANNEL'S ARTWORK, on the artwork.
        * The station name, the bug and the lower third all live behind
        * the Identity tab in the control room, which is four hundred
        * lines from here and not findable from a blank rectangle. [§13]
        */}
      <Link href={`${channel.href}#identity`} data-testid="edit-identity"
            style={{
              position: 'absolute', left: 12, bottom: 12,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 'var(--radius-screen)',
              background: 'rgba(0,0,0,0.72)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: 'var(--text-on-accent)', textDecoration: 'none',
              fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semi)',
            }}>
        <Icon name="pencil" size={12} /> Edit
      </Link>
      </div>

      <div style={{ padding: '18px 20px', minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <span aria-hidden="true" style={{
            width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto',
            background: channel.live ? 'var(--state-live)' : 'var(--ink-450)',
          }} />
          <span className="grow" style={{
            fontSize: 'var(--text-2xs)', letterSpacing: '0.1em',
            textTransform: 'uppercase', fontWeight: 'var(--weight-bold)',
            color: 'var(--ink-400)',
          }}>Channel</span>
          {record && (
            <MenuButton about={channel.name} items={() => items(record)}
                        open={open} small />
          )}
        </div>

        <div className="row" style={{
          gap: 10, margin: '6px 0 0', flexWrap: 'nowrap',
        }}>
          <h2 style={{
            margin: 0, fontSize: 'var(--text-xl)', minWidth: 0,
            letterSpacing: 'var(--tracking-tight)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{channel.name}</h2>
          {/*
            * ON AIR IS A LAMP AND A WORD, never one of them. Somewhere
            * between four and eight per cent of men cannot separate this
            * red from this green, and "is it live" is exactly the
            * discrimination that fails. [U-19]
            */}
          <span data-testid="hero-state" style={{
            flex: '0 0 auto', display: 'inline-flex', alignItems: 'center',
            gap: 5, padding: '3px 9px', borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
            letterSpacing: '0.07em',
            background: channel.live
              ? 'var(--state-live-wash)' : 'var(--state-off-wash)',
            color: channel.live ? 'var(--state-live-dim)' : 'var(--ink-300)',
            border: `var(--border) solid ${channel.live
              ? 'var(--state-live)' : 'var(--line-strong)'}`,
          }}>
            <span aria-hidden="true" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: channel.live ? 'var(--state-live)' : 'transparent',
              boxShadow: channel.live
                ? 'none' : 'inset 0 0 0 1.5px var(--ink-450)',
            }} />
            {channel.live ? 'ON AIR' : 'OFF AIR'}
          </span>
        </div>

        <div className="row" style={{
          gap: 26, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-start',
        }}>
          <Fact icon="clock" label={channel.live ? 'On air now' : 'Next programme'}
                value={channel.live
                  ? (channel.onAir ?? 'on air')
                  : (channel.next?.title ?? 'Nothing scheduled')}
                sub={channel.next && !channel.live
                  ? new Date(channel.next.startsAt).toLocaleString(undefined, {
                    hour: '2-digit', minute: '2-digit', day: 'numeric',
                    month: 'short',
                  })
                  : channel.inLoop > 0
                    ? `${channel.inLoop} in the loop` : 'The loop is empty'} />
          <Fact icon="calendar" label="Schedule"
                value={`${channel.today} today`}
                sub={channel.timezone} />
          <span className="grow" />
          <Link href={channel.href} data-testid="open-channel"
                style={{
                  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center',
                  gap: 7, padding: '9px 16px',
                  borderRadius: 'var(--radius-md)', textDecoration: 'none',
                  background: 'var(--accent)',
                  border: 'var(--border) solid var(--accent)',
                  color: 'var(--text-on-accent)',
                  fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semi)',
                  boxShadow: 'var(--elev-2)',
                }}>
            <Icon name="play" size={12} /> Open Online TV
          </Link>
        </div>
      </div>
    </section>
  );
}

function Fact({
  icon, label, value, sub,
}: { icon: IconName; label: string; value: string; sub?: string | null }) {
  return (
    <span className="row" style={{
      gap: 9, flexWrap: 'nowrap', alignItems: 'flex-start', minWidth: 0,
    }}>
      <span aria-hidden="true" style={{
        color: 'var(--ink-400)', marginTop: 2,
      }}><Icon name={icon} size={15} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 'var(--text-2xs)',
          color: 'var(--ink-400)', textTransform: 'uppercase',
          letterSpacing: '0.07em', fontWeight: 'var(--weight-semi)',
        }}>{label}</span>
        <span style={{
          display: 'block', fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semi)', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '22ch',
        }}>{value}</span>
        {sub && (
          <span style={{
            display: 'block', fontSize: 'var(--text-2xs)',
            color: 'var(--ink-400)', marginTop: 1,
          }}>{sub}</span>
        )}
      </span>
    </span>
  );
}

function NoChannel() {
  /*
   * THE FORM THAT STOOD HERE IS IN THE CONTROL ROOM NOW.
   *
   * It was `StartChannel`, unfolded on the home page, which is the same
   * thing the studio cards were doing: a hallway holding an intake. What
   * is left is the reason to have a channel and the way to the room that
   * makes one — which is all a hallway should carry.
   */
  const room = roomFor('online-tv');
  return (
    <section className="panel" data-testid="hero-empty" style={{
      padding: 22, borderRadius: 'var(--radius-xl)',
    }}>
      <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
        No channel yet
      </h2>
      <p style={{
        margin: '4px 0 14px', fontSize: 'var(--text-base)',
        color: 'var(--text-faint)', maxWidth: '62ch',
      }}>
        A channel plays what you have already made, round the clock. It
        holds references rather than copies, so scheduling something twice
        costs nothing.
      </p>
      <Link href={room.href} data-testid="open-control" style={{
        display: 'inline-block', padding: '8px 14px',
        borderRadius: 'var(--radius-md)', textDecoration: 'none',
        background: 'var(--studio-tv)', color: 'var(--text-on-accent)',
        fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semi)',
        boxShadow: 'var(--elev-2)',
      }}>
        <span className="row" style={{ gap: 6 }}>
          {room.enter}<Icon name="arrow" size={13} />
        </span>
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------------------ *
 *  The right column.
 * ------------------------------------------------------------------------ */

/**
 * ONE PROGRAMME, MANY AUDIENCES.  [CHANNEL §15, U-22]
 *
 * This lists every destination the model knows about rather than only the
 * ones that are wired up, because "what could I connect" is the question
 * somebody looking at this panel is asking, and a list of one answers it
 * badly. Four of the five say "Not connected", which is true: the
 * architecture is in place and exactly one connector is implemented — the
 * channel's own output, the only one that needs nobody's permission and
 * the only one that can be tested.
 *
 * Saying so is the honest version. Showing five logos with green dots
 * would be the other kind of dashboard.
 */
function Distribution({ channel }: { channel: HeroChannel }) {
  return (
    <section className="panel" data-testid="distribution" style={{
      padding: 16, borderRadius: 'var(--radius-xl)',
    }}>
      <div className="row" style={{ gap: 9, flexWrap: 'nowrap' }}>
        <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
          <Icon name="distribution" size={16} />
        </span>
        <strong className="grow" style={{ fontSize: 'var(--text-md)' }}>
          Distribution
        </strong>
      </div>
      <p style={{
        margin: '3px 0 12px', fontSize: 'var(--text-2xs)',
        color: 'var(--ink-400)',
      }}>
        Your channels and live destinations.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {channel.destinations.map((destination) => (
          <div key={destination.kind} className="row"
               data-testid="destination-row"
               data-kind={destination.kind}
               data-state={destination.state}
               style={{ gap: 9, flexWrap: 'nowrap', padding: '7px 0' }}>
            <span aria-hidden="true" style={{
              width: 26, height: 26, borderRadius: 'var(--radius-sm)',
              flex: '0 0 auto', display: 'grid', placeItems: 'center',
              fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
              background: MARK[destination.kind]?.wash ?? 'var(--ink-800)',
              color: MARK[destination.kind]?.ink ?? 'var(--ink-300)',
              border: 'var(--border) solid var(--line)',
              /* Not connected is stated in words; the mark is only dimmed. */
              opacity: destination.state === 'connected' ? 1 : 0.55,
            }}>{MARK[destination.kind]?.text ?? '\u2022'}</span>
            <span className="grow" style={{
              fontSize: 'var(--text-sm)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{destination.label}</span>
            {/*
              * THE WORD IS THE SIGNAL AND THE DOT AGREES WITH IT. A
              * column of coloured dots with no words is a column nobody
              * can read in greyscale or in a screenshot. [U-19]
              */}
            <span className="row" style={{
              gap: 5, flex: '0 0 auto', flexWrap: 'nowrap',
              fontSize: 'var(--text-2xs)',
              color: destination.state === 'connected'
                ? 'var(--ink-on-ok)' : 'var(--ink-400)',
            }}>
              <span aria-hidden="true" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: destination.state === 'connected'
                  ? 'var(--state-ok)' : 'var(--ink-450)',
              }} />
              {destination.state === 'connected' ? 'Connected' : 'Not connected'}
            </span>
          </div>
        ))}
      </div>

      <Link href={`${channel.href}#distribution`} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10,
        fontSize: 'var(--text-xs)', textDecoration: 'none',
      }}>
        Manage destinations <Icon name="arrow" size={12} />
      </Link>
    </section>
  );
}



function QuickActions({ hero }: { hero: HeroChannel | null }) {
  /*
   * FIVE THINGS, EACH OF WHICH GOES SOMEWHERE THAT EXISTS. The temptation
   * in a panel like this is to list what the product ought to be able to
   * do; every row here is a route or a form already in the build, and
   * the ones that need a channel say so when there is not one, rather
   * than leading somewhere that 404s.
   */
  const actions: {
    icon: IconName; label: string; hint: string;
    /*
     * EVERY ROW GOES SOMEWHERE, OR SAYS WHY IT CANNOT.
     *
     * Two of these used to open a form on this page instead of
     * navigating — `onSelect: () => onStart('one')`. Now that the rooms
     * exist there is nowhere for a quick action to go but into one, so
     * the callback is gone and a row is a link or it is dimmed. A
     * control that sometimes navigates and sometimes unfolds something
     * underneath you is two controls wearing one label.
     */
    href?: string; off?: string;
  }[] = [
    {
      icon: 'live', label: 'Go live now', hint: 'Start a live broadcast',
      href: hero ? `${hero.href}#live` : undefined,
      off: hero ? undefined : 'Make a channel first',
    },
    {
      icon: 'upload', label: 'Upload media',
      hint: 'Bring in a video or a song',
      href: roomFor('studio-one').href,
    },
    {
      icon: 'calendar', label: 'Schedule programme',
      hint: 'Plan your channel content',
      href: hero ? `${hero.href}#schedules` : undefined,
      off: hero ? undefined : 'Make a channel first',
    },
    {
      icon: 'music', label: 'Record a performance',
      hint: 'One song, many takes',
      href: roomFor('studio-two').href,
    },
    {
      icon: 'link', label: 'Embed your channel',
      hint: 'Get your player code',
      href: hero ? `${hero.href}/watch` : undefined,
      off: hero ? undefined : 'Make a channel first',
    },
  ];

  return (
    <section className="panel" data-testid="quick-actions" style={{
      padding: 16, borderRadius: 'var(--radius-xl)',
    }}>
      <div className="row" style={{ gap: 9, flexWrap: 'nowrap' }}>
        <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
          <Icon name="play" size={15} />
        </span>
        <strong className="grow" style={{ fontSize: 'var(--text-md)' }}>
          Quick actions
        </strong>
      </div>
      <p style={{
        margin: '3px 0 10px', fontSize: 'var(--text-2xs)',
        color: 'var(--ink-400)',
      }}>
        Get started, manage your content and reach your audience.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {actions.map((action) => {
          const body = (
            <>
              <span aria-hidden="true" style={{
                color: action.off ? 'var(--ink-450)' : 'var(--ink-300)',
              }}><Icon name={action.icon} size={16} /></span>
              <span className="grow" style={{ minWidth: 0, lineHeight: 1.3 }}>
                <span style={{
                  display: 'block', fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--weight-semi)',
                }}>{action.label}</span>
                <span style={{
                  display: 'block', fontSize: 'var(--text-2xs)',
                  color: 'var(--ink-400)',
                }}>{action.off ?? action.hint}</span>
              </span>
              <span aria-hidden="true" style={{ color: 'var(--ink-450)' }}>
                <Icon name="chevron" size={13} />
              </span>
            </>
          );
          const look: React.CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '9px 6px', textAlign: 'left', textDecoration: 'none',
            color: action.off ? 'var(--ink-450)' : 'inherit',
            background: 'none', border: 0, borderRadius: 'var(--radius-sm)',
            boxShadow: 'none',
            borderTop: 'var(--border) solid var(--line-soft)',
            cursor: action.off ? 'default' : 'pointer',
          };
          if (action.off) {
            return (
              <span key={action.label} data-testid="quick-action"
                    aria-disabled="true" title={action.off} style={look}>
                {body}
              </span>
            );
          }
          return (
            <Link key={action.label} href={action.href!}
                  data-testid="quick-action" style={look}>{body}</Link>
          );
        })}
      </div>
    </section>
  );
}

function RuntimeCard({
  runtime,
}: { runtime: { label: string; hosted: boolean } }) {
  return (
    <section data-testid="runtime-card" style={{
      padding: 14, borderRadius: 'var(--radius-xl)',
      background: 'var(--accent-wash)',
      border: 'var(--border) solid rgba(29, 99, 201, 0.16)',
    }}>
      <div className="row" style={{ gap: 9, flexWrap: 'nowrap' }}>
        <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
          <Icon name={runtime.hosted ? 'channels' : 'disk'} size={16} />
        </span>
        <strong className="grow" style={{
          fontSize: 'var(--text-sm)', color: 'var(--accent-deep)',
        }}>
          {runtime.hosted ? `Running on ${runtime.label}` : 'Running locally'}
        </strong>
      </div>
      {/*
        * THE SAME PRODUCT IN TWO PLACES, said plainly. Local, cloud and
        * hybrid are one system in two operating modes — no feature is
        * withheld from either — and this card exists so that somebody
        * with two tabs open knows which one they are typing into. [D-16]
        */}
      <p style={{
        margin: '5px 0 0', fontSize: 'var(--text-2xs)',
        color: 'var(--text-dim)', lineHeight: 'var(--leading-snug)',
      }}>
        {runtime.hosted
          ? 'Your studio runs on a server. The same product runs on your '
            + 'own machine, with the same files and the same features.'
          : 'Your studio runs on this machine and its files are on this '
            + 'disk. The same product runs hosted, with nothing withheld.'}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------ *
 *  The doors, and the work.
 * ------------------------------------------------------------------------ */

function StudioCard({
  studio, mine,
}: {
  studio: (typeof STUDIOS)[number];
  mine: WorkRecord[];
}) {
  /*
   * WHAT THE ROOM IS CALLED, AND WHAT ITS DOOR SAYS, FROM ONE PLACE.
   * [rooms.ts, D-19]
   */
  const room = roomFor(studio.id);
  return (
    <div data-testid="studio-card" data-studio={studio.studio}
         className="panel" style={{
           padding: 0, overflow: 'hidden',
           borderRadius: 'var(--radius-xl)',
           display: 'flex', flexDirection: 'column',
         }}>
      {/*
        * THE ART IS THE ROOM, AND IT USED TO BE THE PERSON'S OWN WORK.
        *
        * What stood here was a frame from the newest thing made in this
        * studio, over the room's colour when there was nothing yet — and
        * the argument written beside it was that a photograph of a studio
        * the person has never been in says nothing. That argument was
        * right about stock photography and wrong about this card, for a
        * reason a screenshot makes obvious: the three cards sit side by
        * side, and a poster frame in one beside a poster frame in another
        * is two arbitrary crops of two unrelated videos. The row read as
        * noise, and what the row is FOR is telling somebody which of
        * three rooms to walk into.
        *
        * SO THE BAND CARRIES THE ROOM AND NOT THE WORK. A conversation
        * recorded at a desk, a band playing to four cameras, a gallery
        * cutting to air: the same three pictures every time the page
        * loads, which is what makes them recognisable rather than
        * decorative. The person's own work did not lose its place — it
        * has a better one, in `RecentWork` below, at a size where a
        * poster frame is legible instead of cropped into a strip.
        *
        * AND THE ROOM'S COLOUR IS STILL ON IT. The veil is the token
        * `studios.css` already defines for exactly this — "the veil
        * behind a studio card's artwork" — and it does the work the
        * author asked for when they said the three images must not
        * compete: three photographs shot in three places, each pulled
        * a little towards the colour of the room it stands for.
        */}
      <div aria-hidden="true" style={{
        /*
         * THE UPPER 40-45% OF THE CARD, which is a proportion and not a
         * height — but the content below is four lines and two buttons
         * whatever the card is, so 132 against roughly 190 of content is
         * that proportion, held at every width the grid produces.
         */
        height: 132, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(140deg, ${room.veil},`
          + ' var(--surface-sunk))',
      }}>
        <img alt="" src={room.art} loading="lazy" decoding="async"
             style={{
               position: 'absolute', inset: 0,
               width: '100%', height: '100%',
               objectFit: 'cover', objectPosition: room.focus,
               display: 'block',
             }} />
        <span style={{
          position: 'absolute', inset: 0, background: room.veil,
        }} />
        {/*
          * A FADE INTO THE CARD, AND NOTHING ELSE ON TOP.
          *
          * The badge that used to sit here put the room's glyph in a dark
          * disc over the corner of the picture, which was a second name
          * for a room whose name is printed two lines below it — and on a
          * photograph rather than a flat wash it reads as a sticker. The
          * glyph is still on the rail and in every row that mentions this
          * studio, so nothing is lost but the sticker. [U-19]
          *
          * WHAT REPLACES IT IS A TRANSITION. A photograph that simply
          * stops against the content area looks pasted on; a few pixels
          * of the card's own darkness at the foot of it looks like the
          * card was designed that way. It starts past the middle so it
          * darkens the edge and not the picture.
          */}
        <span style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 52%,'
            + ' var(--art-fade))',
        }} />
      </div>

      <div style={{
        padding: 14, display: 'flex', flexDirection: 'column',
        gap: 5, flex: '1 1 auto',
      }}>
        <span style={{
          fontSize: 'var(--text-2xs)', letterSpacing: '0.1em',
          fontWeight: 'var(--weight-bold)', color: 'var(--ink-400)',
        }}>{room.label}</span>
        <strong style={{
          fontSize: 'var(--text-md)',
          letterSpacing: 'var(--tracking-tight)',
        }}>{room.name}</strong>
        <p style={{
          margin: 0, fontSize: 'var(--text-2xs)',
          color: 'var(--text-faint)',
          lineHeight: 'var(--leading-snug)',
        }}>{studio.blurb}</p>
        <span className="grow" />

        <div className="row" style={{
          gap: 8, marginTop: 10, flexWrap: 'nowrap',
        }}>
          {/*
            * ONE DESTINATION, AND IT IS THE ROOM.
            *
            * This was a link when the studio had a newest thing and a
            * button that unfolded a form when it did not — so the same
            * control meant "open the last conversation you made" on a
            * used card and "fill in a form here in the hallway" on an
            * empty one. Neither was entering a studio, and a person
            * pressing it twice on two different days got two different
            * kinds of thing.
            *
            * *"Each card should lead to an actual dedicated environment
            * rather than opening a particular task/intake state."*
            */}
          <Link href={room.href} data-testid="open-studio" style={{
            flex: '1 1 0', textAlign: 'center', padding: '8px 10px',
            borderRadius: 'var(--radius-md)', textDecoration: 'none',
            background: room.accent, color: 'var(--text-on-accent)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semi)',
            boxShadow: 'var(--elev-2)',
          }}>
            {/* The arrow is drawn: → is a different length, weight and
                baseline in every font, and there are three of these
                side by side on the same row. */}
            <span className="row" style={{
              gap: 6, justifyContent: 'center',
            }}>{room.enter}<Icon name="arrow" size={13} /></span>
          </Link>
          {/*
            * AND THE `+` WALKS THROUGH THE SAME DOOR. The intake lives
            * in the room it belongs to; the hallway stopped holding
            * forms when the third room got a door.
            */}
          <Link href={room.href} data-testid="new-in-studio"
                aria-label={`New in ${room.name}`}
                style={{
                  flex: '0 0 auto', width: 34, padding: '8px 0',
                  borderRadius: 'var(--radius-md)',
                  display: 'grid', placeItems: 'center',
                  border: 'var(--border) solid var(--line)',
                  color: 'inherit', textDecoration: 'none',
                }}><Icon name="plus" size={14} /></Link>
        </div>

        {/*
          * A COUNT THAT IS ALSO A STATE. "3 here" says the room has been
          * used; "Ready" says only that the page rendered.
          */}
        <span className="row" style={{
          gap: 6, marginTop: 8, flexWrap: 'nowrap',
          fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
        }}>
          <span aria-hidden="true" style={{
            width: 6, height: 6, borderRadius: '50%',
            background: mine.length > 0 ? 'var(--state-ok)' : 'var(--ink-450)',
          }} />
          {mine.length > 0 ? `${mine.length} here` : 'Nothing here yet'}
        </span>

      </div>
    </div>
  );
}

interface Rowed {
  items: (record: WorkRecord) => MenuEntry[];
  onRow: (about: string, items: () => MenuEntry[]) => {
    onContextMenu: (event: React.MouseEvent) => void };
  open: (about: string, items: () => MenuEntry[], button: HTMLElement) => void;
}

const WHERE: Record<WorkRecord['kind'], string> = {
  conversation: 'Studio One', performance: 'Studio Two', channel: 'Online TV',
};

function RecentWork({
  rows, query, items, onRow, open,
}: Rowed & { rows: WorkRecord[]; query: string }) {
  if (rows.length === 0) {
    return (
      <p className="panel" style={{
        margin: 0, padding: 20, fontSize: 'var(--text-base)',
        color: 'var(--text-faint)', borderRadius: 'var(--radius-xl)',
      }}>
        {query
          ? `Nothing matches “${query}”.`
          : 'Nothing yet. Open a studio above and make something.'}
      </p>
    );
  }
  return (
    <div className="panel" data-testid="recent-work" style={{
      padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-xl)',
    }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
      }}>
        <thead>
          <tr>
            {['Title', 'Studio', 'State', 'Updated', 'Length', ''].map(
              (head, index) => (
                <th key={head || 'menu'} scope="col" style={{
                  textAlign: index === 4 ? 'right' : 'left',
                  padding: '9px 14px',
                  fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semi)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--ink-400)',
                  borderBottom: 'var(--border) solid var(--line)',
                  width: index === 0 ? 'auto' : index === 5 ? 44 : 126,
                }}>{head}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => (
            <tr key={record.id} data-testid="recent-row"
                data-kind={record.kind}
                {...onRow(record.title, () => items(record))}
                style={{ borderBottom: 'var(--border) solid var(--line-soft)' }}>
              <td style={{ padding: '9px 14px', minWidth: 0 }}>
                <Link href={record.href} className="row" style={{
                  gap: 10, flexWrap: 'nowrap', textDecoration: 'none',
                  color: 'inherit', minWidth: 0,
                }}>
                  <span aria-hidden="true" style={{
                    flex: '0 0 auto', width: 46, height: 27,
                    borderRadius: 'var(--radius-screen)', overflow: 'hidden',
                    background: 'var(--screen-bed)', position: 'relative',
                  }}>
                    <Still src={record.poster} />
                  </span>
                  <span style={{
                    minWidth: 0, fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--weight-medium)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{record.title}</span>
                </Link>
              </td>
              <td style={{
                padding: '9px 14px', fontSize: 'var(--text-xs)',
                color: 'var(--text-faint)',
              }}>{WHERE[record.kind]}</td>
              <td style={{ padding: '9px 14px' }}><State record={record} /></td>
              <td style={{
                padding: '9px 14px', fontSize: 'var(--text-xs)',
                color: 'var(--text-faint)',
              }}><Ago at={record.updatedAt} /></td>
              <td className="mono" style={{
                padding: '9px 14px', fontSize: 'var(--text-xs)',
                color: 'var(--text-faint)', textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>{record.duration ?? '—'}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                <MenuButton about={record.title}
                            items={() => items(record)} open={open} small />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * WHAT STATE THE THING IS IN, which is more use than repeating its kind.
 * The studio column already says where it was made; this says whether
 * anybody else can see it, and for a channel whether it is transmitting
 * right now. Every one carries a word as well as a colour. [U-19]
 */
function State({ record }: { record: WorkRecord }) {
  const [label, ink, wash] = record.live
    ? ['On air', 'var(--state-live-dim)', 'var(--state-live-wash)']
    : record.published
      ? ['Published', 'var(--ink-on-ok)', 'var(--state-ok-wash)']
      : ['Draft', 'var(--ink-300)', 'var(--state-off-wash)'];
  return (
    <span data-testid="record-state" style={{
      display: 'inline-block', padding: '2px 9px',
      borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semi)',
      color: ink, background: wash,
    }}>{label}</span>
  );
}

/**
 * "2 hours ago", computed in the browser.
 *
 * Rendered as the raw date on the server and replaced on mount, because
 * "2 hours ago" worked out on the server is two hours before the SERVER'S
 * now — which for a page held for even a minute is wrong, and looks
 * authoritative while being wrong. [U-08]
 */
function Ago({ at }: { at: string }) {
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    const gap = Date.now() - Date.parse(at);
    const minutes = Math.round(gap / 60_000);
    setSaid(
      minutes < 1 ? 'just now'
        : minutes < 60 ? `${minutes} min ago`
          : minutes < 60 * 24 ? `${Math.round(minutes / 60)} hours ago`
            : minutes < 60 * 48 ? 'yesterday'
              : `${Math.round(minutes / (60 * 24))} days ago`);
  }, [at]);
  return <>{said ?? at.slice(0, 10)}</>;
}

function Row({ record, items, onRow, open }: Rowed & { record: WorkRecord }) {
  return (
    <div className="row" data-testid="library-row" data-kind={record.kind}
         {...onRow(record.title, () => items(record))}
         style={{
           gap: 11, padding: 9, borderRadius: 'var(--radius-lg)',
           flexWrap: 'nowrap', background: 'var(--surface-raised)',
           border: 'var(--border) solid var(--line)',
         }}>
      <Link href={record.href} className="row grow" style={{
        gap: 11, minWidth: 0, textDecoration: 'none', color: 'inherit',
        flexWrap: 'nowrap',
      }}>
        <span aria-hidden="true" style={{
          width: 62, height: 35, borderRadius: 'var(--radius-screen)',
          flex: '0 0 auto', overflow: 'hidden', position: 'relative',
          background: 'var(--screen-bed)',
        }}>
          <Still src={record.poster} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{
            display: 'block', fontWeight: 'var(--weight-semi)',
            fontSize: 'var(--text-sm)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{record.title}</span>
          <span style={{
            display: 'block', fontSize: 'var(--text-2xs)',
            color: 'var(--text-faint)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{record.detail}</span>
        </span>
      </Link>
      <State record={record} />
      {record.duration && (
        <span className="mono" style={{
          flex: '0 0 auto', fontSize: 'var(--text-2xs)',
          color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums',
        }}>{record.duration}</span>
      )}
      <MenuButton about={record.title} items={() => items(record)}
                  open={open} />
    </div>
  );
}

/**
 * A STILL THAT MAY NOT BE THERE.  [D-07, D-13]
 *
 * A take assembled before posters existed has none, and a render whose
 * thumbnail was cleaned up has a URL that 404s — twenty-nine of them on
 * this instance. An `<img>` pointed at either shows the browser's
 * broken-image glyph: a torn page in the corner of an otherwise finished
 * card, which reads as "this product is broken" rather than as "there is
 * no picture of this yet".
 *
 * `onError` ALONE DOES NOT FIX IT, which is the whole reason this is a
 * component and not two attributes. The server sends the `<img>` in the
 * HTML, the browser starts fetching it immediately, and on a page this
 * size the 404 lands BEFORE React hydrates — so the error event has
 * already been dispatched to nobody and the handler React then attaches
 * is never called. I wrote the naive version first and the screenshot
 * still had the torn page in it; the image reported
 * `complete: true, naturalWidth: 0`, which is the only evidence left
 * that it failed.
 *
 * So the ref checks on attach as well. Both paths are needed: the ref
 * catches what failed before hydration, the handler catches what fails
 * after.
 */

