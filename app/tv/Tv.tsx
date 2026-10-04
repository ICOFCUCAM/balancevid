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
  FAVORITES_KEY, isFavorite, readFavorites, withFavorite, withFavorites,
  withoutFavorite,
} from '../../src/domain/favorites.js';

export { isFavorite };
import { useInstallOffer } from '../useInstallOffer.js';
import Icon from '../Icon.js';
import { NETWORK_ART } from './art.js';
import { asWord, markFor } from './kinds.js';
import { identityFor } from './art.js';

/* The ground behind a station with no logo. It moved to `art.js`
   when a SERVER page needed it, and is re-exported because four
   client modules already ask this file for it. [D-19] */
export { identityFor };

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
  /** The photograph behind the station's name. [N-4] */
  bannerAssetId?: string;
}

const WAYS = [
  /*
   * HOME AND *LIVE TV* ARE ONE PAGE HERE, so there is one entry.
   * The benchmark's header carries both; on this network the front
   * page IS what is on, and two links to one address is a menu
   * that teaches somebody one of them is broken. [D-19]
   */
  { at: '/tv', says: 'Home' },
  { at: '/tv/guide', says: 'Guide' },
  { at: '/tv/channels', says: 'Channels' },
  { at: '/tv/categories', says: 'Categories' },
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

  /*
   * ADDING SEVERAL AT ONCE, for a list carried here in a link.
   * It goes through `withFavorites`, which is a fold of the same
   * `withFavorite` the star uses, so a carried list cannot be a
   * second way past the bound on storage. [N-9, D-19]
   */
  const keep = useCallback((slugs: readonly string[]) => {
    setList((was) => {
      const next = withFavorites(was, slugs);
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* Kept for this visit and not beyond it. */
      }
      return next;
    });
  }, []);

  return { list, ready, toggle, keep };
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
  { here, children, bare }: {
    here: string; children: ReactNode;
    /** The page lays out its own full-width bands. [front page] */
    bare?: boolean;
  },
) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/*
        * A STATION IDENT, NOT AN APP BAR.
        *
        * The header was the product's name in letter-spaced caps
        * with five links beside it — which is what a tool's
        * toolbar looks like. A television network's header is an
        * IDENT: a mark, the channel's name, and the strapline that
        * says what kind of network it is. The person reading this
        * page has never heard of the software. [N-4]
        */}
      <header className="net-bar">
        <Link href="/tv" className="net-ident" data-testid="tv-ident">
          <span aria-hidden="true" className="net-ident-mark">
            <Icon name="play" size={15} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="net-ident-name">
              BalanceVid <span style={{ color: 'var(--accent)' }}>TV</span>
            </span>
            <span className="net-ident-says">
              Global channels · Real people · Real stories
            </span>
          </span>
        </Link>
        <nav className="net-nav">
          {WAYS.map((way) => (
            <Link key={way.at} href={way.at} data-testid="tv-way"
                  className="net-way"
                  data-here={way.at === here ? 'true' : 'false'}>
              {way.says}
            </Link>
          ))}
        </nav>
        <span className="grow" />
        <InstallTv />
        {/*
          * THE WAY BACK TO THE PRODUCT, and it is a quiet link
          * rather than a call to action. Somebody watching
          * television is not in the middle of buying software.
          */}
        {/*
          * A GLYPH, NOT A SENTENCE. *Sign in* in running text next
          * to an install button is two pieces of UI competing in
          * the corner of a shop window; a round mark is what a
          * television service puts there, and it is the quieter of
          * the two. The label stays for a screen reader.
          */}
        <Link href="/signin" className="net-account" aria-label="Sign in"
              data-testid="tv-account">
          <Icon name="person" size={15} />
        </Link>
      </header>
      {/*
        * `bare` IS FOR A PAGE THAT BRINGS ITS OWN FULL-WIDTH BANDS.
        * The front page's hero runs edge to edge under the header,
        * which a centred 1180px column cannot contain — so that
        * page lays itself out and the other four keep the column
        * they were written for. [D-19]
        */}
      {bare ? children : (
        <main style={{ padding: 'var(--space-6)', maxWidth: 1180, margin: '0 auto' }}>
          {children}
        </main>
      )}
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

