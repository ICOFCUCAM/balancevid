'use client';

/**
 * The furniture every page of the network shares.
 *   [Doctrine CHANNEL §2, D-04, TV-NETWORK N-4]
 *
 * ONE HEADER AND ONE CARD, because the directory, the guide, the
 * search and the station page are one product and four pages that
 * each drew their own would be four products. The control room
 * learned this the expensive way — *"every rail built its own
 * markup"* — and this is the same lesson applied before the second
 * page exists rather than after the fourth.
 *
 * NOTHING HERE KNOWS ABOUT AN ACCOUNT. These pages are served to
 * strangers and must render identically to somebody who has never
 * signed in, which is most of the people who will ever see them.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface Listing {
  slug: string;
  name: string;
  callsign?: string;
  says: string;
  description?: string;
  genre?: string;
  language?: string;
  country?: string;
  logoAssetId?: string;
}

const WAYS = [
  { at: '/tv', says: 'Live' },
  { at: '/tv/channels', says: 'Channels' },
  { at: '/tv/guide', says: 'Guide' },
  { at: '/tv/search', says: 'Search' },
];

export function TvFrame(
  { here, children }: { here: string; children: ReactNode },
) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="row" style={{
        gap: 'var(--space-5)', alignItems: 'center', flexWrap: 'wrap',
        padding: '14px var(--space-6)',
        borderBottom: '1px solid var(--line)',
      }}>
        <Link href="/tv" style={{
          fontWeight: 700, letterSpacing: '0.06em', textDecoration: 'none',
          color: 'var(--text)',
        }}>BalanceVid <span style={{ color: 'var(--accent)' }}>TV</span></Link>
        <nav className="row" style={{ gap: 'var(--space-4)' }}>
          {WAYS.map((way) => (
            <Link key={way.at} href={way.at} data-testid="tv-way"
                  data-here={way.at === here ? 'true' : 'false'}
                  style={{
                    fontSize: 'var(--text-sm)', textDecoration: 'none',
                    color: way.at === here ? 'var(--text)' : 'var(--muted)',
                    borderBottom: way.at === here
                      ? '2px solid var(--accent)' : '2px solid transparent',
                    paddingBottom: 2,
                  }}>{way.says}</Link>
          ))}
        </nav>
        <span className="grow" />
        {/*
          * THE WAY BACK TO THE PRODUCT, and it is a quiet link
          * rather than a call to action. Somebody watching
          * television is not in the middle of buying software.
          */}
        <Link href="/signin" className="small muted"
              style={{ textDecoration: 'none' }}>Sign in</Link>
      </header>
      <main style={{ padding: 'var(--space-6)', maxWidth: 1180, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}

/**
 * A channel, as a card.
 *
 * THE LOGO IS A LIBRARY ASSET, served by the route that already
 * serves every other picture — a channel that has not uploaded one
 * gets its callsign, and a channel with neither gets the first
 * letter of its name. Three fallbacks because a directory of a
 * thousand channels will contain all three. [§3, D-18]
 */
export function ChannelCard({ channel }: { channel: Listing }) {
  const mark = channel.callsign ?? channel.name.slice(0, 2).toUpperCase();
  return (
    <Link href={`/tv/channels/${channel.slug}`} data-testid="tv-channel-card"
          data-slug={channel.slug}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={{
        display: 'flex', gap: 'var(--space-4)', alignItems: 'center',
        padding: 'var(--space-4)', borderRadius: 'var(--radius-screen)',
        border: '1px solid var(--line)', background: 'var(--panel)',
        height: '100%',
      }}>
        <div aria-hidden="true" style={{
          /* A LOGO IS A PICTURE, so it is rounded like a screen and
             not like a card — the house rule the console test
             enforces across every surface. [D-19, brief §4] */
          flex: '0 0 auto', width: 56, height: 56,
          borderRadius: 'var(--radius-screen)',
          display: 'grid', placeItems: 'center', overflow: 'hidden',
          background: 'var(--screen-bed)', border: '1px solid var(--line)',
          fontWeight: 800, letterSpacing: '0.04em', fontSize: 'var(--text-sm)',
          color: 'var(--ink-300)',
        }}>
          {channel.logoAssetId
            // eslint-disable-next-line @next/next/no-img-element
            ? <img alt="" src={`/api/library/${channel.logoAssetId}`}
                   style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : mark}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</div>
          {channel.says && (
            <div className="small muted" data-testid="tv-card-says"
                 style={{ marginTop: 2 }}>{channel.says}</div>
          )}
        </div>
      </div>
    </Link>
  );
}

/** A grid of cards, which three pages draw. */
export function ChannelGrid({ channels }: { channels: Listing[] }) {
  if (channels.length === 0) {
    return (
      <p className="muted" data-testid="tv-empty">
        No channels are listed yet. A channel appears here when its owner
        publishes it and asks to be listed.
      </p>
    );
  }
  return (
    <div data-testid="tv-grid" style={{
      display: 'grid', gap: 'var(--space-4)',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    }}>
      {channels.map((channel) => (
        <ChannelCard key={channel.slug} channel={channel} />
      ))}
    </div>
  );
}
