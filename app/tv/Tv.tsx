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
import { type ReactNode, useState } from 'react';

export interface Listing {
  slug: string;
  name: string;
  number?: number;
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
 * THE LOGO COMES FROM THE STATION'S OWN ROUTE. It used to come
 * from `/api/library/<assetId>`, which is the broadcaster's own
 * monitor and answered 401 to every signed-out viewer — a broken
 * picture on every card of the public network. A channel that has
 * not uploaded one gets its callsign, and a channel with neither
 * gets the first letter of its name. Three fallbacks because a
 * directory of a thousand channels will contain all three.
 * [§3, D-18, N-7]
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
            /*
              * THE STATION'S OWN LOGO ROUTE, NOT THE LIBRARY'S.
              * This drew `/api/library/<assetId>`, which is
              * owner-only, so every logo on the public network
              * was a 401 and a broken picture to the one
              * audience these pages exist for. Keyed by the slug
              * because the question a stranger's request has to
              * answer is about the station, not about an asset.
              * [N-7]
              */
            ? <img alt="" src={`/api/tv/channels/${channel.slug}/logo`}
                   style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : mark}
        </div>
        <div style={{ minWidth: 0 }}>
          {/*
            * THE NUMBER LEADS, because that is what a channel
            * number is for: a lineup is scanned down the numbers
            * and read across the names. It is quiet — a number is
            * furniture, like the ordinal in the control room's
            * rails — and absent entirely on a channel that has
            * none rather than drawn as a gap. [D-04, N-6]
            */}
          <div className="row" style={{ gap: 7, alignItems: 'baseline',
            minWidth: 0 }}>
            {channel.number !== undefined && (
              <span className="mono readout" data-testid="card-number"
                    style={{ flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                      color: 'var(--ink-400)' }}>{channel.number}</span>
            )}
            <span style={{ fontWeight: 600, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>
          </div>
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

/* ------------------------------------------------------------------ *
 *  Taking the network off the web page.
 * ------------------------------------------------------------------ */

function Address({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row" style={{
      gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap',
      padding: '8px 0',
    }}>
      <span className="small muted" style={{ minWidth: 68 }}>{label}</span>
      <code data-testid="tv-export-url" style={{
        flex: '1 1 260px', minWidth: 0, overflowX: 'auto',
        fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
        /* `--surface-sunk`, not `--screen-bed`. The bed is what a
           picture sits on, and the console tests read a sunk
           colour under a radius as a monitor — correctly: this is
           a code chip, and reaching for the screen's token to get
           a darker rectangle is how a page ends up with two kinds
           of black that mean different things. */
        background: 'var(--surface-sunk)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-control)', padding: '6px 10px',
        /* One click selects the whole address, because a half-copied
           URL is the commonest way this goes wrong. */
        userSelect: 'all',
      }}>{url}</code>
      <button type="button" className="small"
              onClick={() => {
                /* Absent outside a secure context, which is most of
                   what this product is served over in development.
                   The address is selectable either way. */
                void navigator.clipboard?.writeText(url)
                  .then(() => { setCopied(true); })
                  .catch(() => undefined);
              }}
              style={{
                border: '1px solid var(--line)', background: 'transparent',
                color: copied ? 'var(--accent)' : 'var(--muted)',
                borderRadius: 'var(--radius-control)', padding: '6px 10px',
                cursor: 'pointer',
              }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

/**
 * How to watch the network on something that is not a browser.
 *   [TV-NETWORK N-7]
 *
 * > *"EPG data can also be exported to standard TV/IPTV clients
 * > alongside channel streams."*
 *
 * TWO ADDRESSES ON THE FRONT PAGE, because the finding this whole
 * network stage keeps making is that the capability was built and
 * nothing pointed at it. An M3U nobody can discover is the
 * channel that was publicly watchable for a year and unfindable
 * for exactly as long.
 *
 * AND ONE IS USUALLY ENOUGH: the lineup names the guide on its
 * own header, so a client that accepts a playlist URL gets both.
 * The guide is listed second for the clients that ask separately.
 */
export function TvApps({ origin }: { origin: string }) {
  return (
    <section data-testid="tv-apps" style={{
      marginTop: 'var(--space-7)', paddingTop: 'var(--space-5)',
      borderTop: '1px solid var(--line)',
    }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--text-md)' }}>
        Watch on your television
      </h2>
      <p className="muted small" style={{ margin: '0 0 var(--space-3)' }}>
        The whole lineup, for any IPTV player or set-top box. Paste the
        playlist address — it carries the guide with it.
      </p>
      <Address label="Playlist" url={`${origin}/api/tv/playlist.m3u`} />
      <Address label="Guide" url={`${origin}/api/tv/guide.xml`} />
    </section>
  );
}
