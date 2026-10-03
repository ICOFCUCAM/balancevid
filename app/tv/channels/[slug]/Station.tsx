'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { numberSays } from '../../../../src/domain/registry.js';
import type { Tuning } from '../../../../src/domain/channelListing.js';
import ChannelPlayer from '../../../t/[id]/watch/ChannelPlayer.js';
import Icon from '../../../Icon.js';
import type { Listing } from '../../Tv.js';

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
export default function Station(
  { channelId, listing, first, tune }: {
    channelId: string; listing: Listing; first: On; tune?: Tuning;
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

  return (
    <>
      <div className="row" style={{
        alignItems: 'baseline', gap: 'var(--space-4)', flexWrap: 'wrap',
        marginBottom: 'var(--space-4)',
      }}>
        <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>{listing.name}</h1>
        {listing.callsign && (
          <span className="mono readout" data-testid="station-callsign"
                style={{ color: 'var(--ink-300)' }}>{listing.callsign}</span>
        )}
        {listing.number !== undefined && (
          <span className="mono readout" data-testid="station-number"
                style={{ color: 'var(--ink-400)' }}>
            {numberSays(listing.number)}
          </span>
        )}
        <span className="grow" />
        {/*
          * LIVE MEANS A CAMERA IS OPEN, which is the distinction
          * the control room got wrong and C-49 fixed: a channel
          * transmitting a recording is ON AIR, not LIVE. The
          * viewer's badge must not reintroduce it. [§13, U-20]
          */}
        <span className="row" data-testid="station-state"
              data-live={on.live ? 'true' : 'false'} style={{
                gap: 6, alignItems: 'center', fontSize: 'var(--text-xs)',
                fontWeight: 700, letterSpacing: '0.08em',
                color: on.live ? 'var(--state-live)' : 'var(--ink-300)',
              }}>
          <span aria-hidden="true" style={{
            width: 7, height: 7, borderRadius: '50%',
            background: on.live ? 'var(--state-live)' : 'var(--ink-400)',
          }} />
          {on.live ? 'LIVE' : 'ON AIR'}
        </span>
      </div>

      {/*
        * THE PICTURE IS CAPPED, so what is on stays on the screen.
        * At full width a 16:9 player is 720 pixels tall on a
        * laptop and pushes NOW and NEXT below the fold — on the
        * one page whose job is to say what is on. A station page
        * where you must scroll to learn that is a station page
        * that has buried its own answer. [D-04]
        */}
      <div style={{
        maxWidth: 'min(100%, calc((100vh - 320px) * 16 / 9))',
        borderRadius: 'var(--radius-screen)', overflow: 'hidden',
        /* The bed is NAMED, never typed. compose.ts pads with
           color=black, so a player drawn on a hand-picked
           near-black shows a different frame from the file it is
           playing. [D-19] */
        border: '1px solid var(--line)', background: 'var(--screen-bed)',
      }}>
        <ChannelPlayer channelId={channelId} onAir={on.live} />
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

      <div style={{
        display: 'grid', gap: 'var(--space-5)', marginTop: 'var(--space-5)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      }}>
        <div>
          <div className="module-sub">NOW</div>
          <div data-testid="station-now" style={{
            fontSize: 'var(--text-lg)', fontWeight: 600,
          }}>{on.title ?? 'Off air'}</div>
          {on.kind && <div className="small muted">{on.kind}</div>}
          {on.untilMs !== null && (
            <div className="small muted" data-testid="station-until">
              until {clock(on.untilMs)}
            </div>
          )}
        </div>
        {/*
          * NEXT IS DRAWN ONLY WHEN THERE IS ONE. A loop of untitled
          * items has no next worth printing, and "NEXT —" is a
          * heading over nothing. [C-42, D-04]
          */}
        {on.next && (
          <div>
            <div className="module-sub">NEXT</div>
            <div data-testid="station-next" style={{
              fontSize: 'var(--text-lg)', fontWeight: 600 }}>{on.next}</div>
            {on.nextAt !== null && (
              <div className="small muted">{clock(on.nextAt)}</div>
            )}
          </div>
        )}
        {listing.description && (
          <div>
            <div className="module-sub">ABOUT</div>
            <p style={{ margin: 0 }}>{listing.description}</p>
          </div>
        )}
      </div>

      {listing.says && (
        <p className="small muted" data-testid="station-says"
           style={{ marginTop: 'var(--space-5)' }}>{listing.says}</p>
      )}
      <p style={{ marginTop: 'var(--space-5)' }}>
        <Link href="/tv/guide" className="small">TV guide</Link>
        {'  ·  '}
        <Link href="/tv/channels" className="small">All channels</Link>
      </p>
    </>
  );
}
