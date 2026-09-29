'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon, { type IconName } from './Icon.js';
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

export interface SpaceReading {
  used: string;
  free: string;
  total: string;
  fraction: number;
  partial: boolean;
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
  label: string;
  name: string;
  blurb: string;
  /** The room's identity, and the two strengths it is washed in. */
  accent: string;
  veil: string;
  wash: string;
  icon: IconName;
  open: string;
}[] = [
  {
    studio: 'one', id: 'studio-one', kind: 'conversation',
    label: 'STUDIO ONE', name: 'Conversation Studio',
    blurb: 'Watch, interrupt and respond to any video. Invite guests and '
      + 'produce the room.',
    accent: 'var(--studio-one)', veil: 'var(--studio-one-veil)',
    wash: 'var(--studio-one-wash)', icon: 'conversation',
    open: 'Open Studio One',
  },
  {
    studio: 'two', id: 'studio-two', kind: 'performance',
    label: 'STUDIO TWO', name: 'Performance Studio',
    blurb: 'One song, many takes. Cut between them afterwards, in a room '
      + 'you choose.',
    accent: 'var(--studio-two)', veil: 'var(--studio-two-veil)',
    wash: 'var(--studio-two-wash)', icon: 'music',
    open: 'Open Studio Two',
  },
  {
    studio: 'tv', id: 'online-tv', kind: 'channel',
    label: 'ONLINE TV', name: 'Online TV',
    blurb: 'Run a 24/7 channel from what you have already made, and go '
      + 'live to your audience.',
    accent: 'var(--studio-tv)', veil: 'var(--studio-tv-veil)',
    wash: 'var(--studio-tv-wash)', icon: 'broadcast',
    open: 'Open Online TV',
  },
];

export default function Workspace({
  records, space, starters, account, runtime, pending, hero, version, owned,
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
  /** The three creation forms, rendered by the server page. */
  starters: { one: React.ReactNode; two: React.ReactNode; tv: React.ReactNode };
  account: { name: string; role: string };
  runtime: { label: string; hosted: boolean };
  pending: { working: number; waiting: number; failed: number };
  hero: HeroChannel | null;
  version: string;
}) {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<Studio | null>(null);
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
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 236px) minmax(0, 1fr)',
      height: '100dvh', overflow: 'hidden',
      background: 'var(--ink-900)',
    }}>
      {/* ============ THE RAIL — still dark ========================== */}
      <nav data-testid="workspace-rail" style={{
        display: 'flex', flexDirection: 'column', minHeight: 0,
        background: 'var(--ink-900)',
        borderRight: 'var(--border) solid var(--ink-750)',
      }}>
        <div className="row" style={{
          gap: 'var(--space-3)', padding: '18px 18px 20px',
          flexWrap: 'nowrap', flex: '0 0 auto',
        }}>
          <span aria-hidden="true" style={{
            width: 30, height: 30, borderRadius: 9, display: 'grid',
            placeItems: 'center', flex: '0 0 auto',
            background: 'linear-gradient(140deg, var(--accent-soft),'
              + ' var(--accent-deep))',
            color: 'var(--text-on-accent)',
            boxShadow: '0 4px 12px rgba(47, 111, 208, 0.3)',
          }}><Icon name="play" size={13} /></span>
          <strong style={{
            fontSize: 'var(--text-lg)', whiteSpace: 'nowrap',
            letterSpacing: 'var(--tracking-tight)',
          }}>BalanceVid</strong>
        </div>

        <div style={{
          flex: '1 1 0', minHeight: 0, overflowY: 'auto',
          padding: '0 12px', display: 'flex', flexDirection: 'column',
          gap: 2,
        }}>
          {/*
            * THE SAME PLACES AS THE STUDIO BAR, IN THE SAME ORDER, so a
            * person who learns them here recognises them there. A studio
            * row opens the studio — the newest thing in it — because a tab
            * that scrolled to a list would be a second Conversations row
            * wearing a different name. With nothing in it yet, it says so
            * and scrolls to the door instead of leading nowhere. [§13]
            */}
          <Rail href="#top" icon="home" label="Home" current />
          {/*
            * A STUDIO THIS ACCOUNT DOES NOT HAVE IS NOT DIMMED HERE, IT IS
            * ABSENT. The `empty` state above means "you have this and there
            * is nothing in it yet", which is an invitation. Not owning it is
            * not an invitation, and dressing it as one would make the rail
            * an advertisement — with no way to buy, because there is no
            * billing. When there is something to sell, this is where the
            * offer goes. [MASTER-EDIT §11]
            */}
          {has('studio-one') && (
            <Rail href={newest('conversation')?.href ?? '#conversations'}
                  icon="conversation" label="Studio One" under="Conversations"
                  empty={!newest('conversation')} />
          )}
          {has('studio-two') && (
            <Rail href={newest('performance')?.href ?? '#performances'}
                  icon="music" label="Studio Two" under="Performance"
                  empty={!newest('performance')} />
          )}
          {has('online-tv') && (
            <Rail href={newest('channel')?.href ?? '#channels'}
                  icon="broadcast" label="Online TV" under="Channels & Broadcasts"
                  empty={!newest('channel')} />
          )}
          <Rail href="#library" icon="library" label="Library"
                under="Media & Recordings" count={live.length} />

          <hr style={{
            border: 0, borderTop: '1px solid var(--ink-750)',
            margin: '14px 10px',
          }} />

          {has('online-tv') && (
            <>
              <Rail href="#channels" icon="channels" label="Channels" />
              <Rail href={hero ? `${hero.href}#distribution` : '#channels'}
                    icon="distribution" label="Distribution"
                    empty={!hero} />
            </>
          )}
          <Rail href="/settings" icon="settings" label="Settings" />
          {/*
            * NO "SHARED WITH ME". This instance has one owner, so it would
            * be a row that never does anything — and a menu that lies is
            * worse than a short one.
            */}
        </div>

        <div style={{ flex: '0 0 auto', padding: 14 }}>
          <StorageCard space={space} />
        </div>
      </nav>

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
          <RuntimePill runtime={runtime} />
        </header>

        {/* ---- the page ------------------------------------------- */}
        <div id="top" style={{
          flex: '1 1 0', minHeight: 0, overflowY: 'auto',
          padding: '26px 24px 40px',
        }}>
          <div style={{
            display: 'grid', gap: 22, alignItems: 'start',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 306px)',
          }}>
            {/* ======== the left column ========================== */}
            <div style={{ minWidth: 0 }}>
              <Greeting name={account.name} />

              {hero
                ? <Hero channel={hero} onRow={onRow} open={fromButton}
                        items={itemsFor} records={live} />
                : <NoChannel start={starters.tv} />}

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
                    starter={starters[studio.studio]}
                    opened={opened === studio.studio}
                    onToggle={() => setOpened(
                      opened === studio.studio ? null : studio.studio)}
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
                        background: studio.accent,
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
              <QuickActions hero={hero} onStart={setOpened} />
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

