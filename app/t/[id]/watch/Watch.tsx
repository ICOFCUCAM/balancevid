'use client';

import { useEffect, useState } from 'react';
import Brand from '../../../Brand.js';
import ChannelPlayer from './ChannelPlayer.js';

/**
 * The channel, as a viewer gets it.  [Doctrine CHANNEL §17, U-31, D-03]
 *
 * The published artefact and nothing else: the picture, what is on, and what
 * is next. No schedule to edit, no library, no transport — those are the
 * broadcaster's working material, and a viewer who can see them is being
 * shown a control room rather than a channel. The same line Studio Two's
 * watch page draws between a performance and its takes.
 *
 * WHAT IS ON COMES FROM THE SERVER, once a minute, from a route that returns
 * titles and clock times and nothing that names a file. The control room
 * computes the same answer locally because it has the document; a viewer
 * does not have the document and must not be given it to find out what is
 * playing.
 */

interface NowAndNext {
  name: string;
  live: boolean;
  title: string | null;
  /** What kind of thing it is: "Studio Two · Performance". [C-43] */
  kind: string | null;
  untilMs: number | null;
  next: string | null;
  /** When it starts, as an instant. [C-43] */
  nextAt: number | null;
  /** Whether segments are actually arriving. [§18] */
  transmitting: boolean;
  /** What to tell the viewer when they are not. */
  says: string | null;
  author?: string;
}

/** How often a viewer's listing catches up. A channel moves in minutes. */
const POLL_MS = 30_000;

