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
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import {
  FAVORITES_KEY, isFavorite, readFavorites, withFavorite, withoutFavorite,
} from '../../src/domain/favorites.js';
import { useInstallOffer } from '../useInstallOffer.js';

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
  /*
   * THE ONE ENTRY IN THE BRIEF'S OWN NAVIGATION THAT WAS MISSING:
   * "HOME · LIVE · GUIDE · CHANNELS · SEARCH · FAVORITES". [N-9]
   */
  { at: '/tv/favorites', says: 'Favorites' },
];

/* ------------------------------------------------------------------ *
 *  The channels this viewer keeps.  [N-9]
 * ------------------------------------------------------------------ */

/**
 * The list, read once and written back on every change.
 *
 * READ IN AN EFFECT AND NOT AT FIRST RENDER, which is not a
 * React detail: these pages are SERVER-RENDERED, and storage
 * does not exist on the server. Reading it during render would
 * make the first client paint disagree with the HTML that
 * arrived, which React discards the whole tree over.
 *
 * SO THE FIRST PAINT HAS NO STARS, and that is the honest
 * ordering: the channels are the page and the stars are the
 * viewer's marks on it. A grid that waited for storage would be
 * a grid a crawler reads as empty. [D-04]
 *
 * EVERY READ AND WRITE IS GUARDED. Storage throws outright in a
 * private window on some browsers, and a television network that
 * will not render because a star could not be saved is a worse
 * outcome than a star that does not save.
 */
export function useFavorites() {
  const [list, setList] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setList(readFavorites(window.localStorage.getItem(FAVORITES_KEY)));
    } catch {
      /* No storage here. The pages all still work. */
    }
    setReady(true);
  }, []);

  const toggle = useCallback((slug: string) => {
    setList((was) => {
      const next = isFavorite(was, slug)
        ? withoutFavorite(was, slug) : withFavorite(was, slug);
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* Kept for this visit and not beyond it. */
      }
      return next;
    });
  }, []);

  return { list, ready, toggle };
}

/**
 * The star.
 *
 * A BUTTON INSIDE A LINK IS A CARD YOU CANNOT CLICK, so this sits
 * beside the card rather than within it and the click is stopped
 * from reaching anything behind it.
 *
 * LABELLED, NOT JUST DRAWN. A star with no accessible name is a
 * control a screen reader announces as "button", and the label
 * says which channel as well as which way it goes — there are as
 * many of these on the page as there are channels.
 */
export function Star(
  { slug, name, on, onToggle }: {
    slug: string; name: string; on: boolean; onToggle: (slug: string) => void;
  },
) {
  return (
    <button type="button" data-testid="tv-star" data-slug={slug}
            data-on={on ? 'true' : 'false'}
            aria-pressed={on}
            aria-label={on ? `Remove ${name} from favorites`
              : `Keep ${name} in favorites`}
            title={on ? 'In your favorites' : 'Keep this channel'}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggle(slug);
            }}
            style={{
              flex: '0 0 auto', width: 34, height: 34, padding: 0,
              display: 'grid', placeItems: 'center', cursor: 'pointer',
              background: 'transparent', borderRadius: 'var(--radius-control)',
              border: '1px solid var(--line)',
              color: on ? 'var(--accent)' : 'var(--ink-400)',
            }}>
      {/* A GLYPH IS WHATEVER FONT THE READER HAS, and the reader
          may be a television. Drawn, not typed. */}
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
           focusable="false"
           fill={on ? 'currentColor' : 'none'} stroke="currentColor"
           strokeWidth={1.6} strokeLinejoin="round"
           style={{ display: 'block' }}>
        <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z" />
      </svg>
    </button>
  );
}