function Rail({
  href, icon, label, under, count, current, empty,
}: {
  href: string; icon: IconName; label: string; under?: string;
  count?: number; current?: boolean; empty?: boolean;
}) {
  const Tag = href.startsWith('#') ? 'a' : Link;
  return (
    <Tag
      href={href}
      data-testid="rail-link"
      aria-current={current ? 'page' : undefined}
      title={empty ? `Nothing in ${label} yet` : undefined}
      /*
        * THE CHOSEN ROW IS MARKED ON ITS LEADING EDGE, not merely tinted.
        * A wash alone is a colour-only difference — invisible in
        * greyscale, and the first thing to go on a bad panel in a bright
        * room. A bar on the leading edge is found without comparing, and
        * it is the convention every editor and every mail client uses for
        * the same reason. [D-04, U-19]
        */
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
        padding: '9px 10px', borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: current ? 'var(--ink-000)' : 'var(--ink-200)',
        background: current ? 'var(--accent-wash)' : 'transparent',
        boxShadow: current ? 'inset 2px 0 0 var(--accent)' : 'none',
        opacity: empty ? 0.45 : 1,
        transition: 'background-color var(--motion-fast) var(--ease-out),'
          + ' color var(--motion-fast) var(--ease-out)',
      }}
    >
      <span aria-hidden="true" style={{
        color: current ? 'var(--accent-soft)' : 'var(--ink-400)',
      }}><Icon name={icon} size={17} /></span>
      <span className="grow" style={{ minWidth: 0, lineHeight: 1.25 }}>
        <span style={{
          display: 'block', fontSize: 'var(--text-base)',
          fontWeight: current ? 'var(--weight-semi)' : 'var(--weight-medium)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{label}</span>
        {under && (
          <span style={{
            display: 'block', fontSize: 'var(--text-2xs)',
            color: 'var(--ink-400)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{under}</span>
        )}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{
          flex: '0 0 auto', fontSize: 'var(--text-2xs)',
          fontVariantNumeric: 'tabular-nums',
          padding: '1px 6px', borderRadius: 'var(--radius-full)',
          background: 'var(--ink-750)', color: 'var(--ink-200)',
        }}>{count}</span>
      )}
    </Tag>
  );
}

