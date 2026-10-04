'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { numberSays } from '../../../../src/domain/registry.js';
import type { Tuning } from '../../../../src/domain/channelListing.js';
import ChannelPlayer from '../../../t/[id]/watch/ChannelPlayer.js';
import Icon from '../../../Icon.js';
import {
  type Listing, identityFor, isFavorite, useFavorites,
} from '../../Tv.js';

/* A focusable target big enough for a thumb and a D-pad. */
const rocker = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', textDecoration: 'none',
  border: '1px solid var(--line)', borderRadius: 'var(--radius-control)',
  color: 'var(--text)', fontWeight: 600,
} as const;

interface On {
  title: string | null;
  kind: string | null;
  live: boolean;
  untilMs: number | null;
  next: string | null;
  nextAt: number | null;
}

/**
 * One station, watched.  [TV-NETWORK N-4]
 *
 * THE SERVER'S ANSWER IS THE FIRST ONE, not a loading state. A
 * station page that renders empty and fills in is a page a crawler
 * reads as empty and a slow connection shows as broken, and the
 * server already knew what was on when it rendered.
 *
 * AND IT IS FOLLOWED AFTERWARDS, because a channel changes
 * programme while somebody is looking at it. Every twenty seconds:
 * often enough that NOW is true, rare enough that a page left open
 * on a phone is not a request every second for an hour.
 */
/** One row of what this station is showing today. */
export interface Slot {
  at: number;
  title: string;
}