/**
 * The network, installed.  [N-9]
 *
 * IN THE HEADER AND NOT IN A BANNER, because a banner over a
 * channel grid is an advertisement for the thing the viewer is
 * already using. One word beside Sign in, on every page of the
 * network, and absent entirely on a browser that cannot install
 * or a viewer who already has.
 *
 * IT APPEARS ONLY WHEN THERE IS SOMETHING TO OFFER. Chromium
 * fires `beforeinstallprompt` only when the page actually
 * qualifies — manifest, icons, a service worker — so this is also
 * the honest test of whether the network is installable at all.
 */
function InstallTv() {
  const { offered, teach, gone, install, dismiss } = useInstallOffer();
  if (gone || (!offered && !teach)) return null;
  if (teach && !offered) {
    /* Safari has Add to Home Screen and no API for it, so it is
       told rather than left out — in the share sheet's own words. */
    return (
      <span className="small muted" data-testid="tv-install-teach"
            style={{ fontSize: 'var(--text-2xs)' }}>
        Share → Add to Home Screen
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 'var(--space-3)' }}>
      <button type="button" data-testid="tv-install" className="small"
              onClick={() => void install()}
              style={{
                padding: '5px 11px', cursor: 'pointer', fontWeight: 600,
                color: 'var(--text)', background: 'transparent',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-control)',
              }}>Install</button>
      <button type="button" data-testid="tv-install-no" className="small muted"
              onClick={dismiss}
              style={{
                padding: 0, cursor: 'pointer', background: 'transparent',
                border: 'none', color: 'var(--muted)',
                fontSize: 'var(--text-2xs)',
              }}>Not now</button>
    </span>
  );
}

/**
 * The service worker, registered.
 *
 * WITHOUT IT NOTHING INSTALLS: a browser's install criteria are a
 * manifest, icons AND a worker with a fetch handler. What this
 * one adds beyond qualifying is one thing, and it is the honest
 * one — an installed app that opens to a browser error page looks
 * broken, and one that opens to its own name saying "no
 * connection" looks like an app. It caches no page, because you
 * cannot watch television offline and a stale guide is a page
 * lying about what is on.
 *
 * SCOPED TO `/tv`, so the control room is not a television app's
 * business. A worker's scope cannot rise above its own path,
 * which is why the file sits at the root. [N-9]
 */
function TvWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    /* Registration failures are not worth telling a viewer about:
       the network works, and this only ever added an apology. */
    void navigator.serviceWorker.register('/tv-sw.js', { scope: '/tv' })
      .catch(() => undefined);
  }, []);
  return null;
}

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
        <InstallTv />
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
      <TvWorker />
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
        {/* Clear of the star, which sits over the top-right
             corner on the grid. [N-9] */}
        <div style={{ minWidth: 0, paddingRight: 42 }}>
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
export function ChannelGrid(
  { channels, empty }: { channels: Listing[]; empty?: ReactNode },
) {
  /*
   * THE STARS LIVE ON THE GRID AND NOT ON THE CARD, because a
   * card is a link and a button inside a link is a card you
   * cannot click. One read of storage per grid rather than one
   * per card, which also means the whole page turns its stars on
   * at the same instant. [N-9]
   */
  const { list, ready, toggle } = useFavorites();
  if (channels.length === 0) {
    return empty ?? (
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
        /*
          * THE STAR SITS OVER THE CARD'S CORNER, not beside it in
          * a flex row. It was beside it first, and `.row` wraps:
          * in a 260px grid cell a card whose name does not shrink
          * pushed the star onto a line of its own, under the card,
          * on exactly the channels with longer names. Found by
          * looking at the screenshot, where one of two cards had
          * it and the other did not.
          */
        <div key={channel.slug} style={{ position: 'relative' }}>
          <ChannelCard channel={channel} />
          {/* Nothing until storage has been read, so the first
              paint matches the HTML that arrived. */}
          {ready && (
            <span style={{ position: 'absolute', top: 10, right: 10 }}>
              <Star slug={channel.slug} name={channel.name}
                    on={isFavorite(list, channel.slug)} onToggle={toggle} />
            </span>
          )}
        </div>
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
