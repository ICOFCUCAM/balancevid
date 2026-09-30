import Link from 'next/link';

import Icon, { type IconName } from './Icon.js';
import { ROOMS, roomFor } from '../src/domain/rooms.js';
import type { StudioId } from '../src/domain/account.js';

/**
 * The building's own directory, in every room of it.
 *   [D-19, D-24, U-19; MASTER-EDIT §11]
 *
 * THIS LIVED INSIDE `Workspace.tsx` AND THE ROOMS DID NOT HAVE IT, which
 * is why a room read as a page between Home and a studio rather than as
 * somewhere inside the building: no rail, no way to the other two rooms,
 * and a single "Home" link back out. A person standing in Studio One
 * could not see that Studio Two existed.
 *
 * SO IT MOVED OUT WHOLE rather than being drawn again. A second rail is
 * how two surfaces come to disagree about how many rooms there are, and
 * this product has spent three cycles removing exactly that kind of
 * second copy.
 */

export interface SpaceReading {
  used: string;
  free: string;
  total: string;
  fraction: number;
  partial?: boolean;
}

export function RailRow({
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
        {/*
          * Its `display` is in CSS for the fourth time in this change:
          * the phone rule hides this line, and `display: block` written
          * here would beat it.
          */}
        {under && (
          <span data-rail-under="" className="rail-under">{under}</span>
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

/**
 * Every destination in the building, with the one you are in marked.
 *
 * WHAT VARIES BETWEEN THE HOME PAGE AND A ROOM IS TWO THINGS and they
 * are both arguments: which row is current, and whether the anchors
 * that scroll the home page need a `/` in front of them. Everything
 * else — the order, the words, the counts, the storage meter — is the
 * building and is the same wherever you are standing.
 */
export function BuildingRail({
  owned, libraryCount, space, current, atHome = false, heroHref,
}: {
  owned: StudioId[];
  libraryCount: number;
  space: SpaceReading;
  /** Which row to mark, by studio, or the home page itself. */
  current: StudioId | 'home';
  /**
   * True on the home page, where `#library` scrolls.
   *
   * FROM A ROOM THE SAME ANCHOR HAS TO CARRY THE PATH, or it scrolls
   * the room to a section that is not in it — which is a link that
   * silently does nothing, the worst kind.
   */
  atHome?: boolean;
  /** The newest channel, for the Distribution row. */
  heroHref?: string;
}) {
  const has = (id: StudioId) => owned.includes(id);
  const at = (anchor: string) => (atHome ? anchor : `/${anchor}`);

  return (
    <nav data-testid="workspace-rail" className="building-rail" style={{
      background: 'var(--ink-900)',
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

      <div className="building-rail-links">
        <RailRow href={atHome ? '#top' : '/'} icon="home" label="Home"
                 current={current === 'home'} />
        {ROOMS.filter((room) => has(room.id)).map((room) => (
          <RailRow key={room.id} href={room.href} label={room.tab}
                   icon={ICONS[room.id]} under={UNDER[room.id]}
                   current={current === room.id} />
        ))}
        <RailRow href={at('#library')} icon="library" label="Library"
                 under="Media & Recordings" count={libraryCount} />

        <hr style={{
          border: 0, borderTop: '1px solid var(--ink-750)',
          margin: '14px 10px',
        }} />

        {has('online-tv') && (
          <>
            <RailRow href={at('#channels')} icon="channels" label="Channels" />
            <RailRow href={heroHref ? `${heroHref}#distribution` : at('#channels')}
                     icon="distribution" label="Distribution"
                     empty={!heroHref} />
          </>
        )}
        <RailRow href="/settings" icon="settings" label="Settings" />
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
  );
}

/**
 * The glyph and the second line belong to the room, but not in
 * `rooms.ts` — an icon name and a rail sublabel are this file's
 * business, and `rooms.ts` is read by the domain.
 */
const ICONS: Record<StudioId, IconName> = {
  'studio-one': 'conversation', 'studio-two': 'music', 'online-tv': 'broadcast',
};
const UNDER: Record<StudioId, string> = {
  'studio-one': 'Conversations',
  'studio-two': 'Performance',
  'online-tv': 'Channels & Broadcasts',
};
