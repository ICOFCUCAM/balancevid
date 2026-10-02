'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import ChannelPlayer from '../../../t/[id]/watch/ChannelPlayer.js';
import type { Listing } from '../../Tv.js';

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
  { channelId, listing, first }: {
    channelId: string; listing: Listing; first: On;
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

      <div style={{
        borderRadius: 'var(--radius-screen)', overflow: 'hidden',
        /* The bed is NAMED, never typed. compose.ts pads with
           color=black, so a player drawn on a hand-picked
           near-black shows a different frame from the file it is
           playing. [D-19] */
        border: '1px solid var(--line)', background: 'var(--screen-bed)',
      }}>
        <ChannelPlayer channelId={channelId} onAir={on.live} />
      </div>

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