export default function Station(
  { channelId, listing, first, tune, today }: {
    channelId: string; listing: Listing; first: On; tune?: Tuning;
    /** What is on today, in order, from the channel's own schedule. */
    today?: Slot[];
  },
) {
  const [on, setOn] = useState<On>(first);

  useEffect(() => {
    let stopped = false;
    const ask = async () => {
      try {
        const response = await fetch(
          `/api/tv/channels/${encodeURIComponent(listing.slug)}`,
          { cache: 'no-store' });
        if (!response.ok || stopped) return;
        const body = await response.text();
        const read = JSON.parse(body) as { on?: On };
        if (read.on && !stopped) setOn(read.on);
      } catch {
        /* A channel whose page cannot refresh is still a channel
           somebody is watching. The player has its own recovery. */
      }
    };
    const every = setInterval(() => { void ask(); }, 20_000);
    return () => { stopped = true; clearInterval(every); };
  }, [listing.slug]);

  /*
   * CHANNEL UP AND CHANNEL DOWN, FROM A KEYBOARD.  [N-9]
   *
   * `ChannelUp`/`ChannelDown` are what a television remote sends
   * where a browser reports them at all; `PageUp`/`PageDown` are
   * what a desktop keyboard has and what most TV browsers map the
   * channel rocker to.
   *
   * AND DELIBERATELY NOT THE ARROW KEYS. A D-pad sends arrows, and
   * arrows are how the viewer moves focus between the links on
   * this page. Hijacking them to change channel would break the
   * remote this exists for — the one input device a TV app can
   * count on. [D-04]
   */
  const upTo = tune?.up?.slug;
  const downTo = tune?.down?.slug;
  useEffect(() => {
    if (!upTo && !downTo) return undefined;
    const press = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      /* Not while somebody is typing into something. */
      const inside = event.target as HTMLElement | null;
      if (inside && /^(INPUT|TEXTAREA|SELECT)$/.test(inside.tagName)) return;
      const go = (event.key === 'ChannelUp' || event.key === 'PageUp')
        ? upTo
        : (event.key === 'ChannelDown' || event.key === 'PageDown')
          ? downTo : undefined;
      if (!go) return;
      event.preventDefault();
      window.location.href = `/tv/channels/${encodeURIComponent(go)}`;
    };
    window.addEventListener('keydown', press);
    return () => { window.removeEventListener('keydown', press); };
  }, [upTo, downTo]);

  const clock = (at: number | null) => (at === null ? null
    : new Date(at).toLocaleTimeString(undefined,
      { hour: '2-digit', minute: '2-digit' }));

  const { list, ready, toggle } = useFavorites();
  const following = ready && isFavorite(list, listing.slug);
  const mark = listing.callsign ?? listing.name.slice(0, 2).toUpperCase();

  return (
    <>
      {/*
        * THE STATION SAYS WHO IT IS BEFORE IT SAYS WHAT IS ON.
        *   [N-4]
        *
        * This page opened with a line of text and a player, which
        * is a page about a stream. A broadcaster's own photograph,
        * their mark and their sentence is a page about a STATION
        * — and the difference is what makes a directory of them
        * feel like television rather than a list of URLs.
        *
        * NO BANNER IS DESIGNED RATHER THAN HANDLED. A station
        * published this morning has none, which is the ordinary
        * case; it gets the same identity gradient its card gets,
        * hashed from its own slug, at the size of a band. Nothing
        * reads as missing. [U-19]
        */}
      <section className="stn-band" data-testid="station-band"
               {...(listing.bannerAssetId ? {}
                 : { style: identityFor(listing.slug) })}>
        {listing.bannerAssetId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="stn-art"
               src={`/api/tv/channels/${listing.slug}/banner`} />
        )}
        <span aria-hidden="true" className="stn-veil" />
        <div className="stn-said">
          <span className="stn-mark">
            {listing.logoAssetId
              // eslint-disable-next-line @next/next/no-img-element
              ? <img alt="" src={`/api/tv/channels/${listing.slug}/logo`} />
              : <span className="stn-mark-letters">{mark}</span>}
          </span>
          <div className="stn-who">
            <h1 className="stn-name">
              {listing.name}
              {/*
                * LIVE MEANS A CAMERA IS OPEN, which is the
                * distinction C-49 fixed in the control room: a
                * channel transmitting a recording is ON AIR, not
                * LIVE. The viewer's badge must not reintroduce
                * it. [§13, U-20]
                */}
              <span className="net-live" data-testid="station-state"
                    data-live={on.live ? 'true' : 'false'}
                    style={on.live ? undefined : {
                      background: 'transparent', color: 'var(--ink-200)',
                      border: '1px solid var(--line-strong)',
                    }}>
                {on.live ? 'LIVE' : 'ON AIR'}
              </span>
            </h1>
            {listing.says && (
              <p className="stn-facts" data-testid="station-says">
                {listing.says}
                {listing.number !== undefined && (
                  <span className="mono" style={{ color: 'var(--ink-400)' }}>
                    {'  ·  '}{numberSays(listing.number)}
                  </span>
                )}
              </p>
            )}
            {listing.description && (
              <p className="stn-about">{listing.description}</p>
            )}
          </div>
          <div className="stn-doing">
            {/*
              * FOLLOW IS THE STAR THIS PRODUCT ALREADY HAS,
              * wearing the word a viewer expects. Same device
              * storage, same list, same `/tv/favorites`. Nothing
              * is sent anywhere: following a station is a fact
              * about this browser. [N-9, D-03]
              *
              * NOTHING UNTIL STORAGE HAS BEEN READ, so the first
              * paint matches the HTML that arrived.
              */}
            {ready && (
              <button type="button" className="stn-follow"
                      data-testid="station-follow"
                      /*
                       * `aria-pressed` AND NOT ONLY `data-on`. A
                       * toggle that stores its state for the
                       * tests and does not announce it is a
                       * button a screen reader reads as "Follow"
                       * whether or not you already do — which
                       * `design-system.test.ts` refuses, and
                       * caught here.
                       */
                      aria-pressed={following}
                      data-on={following ? 'true' : 'false'}
                      onClick={() => { toggle(listing.slug); }}>
                <Icon name={following ? 'passed' : 'plus'} size={14} />
                {following ? 'Following' : 'Follow'}
              </button>
            )}
            <Share name={listing.name} />
          </div>
        </div>
      </section>

      <div className="stn-body">
        <div style={{ display: 'grid', gap: 'var(--space-4)', minWidth: 0 }}>
          {/*
            * THE PICTURE IS CAPPED, so what is on stays on the
            * screen. At full width a 16:9 player is 720 pixels
            * tall on a laptop and pushes NOW and NEXT below the
            * fold — on the one page whose job is to say what is
            * on. [D-04]
            */}
          <div style={{
            /*
             * THE PICTURE IS CAPPED, so what is on stays on the
             * screen. At full width a 16:9 player is 650 pixels
             * tall on a laptop and pushes NOW below the fold — on
             * the one page whose job is to say what is on. The cap
             * was dropped when this page was rebuilt, and a
             * screenshot put it straight back. [D-04]
             */
            maxWidth: 'min(100%, calc((100vh - 360px) * 16 / 9))',
            borderRadius: 'var(--radius-screen)', overflow: 'hidden',
            /* The bed is NAMED, never typed. compose.ts pads with
               color=black, so a player drawn on a hand-picked
               near-black shows a different frame from the file it
               is playing. [D-19] */
            border: '1px solid var(--line)', background: 'var(--screen-bed)',
          }}>
            <ChannelPlayer channelId={channelId} onAir={on.live} />
          </div>

          <div className="stn-panel">
            <div className="stn-panel-said">
              <p className="stn-kicker">Now playing</p>
              <p className="stn-prog" data-testid="station-now">
                {on.title ?? 'Off air'}
              </p>
              <p className="stn-when">
                {on.kind && <span>{on.kind}</span>}
                {on.untilMs !== null && (
                  <span data-testid="station-until">
                    {on.kind ? '  ·  ' : ''}until {clock(on.untilMs)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/*
            * NEXT IS DRAWN ONLY WHEN THERE IS ONE. A loop of
            * untitled items has no next worth printing, and
            * "NEXT —" is a heading over nothing. [C-42, D-04]
            */}
          {on.next && (
            <div className="stn-panel">
              <div className="stn-panel-said">
                <p className="stn-kicker">Next</p>
                <p className="stn-prog" data-testid="station-next">{on.next}</p>
                {on.nextAt !== null && (
                  <p className="stn-when">{clock(on.nextAt)}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 'var(--space-4)', minWidth: 0 }}>
          {/*
            * TODAY, WHERE THERE IS A TODAY. A channel running a
            * rotation and nothing else has no times to print, and
            * a heading over an empty list is a page saying the
            * station has stopped. [U-19]
            */}
          {today && today.length > 0 && (
            <div className="stn-panel" data-testid="station-today">
              <div className="stn-panel-said" style={{ paddingBottom: 10 }}>
                <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                  <p className="stn-kicker" style={{ margin: 0 }}>Today</p>
                  <span className="grow" />
                  <Link href="/tv/guide" className="small"
                        style={{ color: 'var(--ink-300)' }}>Full guide</Link>
                </div>
              </div>
              {today.map((slot) => (
                <span key={`${slot.at}${slot.title}`} className="stn-row"
                      data-testid="station-slot"
                      data-on={slot.title === on.title ? 'true' : 'false'}>
                  <span className="stn-row-time mono">{clock(slot.at)}</span>
                  <span className="stn-row-name">{slot.title}</span>
                </span>
              ))}
            </div>
          )}

        </aside>
      </div>

      {/*
        * THE CHANNEL ROCKER.  [N-9]
        *
        * > *"A remote control could eventually have: CH + / CH −"*
        *
        * REAL LINKS, NOT BUTTONS, which is what makes this work on
        * the device it is for. A D-pad moves focus between links
        * and presses OK; a television browser with no JavaScript
        * still tunes; and a viewer can see where each press goes
        * before making it, which is what the number beside the
        * arrow is for.
        *
        * ABSENT FOR A LINEUP OF ONE rather than disabled, because
        * a greyed-out CH+ on a one-channel network is furniture
        * explaining an absence nobody asked about.
        */}
      {/*
        * THE WAY OUT OF A STATION, in the page's own column.
        * Both of these were top-level siblings and sat flush
        * against the window edge while everything above them was
        * centred — found in a screenshot.
        */}
      <div className="stn-foot">
      {(tune?.down ?? tune?.up) && (
        <div className="row" data-testid="station-rocker" style={{
          gap: 'var(--space-3)', marginTop: 'var(--space-3)',
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          {tune?.down && (
            <Link href={`/tv/channels/${tune.down.slug}`}
                  data-testid="station-ch-down" className="small"
                  style={rocker}>
              {/* A GLYPH IS WHATEVER FONT THE READER HAS, and the
                  reader here is most likely a television — the one
                  device whose font set nobody can predict. */}
              <Icon name="chevron" turn={90} size={13} /> CH −
              <span className="mono" style={{ color: 'var(--ink-400)' }}>
                {numberSays(tune.down.number)}
              </span>
            </Link>
          )}
          {tune?.up && (
            <Link href={`/tv/channels/${tune.up.slug}`}
                  data-testid="station-ch-up" className="small" style={rocker}>
              <Icon name="chevron" turn={270} size={13} /> CH +
              <span className="mono" style={{ color: 'var(--ink-400)' }}>
                {numberSays(tune.up.number)}
              </span>
            </Link>
          )}
          <span className="grow" />
          <span className="small muted" style={{ fontSize: 'var(--text-2xs)' }}>
            Page up and page down change channel.
          </span>
        </div>
      )}

      {/*
        * THE WAY BACK, which a page reached from a shared link
        * needs more than one reached from the directory: somebody
        * arriving here from a message has never seen the rest of
        * the network. [N-4]
        */}
      <p style={{ margin: 'var(--space-4) 0 0' }}>
        <Link href="/tv/guide" className="small">TV guide</Link>
        {'  ·  '}
        <Link href="/tv/channels" className="small">All channels</Link>
      </p>
      </div>
    </>
  );
}

/**
 * Hand this station to somebody.
 *
 * THE PLATFORM'S OWN SHEET WHERE THERE IS ONE, which on a phone
 * is the thing that reaches WhatsApp — and that is how a channel
 * actually travels. Everywhere else it is the clipboard, which is
 * what a person on a laptop was going to do by hand anyway.
 *
 * AND IT SAYS SO WHEN IT HAS COPIED. A button that does something
 * invisible is a button people press twice.
 */
function Share({ name }: { name: string }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <button type="button" className="stn-icon-btn" data-testid="station-share"
            aria-label={said ?? 'Share this channel'} title={said ?? 'Share'}
            onClick={() => {
              const url = window.location.href;
              const sheet = (navigator as Navigator & {
                share?: (data: { title: string; url: string }) => Promise<void>;
              }).share;
              if (sheet) {
                void sheet.call(navigator, { title: name, url })
                  .catch(() => undefined);
                return;
              }
              void navigator.clipboard?.writeText(url)
                .then(() => { setSaid('Link copied'); })
                .catch(() => { setSaid('Could not copy'); });
            }}>
      <Icon name={said ? 'passed' : 'link'} size={16} />
    </button>
  );
}