export default function Watch({
  channelId, name, author,
}: {
  channelId: string;
  name: string;
  author?: string;
}) {
  const [now, setNow] = useState<NowAndNext | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    const read = async () => {
      try {
        const response = await fetch(
          `/api/channels/${channelId}/now`, { cache: 'no-store' });
        if (!response.ok || stopped) return;
        setNow(await response.json() as NowAndNext);
      } catch { /* momentarily unreachable; keep the last listing. */ }
    };
    void read();
    const listing = setInterval(() => { void read(); }, POLL_MS);
    /* The countdown is local, so it moves between reads rather than jumping. */
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => { stopped = true; clearInterval(listing); clearInterval(tick); };
  }, [channelId]);

  const remaining = now?.untilMs ? Math.max(0, now.untilMs - clock) : null;

  return (
    <div className="shell">
      <header className="shell-bar" style={{ gap: 12 }}>
        <Brand wordmark={false} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: 'var(--text-lg)', margin: 0, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: 'var(--tracking-tight)',
          }}>{now?.name ?? name}</h1>
          {author && (
            <div style={{
              fontSize: 'var(--text-sm)', color: 'var(--text-faint)',
            }}>by {author}</div>
          )}
        </div>
        {/*
          * THE LAMP IS DRAWN ONLY WHILE THE CHANNEL IS ACTUALLY LIVE, which
          * is the whole point of it — a channel whose LIVE light is part of
          * its logo is a channel lying to its viewers. [§13]
          */}
        {now?.live && (
          /*
            * THE ONE MARK A VIEWER TRUSTS. It is drawn only while the
            * channel is genuinely transmitting (§13), so it should look
            * like a tally light and not like a badge: a lit surface, a
            * halo in its own red, and a dot that breathes the way the
            * operator's own lamp does. The two ends of the product
            * showing the same light is the point.
            */
          <span className="row" data-testid="viewer-live" style={{
            gap: 'var(--space-3)', flex: '0 0 auto',
            padding: '4px var(--space-5)', borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(180deg, #e8483a, #c33327)',
            border: '1px solid rgba(255,140,128,0.5)',
            color: '#fff', fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-bold)', letterSpacing: '0.09em',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5),'
              + ' inset 0 1px 0 rgba(255,255,255,0.22)',
          }}>
            <span className="lamp is-live" style={{
              width: 6, height: 6, background: '#fff', boxShadow: 'none',
            }} />
            LIVE
          </span>
        )}
      </header>

      <div className="shell-body shell-scroll" style={{ padding: '16px 20px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <ChannelPlayer channelId={channelId}
                         onAir={Boolean(now?.transmitting)} />

          {/*
            * A SENTENCE INSTEAD OF A SPINNER.  [§18]
            *
            * A player that never starts is the worst page in this product:
            * it looks like the viewer's connection, and they wait. The
            * server knows whether anything is being written, so it says so —
            * and says nothing about which of the broadcaster's processes
            * died, which is none of a stranger's business.
            */}
          {now && !now.transmitting && (
            /*
              * A NOTICE A STRANGER READS ONCE, so it leads with a marker
              * on its edge rather than shouting in colour: somebody who
              * arrived to watch something is being told they cannot, and
              * the tone of that matters more than its visibility.
              */
            <p data-testid="viewer-off-air" style={{
              margin: 'var(--space-5) 0 0',
              padding: 'var(--space-4) var(--space-5)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--state-armed-wash)',
              border: 'var(--border) solid rgba(232,179,60,0.36)',
              boxShadow: 'inset 3px 0 0 var(--state-armed)',
              fontSize: 'var(--text-base)',
              color: '#f0c66a',
            }}>
              {now.says ?? 'This channel is not transmitting right now.'}
            </p>
          )}

          {/*
            * NOW PLAYING IS A CLAIM ABOUT THE VIEWER'S SCREEN, and this
            * block was making it unconditionally — directly under the
            * notice saying the channel is not transmitting. A stranger
            * arriving off air read, in this order:
            *
            *     This channel is not transmitting right now.
            *     NOW PLAYING
            *     Station Ident
            *     06:25 left
            *
            * Both sentences are true of different things, which is
            * exactly why putting them together is a lie. `title` is
            * what the SCHEDULE says should be going out; `transmitting`
            * is whether any segment is actually arriving. The channel
            * can have a perfect listing and a dead playout engine, and
            * that is the state a viewer most needs told plainly.
            *
            * So the label follows the fact: NOW PLAYING when something
            * is arriving, SCHEDULED when it is not. Same bug as the
            * multi-view tally and the playhead flag — a surface
            * asserting something the state underneath does not
            * support. [U-20]
            */}
          <div className="row" data-testid="viewer-now"
               data-transmitting={now?.transmitting ? 'true' : 'false'}
               style={{ marginTop: 12, gap: 12, alignItems: 'baseline' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 'var(--text-2xs)', letterSpacing: '0.09em',
                fontWeight: 'var(--weight-bold)', color: 'var(--text-faint)',
              }}>{now?.transmitting ? 'NOW PLAYING' : 'SCHEDULED'}</div>
              <div data-testid="viewer-title" style={{
                fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semi)',
                letterSpacing: 'var(--tracking-tight)',
                marginTop: 'var(--space-1)',
              }}>
                {now?.title ?? '—'}
              </div>
              {/*
                * AND WHAT KIND OF THING IT IS.  [brief point 9, C-43]
                *
                * *"THE ANCIENT OF DAYS / Studio Two · Performance."*
                * The title alone tells a viewer the name of
                * something they have never heard of; the line under
                * it tells them what they are looking at. Same
                * sentence the lower third carries, from the same
                * function, so the page and the picture cannot
                * disagree.
                */}
              {now?.kind && (
                <div className="muted" data-testid="viewer-kind" style={{
                  fontSize: 'var(--text-base)', marginTop: 2,
                }}>{now.kind}</div>
              )}
            </div>
            {/*
              * AND THE COUNTDOWN ONLY RUNS ON SOMETHING THAT IS
              * RUNNING. "06:25 left" of a programme the viewer cannot
              * see is a progress bar for a thing that is not
              * happening.
              */}
            {remaining !== null && now?.transmitting && (
              <div className="mono muted" data-testid="viewer-remaining"
                   style={{ fontSize: 'var(--text-sm)', flex: '0 0 auto' }}>
                {hms(remaining)} left
              </div>
            )}
          </div>

          {now?.next && (
            <div className="row" data-testid="viewer-next" style={{
              marginTop: 10, gap: 9, padding: '8px 11px',
              borderRadius: 'var(--radius-module)',
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              fontSize: 'var(--text-base)',
            }}>
              <span className="muted" style={{
                fontSize: 'var(--text-2xs)', letterSpacing: 0.8, fontWeight: 700, flex: '0 0 auto',
              }}>NEXT</span>
              {/* The time it starts, which is the half a viewer
                  deciding whether to wait actually needs. [C-42] */}
              {now.nextAt !== null && (
                <span className="mono muted" data-testid="viewer-next-at"
                      style={{ flex: '0 0 auto', fontSize: 'var(--text-sm)' }}>
                  {clockOf(now.nextAt)}
                </span>
              )}
              <span style={{
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{now.next}</span>
            </div>
          )}

          <p className="small muted" style={{ marginTop: 16, fontSize: 'var(--text-xs)' }}>
            {/* A channel is not a video: it was here before you opened it and
                it will be here after you close it. Saying so is the one thing
                that tells a viewer what kind of page this is. */}
            This channel runs continuously. There is no beginning to go back to.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A wall clock, in the VIEWER'S own zone and not the channel's.
 *
 * The picture's NEXT carries the channel's local time, because a
 * caption burnt into a broadcast is the same for everybody watching
 * it. A page is not: it is being read on one person's device, and
 * "16:30" means the time on their own clock. Two surfaces, two
 * correct answers. [§2, C-43]
 */
function clockOf(atMs: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(atMs));
  } catch {
    return '';
  }
}

/** `01:04:17`, or `04:17`. Hours only once there are any. */
function hms(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  return hours > 0
    ? `${hours}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
    : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