/*
 * EXPORTED BECAUSE A SECOND SURFACE NOW ASKS. Favourites carries
 * a viewer's lineup to another device in a link, and the hard
 * part of that is the same hard part as the M3U address: a
 * half-copied URL is the commonest way this goes wrong, and the
 * fix — one click selects the whole thing, and a Copy that knows
 * `navigator.clipboard` is absent outside a secure context —
 * has already been found once. [D-19, N-9]
 */
export function Address({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    /*
      * NOT `flexWrap: 'wrap'`, WHICH PUT THE BUTTON UNDER THE FIELD.
      *
      * At 390px the label, the address and *Copy* cannot share a
      * line, so the row wrapped and the button landed below a box
      * it no longer looked attached to — found in a screenshot of
      * the phone. An address is horizontally scrollable and a
      * button is not, so the field is the thing that gives way.
      */
    <div className="row net-address" style={{
      gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'nowrap',
      padding: '8px 0',
    }}>
      <span className="small muted net-address-label"
            style={{ minWidth: 68 }}>{label}</span>
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

/* ------------------------------------------------------------------ *
 *  The front page's own bands.  [TV-NETWORK N-4]
 * ------------------------------------------------------------------ */

/**
 * The network, said at the size a network says itself.
 *
 * THE PHOTOGRAPH IS NAMED IN ONE PLACE, `NETWORK_ART` in
 * `app/tv/art.ts`, so replacing it is one string and not a search
 * through markup. It defaults to the picture this product already
 * owns — the one the studio introduces the Online TV room with —
 * so the front door and the room behind it are recognisably the
 * same place until better artwork arrives. [D-19]
 *
 * THE GENRES UNDER THE SENTENCE ARE REAL. *Faith · News · Culture*
 * is read off the channels that are actually listed, in the order
 * most of them first — so a network of three faith channels says
 * so, and does not advertise a Sports section nobody can watch.
 * [D-21]
 */
export function NetworkHero(
  { genres, watch, channels, more }: {
    genres: string[]; watch: string | null; channels: number;
    /** Whether the line was cut short, so *More* means something. */
    more?: boolean;
  },
) {
  return (
    <section className="net-hero" data-testid="tv-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="net-hero-art" src={NETWORK_ART.hero}
           style={{ objectPosition: NETWORK_ART.heroFocus }} />
      <span aria-hidden="true" className="net-hero-veil" />
      <div className="net-hero-said">
        <p className="net-eyebrow">The world in one network</p>
        <h1 className="net-title">
          BalanceVid <span style={{ color: 'var(--accent)' }}>TV</span>
        </h1>
        <p className="net-lede">
          Live television from channels around the world.
        </p>
        {genres.length > 0 && (
          <p className="net-genres" data-testid="tv-hero-genres">
            {genres.map(asWord).join(' · ')}
            {/*
              * *MORE* IS A DOOR, NOT A WORD. The benchmark ends
              * this line with it; printed as plain text it is a
              * promise with nothing behind it, so it goes only
              * where there are genres this line did not fit, and
              * it opens the page that has them all.
              */}
            {more && (
              <> · <Link href="/tv/categories" data-testid="tv-hero-more"
                         style={{ color: 'var(--ink-200)' }}>More</Link></>
            )}
          </p>
        )}
        <div className="net-hero-doors">
          {/*
            * THE FIRST DOOR GOES SOMEWHERE OR IS NOT THERE.
            *
            * *Watch Live TV* on a network with nothing on air is the
            * button that teaches somebody the product is broken. With
            * no channel to send them to, the page offers the
            * directory instead and says the truth above it. [U-19]
            */}
          {watch ? (
            <Link href={watch} className="net-door net-door-lit"
                  data-testid="tv-hero-watch">
              <Icon name="play" size={15} /> Watch Live TV
            </Link>
          ) : null}
          <Link href="/tv/channels"
                className={watch ? 'net-door net-door-outline' : 'net-door net-door-lit'}
                data-testid="tv-hero-browse">
            {channels === 1 ? 'See the channel' : 'Explore channels'}
          </Link>
        </div>
      </div>
    </section>
  );
}


/**
 * One channel, as a tile on the shelf.
 *
 * IT CARRIES WHAT THE BENCHMARK'S CARD DID NOT, because this
 * network already knows it and a card that withheld it would be a
 * redesign that cost the product something. `nowAndNext` answers
 * what is on this minute; the station page has shown it since N-5
 * and the directory never did. A television listing whose tiles say
 * only the channel's name is a listing you have to open six times
 * to find out what to watch.
 */
export function NetworkCard(
  { channel, live, now }: {
    channel: Listing; live?: boolean; now?: string | null;
  },
) {
  const mark = channel.callsign ?? channel.name.slice(0, 2).toUpperCase();
  return (
    <Link href={`/tv/channels/${channel.slug}`} className="net-card"
          data-testid="tv-channel-card" data-slug={channel.slug}
          data-live={live ? 'true' : 'false'}>
      <span className="net-card-art"
            {...(channel.logoAssetId ? {} : { 'data-made': 'true',
              style: identityFor(channel.slug) })}>
        {channel.logoAssetId
          // eslint-disable-next-line @next/next/no-img-element
          ? <img alt="" src={`/api/tv/channels/${channel.slug}/logo`} />
          : <span className="net-card-mark">{mark}</span>}
        {/*
          * THE BADGE SITS ON THE PICTURE, not in the text below it.
          * That is where a television listing puts it, and it is the
          * only place it can be read at a glance down a shelf.
          */}
        {live && (
          <span className="net-live net-live-over" data-testid="card-live">
            LIVE
          </span>
        )}
      </span>
      <span className="net-card-said">
        <span className="net-card-top">
          {channel.number !== undefined && (
            <span className="mono net-card-number" data-testid="card-number">
              {String(channel.number).padStart(3, '0')}
            </span>
          )}
          <span className="net-card-name">{channel.name}</span>
        </span>
        {/*
          * WHAT IS ON, WHERE THERE IS AN ANSWER. A channel between
          * programmes has none, and a line reading "Now:" with
          * nothing after it is worse than no line. [U-19]
          */}
        {/*
          * AND *OFF AIR* IS NOT A PROGRAMME.
          *
          * `nowAndNext` answers *Off air* for a channel between
          * things, which is the truth and the right answer on a
          * station page. Down a shelf of eight it became *Now Off
          * air* eight times — a column of the same two words,
          * which is a listing repeating its null state at the
          * reader. The line is for what is ON; a channel with
          * nothing on says nothing here and the shelf stays
          * readable. Found in a screenshot. [U-19]
          */}
        {now && now.toLowerCase() !== 'off air' && (
          <span className="net-card-now" data-testid="tv-card-now">
            <span className="muted">Now</span> {now}
          </span>
        )}
        {channel.says && (
          <span className="net-card-meta" data-testid="tv-card-says">
            {channel.says}
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * What is on right now, as a shelf.
 *
 * ORDERED LIVE FIRST, and that is the only place on this network
 * where the order is not the name. *Live now* is a claim about this
 * minute; a shelf that opened on a channel playing a repeat while a
 * live one sat off the right-hand edge would be making it falsely.
 */
export function LiveNow(
  { channels, live, now }: {
    channels: Listing[];
    live: Record<string, boolean>;
    now: Record<string, string | null>;
  },
) {
  /*
   * THE STARS COME WITH IT.  [N-9]
   *
   * `useFavorites` and `Star` were built for the grid this shelf
   * replaces, and dropping them would have been a redesign that
   * quietly removed a feature nobody asked to lose. One read of
   * storage for the shelf, and the star sits over the tile's
   * corner rather than inside the link, because a button inside a
   * link is a card you cannot click.
   */
  const { list, ready, toggle } = useFavorites();
  if (channels.length === 0) return null;
  const shelf = [...channels].sort(
    (a, b) => Number(Boolean(live[b.slug])) - Number(Boolean(live[a.slug])));
  return (
    <section className="net-band">
      <div className="net-band-head">
        <h2 className="net-band-title">
          <span aria-hidden="true" className="net-lamp" />
          Live now
        </h2>
        <span className="grow" />
        <Link href="/tv/channels" className="small"
              style={{ textDecoration: 'none', color: 'var(--ink-350)' }}>
          View all
        </Link>
      </div>
      <div className="net-shelf" data-testid="tv-grid">
        {shelf.map((channel) => (
          <div key={channel.slug} style={{ position: 'relative', minWidth: 0 }}>
            <NetworkCard channel={channel}
                         {...(live[channel.slug] ? { live: true } : {})}
                         now={now[channel.slug] ?? null} />
            {ready && (
              <span style={{ position: 'absolute', top: 8, right: 8 }}>
                <Star slug={channel.slug} name={channel.name}
                      on={isFavorite(list, channel.slug)} onToggle={toggle} />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}


/**
 * The genres this network actually carries.
 *
 * READ OFF THE CHANNELS AND NOT A FIXED LIST. A strip of seven
 * categories with three of them empty is a directory advertising
 * what it does not have — and the one thing a viewer does with a
 * category is press it, which on an empty one is a dead end. [D-21]
 */
export function Categories({ genres }: { genres: string[] }) {
  if (genres.length === 0) return null;
  return (
    <div className="net-strip">
      <div className="net-strip-row" data-testid="tv-categories">
        {genres.map((genre) => (
          <Link key={genre} className="net-chip" data-testid="tv-category"
                href={`/tv/search?q=${encodeURIComponent(genre)}`}>
            <span aria-hidden="true" className="net-chip-mark">
              <Icon name={markFor(genre)} size={13} />
            </span>
            {asWord(genre)}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * How far the network reaches, counted rather than claimed.
 *
 * THREE NUMBERS THAT ARE TRUE. The benchmark for this page carried
 * *"54 Countries · 22 Destinations · 5 Regions"*, and two of those
 * three are not things this product knows: a channel has a country
 * and a language and no notion of a destination or a region. So
 * this counts what there is. A network that invented two numbers to
 * fill a line would be a network whose first number nobody should
 * believe either. [D-21, U-19]
 *
 * AND IT SAYS *TODAY*, WHICH IS THE WHOLE DIFFERENCE BETWEEN A
 * COUNT AND A BOUNDARY. A line reading *54 countries* on a shop
 * window reads as the SIZE of the thing — as though fifty-four
 * were what the network is for. This network has no region: it is
 * every station that joins it, and the number is only what has
 * joined so far.
 */
export function Reach(
  { countries, languages, channels }: {
    countries: number; languages: number; channels: number;
  },
) {
  const says = [
    `${channels} ${channels === 1 ? 'channel' : 'channels'}`,
    countries > 0 && `${countries} ${countries === 1 ? 'country' : 'countries'}`,
    languages > 0 && `${languages} ${languages === 1 ? 'language' : 'languages'}`,
  ].filter(Boolean) as string[];
  return (
    <p className="net-reach" data-testid="tv-reach">
      <span className="net-reach-said">
        <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
          <Icon name="broadcast" size={16} />
        </span>
        {says.join(' · ')} on the network today
      </span>
      <span className="grow" />
      <span className="small muted" style={{ fontSize: 'var(--text-2xs)' }}>
        Open to any station, anywhere.
      </span>
    </p>
  );
}

/**
 * The directory's sort, which submits itself.
 *
 * A FORM AND NOT A FETCH. Choosing an order reloads the page with
 * `?order=` on it, so the chosen order is in the URL — shareable,
 * bookmarkable, and the same answer to a crawler as to a person.
 * A dropdown that re-sorted an array in the browser would be an
 * order nobody could link to.
 *
 * AND IT WORKS WITH NO JAVASCRIPT. The `onChange` is a
 * convenience; without it the form still has a submit button,
 * which is what a set-top browser and a text browser get. The one
 * thing this component adds is not having to press it. [U-19]
 */
export function SortBy(
  { order, genre, orders }: {
    order: string; genre?: string; orders: Record<string, string>;
  },
) {
  return (
    <form className="net-sort" action="/tv/channels" method="get"
          data-testid="tv-sort">
      {genre && <input type="hidden" name="genre" value={genre} />}
      <label htmlFor="tv-order" className="small muted">Sort</label>
      <select id="tv-order" name="order" defaultValue={order}
              data-testid="tv-order"
              onChange={(event) => { event.currentTarget.form?.requestSubmit(); }}>
        {Object.entries(orders).map(([key, says]) => (
          <option key={key} value={key}>{says}</option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="ctl sm">Sort</button>
      </noscript>
    </form>
  );
}
