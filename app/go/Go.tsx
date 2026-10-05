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
import Icon, { type IconName } from '../Icon.js';
import { shelfFor } from '../tv/art.js';

/**
 * A CALL'S SUBJECT, AS A READER'S WORD FOR IT.
 *
 * `about` is the track's own kind — a word about how this
 * product stores things. What goes on a card is the same three
 * in a reader's language, and the mapping lives on the surface
 * because the domain must not acquire an opinion about
 * English. A call from a NEWER installation still draws, which
 * is why there is a fallback: these rows are merged across
 * installations. [D-19, V-8, U-19]
 */
const ABOUT: Record<string, { says: string; mark: IconName }> = {
  performance: { says: 'Music', mark: 'music' },
  conversation: { says: 'Video', mark: 'play' },
  channel: { says: 'Programme', mark: 'broadcast' },
};

export function aboutSays(kind: string): { says: string; mark: IconName } {
  return ABOUT[kind] ?? { says: 'Open', mark: 'live' };
}

export function GoFrame({ children, here = 'calls' }: {
  children: React.ReactNode;
  /** Which rail row is this page. */
  here?: 'calls' | 'tv' | 'take';
}) {
  return (
    <div className="tk-page go-page">
      {/*
        * THE SAME IDENT AS THE TAKE APP, AND THAT IS THE POINT.
        * Go is the door somebody walks through before they have
        * ever used this product, and the Take App is where they
        * land afterwards. Two front doors that looked like two
        * different products would make the second one feel like
        * a sign-up. [D-19]
        */}
      <header className="tk-bar">
        <Link href="/go" className="tk-ident">
          <span aria-hidden="true" className="tk-ident-mark">
            <Icon name="live" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="tk-ident-name">
              BalanceVid <span style={{ color: 'var(--accent)' }}>Go</span>
            </span>
            <span className="tk-ident-says">Open calls · Anyone can enter</span>
          </span>
        </Link>
        <Link href="/take" className="tk-bar-way">
          <Icon name="mic" size={14} />
          Take App
        </Link>
        <Link href="/tv" className="tk-bar-way" style={{ marginLeft: 0 }}>
          <Icon name="broadcast" size={14} />
          TV
        </Link>
      </header>

      {/*
        * A RAIL, ON A SCREEN WIDE ENOUGH FOR ONE.  [D-04]
        *
        * At 1440 the page was a 900px column in the middle of a
        * window with six hundred pixels of nothing either side —
        * a phone layout that had been allowed to grow. A rail is
        * what a desktop uses the width for, and it is hidden
        * below 1000px rather than stacked, because a nav that
        * becomes six rows above the content is a page that
        * starts with its own menu.
        *
        * EVERY ROW GOES SOMEWHERE THAT EXISTS. The design this
        * was built against names Home, Open calls, Live now,
        * Music, Video, TV Channels, My Takes and Library. Four
        * of those are pages this product has.
        */}
      <div className="go-frame">
        <nav className="go-rail" aria-label="Where to go">
          <Link href="/go" className="go-rail-way"
                {...(here === 'calls' ? { 'aria-current': 'page' as const } : {})}>
            <Icon name="live" size={17} />
            Open calls
          </Link>
          <Link href="/tv" className="go-rail-way"
                {...(here === 'tv' ? { 'aria-current': 'page' as const } : {})}>
            <Icon name="broadcast" size={17} />
            Watch TV
          </Link>
          <Link href="/tv/channels" className="go-rail-way">
            <Icon name="channels" size={17} />
            Channels
          </Link>
          <Link href="/tv/guide" className="go-rail-way">
            <Icon name="calendar" size={17} />
            Guide
          </Link>
          <Link href="/take" className="go-rail-way"
                {...(here === 'take' ? { 'aria-current': 'page' as const } : {})}>
            <Icon name="mic" size={17} />
            Take App
          </Link>
          <Link href="/tv/favorites" className="go-rail-way">
            <Icon name="passed" size={17} />
            My channels
          </Link>
        </nav>
        <div className="go-work">{children}</div>
      </div>
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
  const says = standingSays(call);
  return (
    <Link href={call.at} data-testid="go-call-card" className="go-call"
          data-standing={says}>
      {/*
        * A PICTURE, WHICH IS A GROUND AND NOT A PHOTOGRAPH.
        * The design gives every call its own image; this
        * product has three photographs and none of them is
        * *City in Sixty Seconds*. A call keeps one colour
        * everywhere, hashed from its own address, the way a
        * station with no logo does — and when a call can carry
        * artwork this becomes the fallback. [D-19, U-19]
        */}
      <span aria-hidden="true" className="go-call-art"
            style={shelfFor(call.slug ?? call.id)}>
        <span className="go-call-badge" data-about={call.about}>
          <Icon name={aboutSays(call.about).mark} size={11} />
          {aboutSays(call.about).says} campaign
        </span>
      </span>

      <span className="go-call-said">
        <span className="go-call-name">{call.title}</span>
        <span className="go-call-asks">{call.asks}</span>
        {/*
          * WHAT A CALL IS, IN FACTS IT ACTUALLY HOLDS. The
          * design's meta line reads *60 seconds · Open to
          * everyone · Creative expression*. The middle one is
          * real — a call's window carries who may enter. The
          * first is not: `CampaignRules` has an instruction, a
          * criteria and a prize, and no duration, so a length
          * printed here would be this card inventing a rule
          * the door will not enforce. The third IS the
          * criteria, which is the organiser's own words about
          * what they are looking for. [D-21]
          */}
        <span className="go-call-meta">
          <span className="go-call-fact">
            <Icon name="person" size={12} />
            Open to everyone
          </span>
          {call.criteria && (
            <span className="go-call-fact">
              <Icon name="passed" size={12} />
              {call.criteria}
            </span>
          )}
        </span>
        <span className="go-call-foot">
          <Standing call={call} />
        </span>
      </span>

      <span className="go-call-go">
        <span className="tk-go">
          Look
          <Icon name="chevron" size={13} />
        </span>
      </span>
    </Link>
  );
}

/** What a call's chip says, which the card also colours by. */
export function standingSays(call: CallRow): string {
  const closing = call.clock === 'closing' && call.msLeft !== null;
  return call.state === 'results' ? 'Results'
    : call.state === 'judging' ? 'Judging'
      : call.clock === 'scheduled' ? 'Opens soon'
        : call.clock === 'over' ? 'Closed'
          : closing ? 'Ending soon' : 'Open';
}

export function Standing({ call }: { call: CallRow }) {
  const says = standingSays(call);
  return (
    <span className="go-standing" data-testid="go-standing" data-standing={says}>
      {/* A live dot on the one that is actually open, and on
          nothing else: a chip that always has one is a chip
          whose dot means nothing. [D-21] */}
      {(says === 'Open' || says === 'Ending soon') && (
        <span aria-hidden="true" className="go-standing-dot" />
      )}
      {says}
      {call.msLeft !== null && call.msLeft > 0
        && (call.clock === 'live' || call.clock === 'closing') && (
        <> · <Countdown msLeft={call.msLeft} /></>
      )}
    </span>
  );
}
