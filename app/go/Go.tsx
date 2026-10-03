'use client';

/**
 * The furniture the competition layer shares.
 *   [GO-VIRAL V-4, §10; Doctrine D-04]
 *
 * ONE HEADER AND ONE CARD, FOR `Tv.tsx`'S REASON. *"The directory,
 * the guide, the search and the station page are one product and
 * four pages that each drew their own would be four products."*
 * There are two pages here and this is the same lesson applied
 * before the third exists rather than after it.
 *
 * AND IT IS NOT A SECOND SITE. The header links back to `/tv` and
 * to the Take App, because a person who arrived at a competition
 * has arrived at this installation — not at a competition product
 * that happens to share a domain. [V-4]
 *
 * NOTHING HERE KNOWS ABOUT AN ACCOUNT. These pages are served to
 * strangers and must render identically to somebody who has never
 * signed in, which is everybody they are for.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { CallRow } from '../../src/domain/campaign.js';

export function GoFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="row" style={{
        gap: 'var(--space-5)', alignItems: 'center', flexWrap: 'wrap',
        padding: '14px var(--space-6)', borderBottom: '1px solid var(--line)',
      }}>
        <Link href="/go" style={{
          fontWeight: 700, letterSpacing: '0.06em', textDecoration: 'none',
          color: 'var(--text)',
        }}>BalanceVid <span style={{ color: 'var(--accent)' }}>Go</span></Link>
        <span className="grow" />
        <Link href="/take" className="small muted"
              style={{ textDecoration: 'none' }}>Take App</Link>
        <Link href="/tv" className="small muted"
              style={{ textDecoration: 'none' }}>TV</Link>
      </header>
      <main style={{
        padding: 'var(--space-6)', maxWidth: 900, margin: '0 auto',
      }}>{children}</main>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  How long is left.
 * ------------------------------------------------------------------ */

/**
 * The countdown, which is the point of CLOSING.
 *   [GO-VIRAL V-2, V-4]
 *
 * > *"CLOSING is the last stretch, where the countdown is the
 * > point."*
 *
 * IT STARTS FROM A NUMBER THE SERVER SENT AND TICKS ON THE CLIENT.
 * Reading `Date.now()` at first render would make the server's
 * HTML and the first client paint disagree, which React discards
 * the whole tree over — the same trap `Tv.tsx` records about
 * storage. So the first paint is the server's number, and the
 * second is this one.
 *
 * AND IT COUNTS THE PHONE'S CLOCK FROM THERE rather than against
 * the deadline directly, so a device whose clock is a day out
 * still sees a countdown that runs down at one second per second.
 * What it would get wrong is the absolute instant, and that is
 * printed beside it from the server.
 */
export function Countdown({ msLeft }: { msLeft: number }) {
  const [left, setLeft] = useState(msLeft);
  useEffect(() => {
    setLeft(msLeft);
    const started = Date.now();
    const timer = window.setInterval(() => {
      setLeft(Math.max(0, msLeft - (Date.now() - started)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [msLeft]);
  /*
   * TABULAR FIGURES AND NOT THE MONO FACE. `className="mono"`
   * drew *19h 59m* with a space wide enough to read as two, which
   * on a countdown looks like a typo. What a countdown needs is
   * digits that do not shift as they tick, and that is the
   * numeric variant on its own.
   */
  return (
    <span data-testid="go-countdown"
          style={{ fontVariantNumeric: 'tabular-nums' }}>{howLong(left)}</span>
  );
}

/**
 * A duration a person reads, not a duration a machine prints.
 *
 * THE BIGGEST TWO UNITS AND NO MORE. *"3 days 4 hours"* is what
 * somebody deciding whether they have time to record needs;
 * *"3 days 4 hours 11 minutes 6 seconds"* is the same fact with
 * three numbers in front of it that change while being read.
 * Under an hour the seconds are the fact, so they appear.
 */
export function howLong(ms: number): string {
  if (ms <= 0) return 'closed';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

/* ------------------------------------------------------------------ *
 *  A call, as a row in the directory.
 * ------------------------------------------------------------------ */

export function CallCard({ call }: { call: CallRow }) {
  return (
    <Link href={call.at} data-testid="go-call-card" style={{
      display: 'block', textDecoration: 'none', color: 'var(--text)',
      padding: 'var(--space-4)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius-md)', background: 'var(--console-control)',
    }}>
      <div className="row" style={{ gap: 'var(--space-3)', alignItems: 'baseline' }}>
        <span style={{
          fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)',
        }}>{call.title}</span>
        <span className="grow" />
        <Standing call={call} />
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>{call.asks}</p>
    </Link>
  );
}

/**
 * Where a call has got to, in one chip.
 *
 * THE CLOCK AND NOT THE STATE, where they differ. `state` is where
 * somebody moved it to and `clock` is where its window says it
 * should be, and a chip reading LIVE over a call that shut an hour
 * ago is the failure `clockSays` exists to prevent. The state is
 * what the page itself says in the organiser's own sentence.
 */
export function Standing({ call }: { call: CallRow }) {
  const closing = call.clock === 'closing' && call.msLeft !== null;
  const says = call.state === 'results' ? 'Results'
    : call.state === 'judging' ? 'Judging'
      : call.clock === 'scheduled' ? 'Opens soon'
        : call.clock === 'over' ? 'Closed'
          : closing ? 'Ending soon' : 'Open';
  return (
    <span className="small" data-testid="go-standing" data-standing={says}
          style={{
            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            color: closing ? 'var(--warn)' : 'var(--ink-300)',
            /*
             * ONE LINE, WHICH A PHONE DECIDES AND THIS DOES NOT.
             * Found in a screenshot of the Take App home at 420px:
             * *Open · 6d 23h* broke after the dot and the chip
             * became a two-line box half the width of the row. A
             * standing is four words at most; it wraps or it is
             * shortened, and shortening it would lose the
             * countdown. [GO-VIRAL V-8]
             */
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
      {says}
      {call.msLeft !== null && call.msLeft > 0
        && (call.clock === 'live' || call.clock === 'closing') && (
        <> · <Countdown msLeft={call.msLeft} /></>
      )}
    </span>
  );
}