function StorageCard({ space }: { space: SpaceReading }) {
  const percent = Math.round(space.fraction * 100);
  return (
    <div data-testid="storage" style={{
      padding: 12, borderRadius: 'var(--radius-lg)',
      background: 'var(--ink-850)',
      border: 'var(--border) solid var(--ink-750)',
    }}>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <span aria-hidden="true" style={{ color: 'var(--ink-400)' }}>
          <Icon name="disk" size={15} />
        </span>
        <span className="grow" style={{
          fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semi)',
          color: 'var(--ink-100)',
        }}>Storage</span>
        <span style={{
          fontSize: 'var(--text-2xs)', color: 'var(--ink-300)',
          fontVariantNumeric: 'tabular-nums',
        }}>{percent}%</span>
      </div>
      {/*
        * TWO MEASUREMENTS, SAID SEPARATELY. What this workspace holds and
        * what the disk has left are different numbers, and one line
        * reading "10 GB used" above a bar drawn at ninety per cent is a
        * widget contradicting itself.
        */}
      <div style={{
        fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
        marginTop: 6, lineHeight: 1.5,
      }}>
        {space.partial && 'over '}{space.used} of work<br />
        {space.free} free of {space.total}
      </div>
      <div style={{
        height: 5, borderRadius: 3, background: 'var(--ink-700)',
        marginTop: 8, overflow: 'hidden',
      }} title={`The disk is ${percent}% full. `
        + `This workspace holds ${space.used} of that.`}>
        <div style={{
          height: '100%', width: `${Math.min(100, space.fraction * 100)}%`,
          minWidth: space.fraction > 0 ? 2 : 0,
          borderRadius: 3,
          background: space.fraction > 0.9 ? 'var(--state-bad)'
            : space.fraction > 0.75 ? 'var(--state-warn)'
              : 'linear-gradient(90deg, var(--accent-deep), var(--accent-soft))',
        }} />
      </div>
    </div>
  );
}

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
      data-testid="hero" className="panel"
      {...(record ? onRow(channel.name, () => items(record)) : {})}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 232px) minmax(0, 1fr)',
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
      <div aria-hidden="true" style={{
        position: 'relative', background: 'var(--surface-sunk)',
        minHeight: 148,
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

function NoChannel({ start }: { start: React.ReactNode }) {
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
      {start}
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

/**
 * TWO LETTERS IN THE PLATFORM'S COLOUR, rather than a logo file.
 *
 * A row of five identical grey squares is a row nobody scans: the whole
 * value of a platform badge is being recognised before it is read.
 * Colour does that, and the letters do it again for anybody who cannot
 * see the colour — which is the U-19 rule arriving somewhere it is easy
 * to forget, because a brand mark feels like decoration. [U-19]
 *
 * They are letterforms and not the brands' own marks on purpose: a
 * trademarked logo redistributed in a product is a licensing question
 * nobody here has asked, and these say the same thing.
 */
const MARK: Record<string, { text: string; ink: string; wash: string }> = {
  own: { text: 'BV', ink: 'var(--studio-tv)', wash: 'var(--studio-tv-wash)' },
  youtube: {
    text: 'YT', ink: 'var(--platform-youtube)',
    wash: 'var(--platform-youtube-wash)',
  },
  facebook: {
    text: 'f', ink: 'var(--platform-facebook)',
    wash: 'var(--platform-facebook-wash)',
  },
  tiktok: {
    text: 'TT', ink: 'var(--platform-tiktok)',
    wash: 'var(--platform-tiktok-wash)',
  },
  x: { text: 'X', ink: 'var(--platform-x)', wash: 'var(--platform-x-wash)' },
};

function QuickActions({
  hero, onStart,
}: { hero: HeroChannel | null; onStart: (studio: Studio) => void }) {
  /*
   * FIVE THINGS, EACH OF WHICH GOES SOMEWHERE THAT EXISTS. The temptation
   * in a panel like this is to list what the product ought to be able to
   * do; every row here is a route or a form already in the build, and
   * the ones that need a channel say so when there is not one, rather
   * than leading somewhere that 404s.
   */
  const actions: {
    icon: IconName; label: string; hint: string;
    href?: string; onSelect?: () => void; off?: string;
  }[] = [
    {
      icon: 'live', label: 'Go live now', hint: 'Start a live broadcast',
      href: hero ? `${hero.href}#live` : undefined,
      off: hero ? undefined : 'Make a channel first',
    },
    {
      icon: 'upload', label: 'Upload media',
      hint: 'Bring in a video or a song',
      onSelect: () => onStart('one'),
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
      onSelect: () => onStart('two'),
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
          return action.href ? (
            <Link key={action.label} href={action.href}
                  data-testid="quick-action" style={look}>{body}</Link>
          ) : (
            <button key={action.label} type="button" data-testid="quick-action"
                    onClick={action.onSelect} style={look}>{body}</button>
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
  studio, mine, starter, opened, onToggle,
}: {
  studio: (typeof STUDIOS)[number];
  mine: WorkRecord[];
  starter: React.ReactNode;
  opened: boolean;
  onToggle: () => void;
}) {
  const newest = mine[0];
  return (
    <div data-testid="studio-card" data-studio={studio.studio}
         className="panel" style={{
           padding: 0, overflow: 'hidden',
           borderRadius: 'var(--radius-xl)',
           display: 'flex', flexDirection: 'column',
         }}>
      {/*
        * THE ART IS THE PERSON'S OWN WORK, not a stock photograph of a
        * studio they have never been in. A frame from the newest thing
        * they made in this room, and the room's own colour when it is
        * empty — which is itself information: an empty card is a room
        * you have not used.
        */}
      <div aria-hidden="true" style={{
        height: 104, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(140deg, ${studio.veil},`
          + ' var(--surface-sunk))',
      }}>
        <span style={{
          position: 'absolute', inset: 0, opacity: 0.85,
        }}><Still src={newest?.poster ?? null} /></span>
        <span style={{
          position: 'absolute', left: 12, top: 12,
          width: 30, height: 30, borderRadius: 'var(--radius-screen)',
          display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,0.72)',
          border: '1px solid rgba(255,255,255,0.14)',
          color: 'var(--text-on-accent)',
        }}><Icon name={studio.icon} size={15} /></span>
      </div>

      <div style={{
        padding: 14, display: 'flex', flexDirection: 'column',
        gap: 5, flex: '1 1 auto',
      }}>
        <span style={{
          fontSize: 'var(--text-2xs)', letterSpacing: '0.1em',
          fontWeight: 'var(--weight-bold)', color: 'var(--ink-400)',
        }}>{studio.label}</span>
        <strong style={{
          fontSize: 'var(--text-md)',
          letterSpacing: 'var(--tracking-tight)',
        }}>{studio.name}</strong>
        <p style={{
          margin: 0, fontSize: 'var(--text-2xs)',
          color: 'var(--text-faint)',
          lineHeight: 'var(--leading-snug)',
        }}>{studio.blurb}</p>
        <span className="grow" />

        <div className="row" style={{
          gap: 8, marginTop: 10, flexWrap: 'nowrap',
        }}>
          {newest ? (
            <Link href={newest.href} data-testid="open-studio" style={{
              flex: '1 1 0', textAlign: 'center', padding: '8px 10px',
              borderRadius: 'var(--radius-md)', textDecoration: 'none',
              background: studio.accent, color: 'var(--text-on-accent)',
              fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semi)',
              boxShadow: 'var(--elev-2)',
            }}>
              {/* The arrow is drawn: → is a different length, weight and
                  baseline in every font, and there are three of these
                  side by side on the same row. */}
              <span className="row" style={{
                gap: 6, justifyContent: 'center',
              }}>{studio.open}<Icon name="arrow" size={13} /></span>
            </Link>
          ) : (
            <button type="button" data-testid="open-studio" onClick={onToggle}
                    style={{
                      flex: '1 1 0', padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      background: studio.accent, borderColor: studio.accent,
                      color: 'var(--text-on-accent)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--weight-semi)',
                      boxShadow: 'var(--elev-2)',
                    }}>
              <span className="row" style={{
                gap: 6, justifyContent: 'center',
              }}>{studio.open}<Icon name="arrow" size={13} /></span>
            </button>
          )}
          <button type="button" data-testid="new-in-studio"
                  aria-label={`New in ${studio.name}`}
                  aria-expanded={opened}
                  onClick={onToggle}
                  style={{
                    flex: '0 0 auto', width: 34, padding: '8px 0',
                    borderRadius: 'var(--radius-md)',
                    display: 'grid', placeItems: 'center',
                  }}><Icon name="plus" size={14} /></button>
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

        {opened && (
          <div style={{
            marginTop: 10, paddingTop: 12,
            borderTop: 'var(--border) solid var(--line)',
          }}>{starter}</div>
        )}
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
function Still({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  const check = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setBroken(true);
  }, []);
  if (!src || broken) return null;
  return (
    <img alt="" src={src} ref={check} onError={() => setBroken(true)} style={{
      width: '100%', height: '100%', objectFit: 'cover', display: 'block',
    }} />
  );
}
