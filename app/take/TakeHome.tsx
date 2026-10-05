'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  addConnection, asOrigin, askInstance, readConnections, removeConnection,
  type Connection,
} from './connections.js';
import { type HomeCall, type Row, homeFrom } from './home.js';
import { Standing } from '../go/Go.js';
import Icon, { type IconName } from '../Icon.js';
import { GroundToggle } from '../Ground.js';
import { NETWORK_ART, identityFor, shelfFor } from '../tv/art.js';

/**
 * The Take App's home.  [TAKE-PLATFORM P1, P2, P3, P4, P5, P6, U5]
 *
 * *"I actually think Take App should not feel like a recording utility
 * with a library attached. If the user opens it and sees only 'My Takes,'
 * it will feel narrow and disposable."*
 *
 * So this is the media and participation home the brief asks for, and the
 * four sections are its shape: Music, Video, Online TV and My Takes.
 *
 * THREE OF THE FOUR ARE ONE QUERY. Music, Video and Online TV are not
 * three subsystems — they are `/api/participate` grouped by the `kind`
 * each row already carries. Building them separately would be the mistake
 * the timeline brief named: *"Don't create separate systems for these
 * features."* The fourth is genuinely different, because it is about the
 * person rather than about the installation. [U5, D-19]
 *
 * MY TAKES IS HELD ON THE DEVICE, and that is not a shortcut. A list of
 * which productions somebody is taking part in is exactly the kind of
 * thing that must not accumulate centrally — the same argument §12 makes
 * about the footage, applied to the participant. The server is asked
 * nothing about who this person is; it is handed a link it already
 * issued, and answers about that one request. [U3, P16]
 *
 * NOTHING HERE ASKS WHO YOU ARE. There is no account on this surface by
 * construction — the whole premise is a link sent to somebody who has
 * none — so the home shows what the installation chose to list, and the
 * person's own material comes from their own device. [D-25]
 */

/*
 * `Row` AND THE MERGE MOVED TO `home.ts` AT V-8, because the
 * question *what does this device see when one installation is
 * unreachable* could not be asked of a `useEffect`. [D-19]
 */

/** A request this device holds, which is the whole of "My Takes". */
interface Mine {
  link: string;
  title: string;
  kind: string;
  at: string;
}

const MINE = 'balancevid.take.mine';

function readMine(): Mine[] {
  try {
    const raw = window.localStorage.getItem(MINE);
    return raw ? JSON.parse(raw) as Mine[] : [];
  } catch {
    /* Private browsing, or storage refused. The home still works; this
       person simply has no remembered list. [U-19] */
    return [];
  }
}

function keepMine(one: Mine): Mine[] {
  const next = [one, ...readMine().filter((was) => was.link !== one.link)];
  try {
    window.localStorage.setItem(MINE, JSON.stringify(next.slice(0, 50)));
  } catch { /* as above. */ }
  return next;
}

/**
 * A mark per kind of thing to take part in.
 *
 * ONE PER `Row['kind']` AND NO FALLBACK, which is the opposite
 * of the genre marks on the television pages and right for the
 * opposite reason: a genre is a free string a broadcaster
 * types, and this is a closed union the compiler checks. A
 * fourth kind added to `Row` without a mark here is a type
 * error rather than a hole in a row of icons. [kinds.ts]
 */
const MARKS: Record<Row['kind'], IconName> = {
  music: 'music', video: 'play', programme: 'broadcast',
};

const SECTIONS: { kind: Row['kind']; title: string; empty: string }[] = [
  {
    kind: 'music',
    title: 'Music',
    empty: 'No songs are open for takes here yet.',
  },
  {
    kind: 'video',
    title: 'Video',
    empty: 'Nothing here is accepting responses yet.',
  },
  {
    kind: 'programme',
    title: 'Online TV',
    empty: 'No programmes here are taking part yet.',
  },
];

export default function TakeHome() {
  const [rows, setRows] = useState<Row[] | null>(null);
  /*
   * THE CALLS, WHICH ARRIVED IN THE SAME ANSWER AND WERE NOT
   * DRAWN.  [GO-VIRAL V-4, V-8]
   *
   * A SECTION AND NOT A FOURTH `kind`, which is the route's own
   * reason: a call is not a fourth thing to take part in — it is
   * a thing several of the rows above may belong to, with a
   * deadline of its own and a page of its own.
   */
  const [calls, setCalls] = useState<HomeCall[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => { setMine(readMine()); }, []);

  /*
   * THIS INSTALLATION, AND EVERY ONE THIS DEVICE REMEMBERS.
   *   [U3, P22, P23, P25; §10, §11]
   *
   * READ ACROSS, ACT ON THE OWNER. Merging what three installations
   * offer is a cross-origin READ of a public listing, which is what
   * the `*` on `/api/participate` is for. Taking part is a WRITE, gets
   * no CORS at all, and happens on the installation that owns the song
   * — so a claim is always same-origin and a merged list can never be
   * turned into a way to make one somewhere else. [P16]
   *
   * ONE THAT CANNOT BE REACHED IS SHOWN AS SUCH rather than dropped: a
   * self-hosted installation on somebody's laptop is often simply
   * asleep, and a connection that silently disappears is a person
   * wondering whether they imagined adding it. [U-19, P20]
   */
  const [connections, setConnections] = useState<Connection[]>([]);
  const [asleep, setAsleep] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  /*
   * WHAT IS BEING LOOKED FOR, which narrows every shelf at once
   * rather than only the one it sits over. Somebody typing
   * `worship` does not know whether the thing they want is a
   * song, a video or a channel — and a filter that only
   * searched one of the three would be a filter that lies about
   * what is here. [D-04]
   */
  const [finding, setFinding] = useState('');
  const [showing, setShowing] = useState<TabId>('all');
  const [loaded, setLoaded] = useState(0);

  const [whereIAm, setWhereIAm] = useState<{ name: string; origin: string } | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setConnections(readConnections());
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const local = await fetch('/api/participate', { cache: 'no-store' })
        .then((r) => r.json()).catch(() => ({}));
      if (!alive) return;
      /*
       * THE LOCAL ANSWER IS DRAWN BEFORE ANY OTHER IS ASKED FOR,
       * which is V-8's first claim as a sequence of two renders:
       * *a self-hosted installation with the network's origin
       * unreachable loses nothing of its own.* Whatever the
       * others do or fail to do happens to a screen that is
       * already complete.
       */
      const here = homeFrom(local);
      setRows(here.rows);
      setCalls(here.calls);
      if (local.instance) setWhereIAm(local.instance);

      /*
       * THE OTHERS ARE ASKED AFTER, AND IN PARALLEL. A remote
       * installation that is asleep must not hold up the listing of
       * the one that served this page.
       */
      const others = readConnections()
        .filter((one) => one.origin !== window.location.origin);
      if (others.length === 0) return;
      const answers = await Promise.all(others.map(async (connection) => ({
        connection, answer: await askInstance(connection.origin),
      })));
      if (!alive) return;
      const all = homeFrom(local, answers);
      setAsleep(all.asleep);
      setRows(all.rows);
      setCalls(all.calls);
    })();
    return () => { alive = false; };
  }, [loaded]);

  /* Adding one is asking it what it is called; a place that cannot
     answer is not one to put in a list. */
  const add = useCallback(async () => {
    setSaid(null);
    const origin = asOrigin(adding);
    if (!origin) { setSaid('that does not look like a BalanceVid address'); return; }
    const answer = await askInstance(origin);
    if (!answer) {
      setSaid('nothing answered there, or it is not open to this app');
      return;
    }
    setConnections(addConnection({ ...answer.instance, addedAt: new Date().toISOString() }));
    setAdding('');
    setLoaded((was) => was + 1);
  }, [adding]);

  const forget = useCallback((origin: string) => {
    setConnections(removeConnection(origin));
    setLoaded((was) => was + 1);
  }, []);

  /*
   * TAKING PART, WHICH MINTS THE SAME OBJECT A PRODUCER MINTS.
   *
   * What comes back is a link, once — the credential — so it is kept on
   * the device immediately and the person is taken to it. Losing it
   * between the response and the navigation would be losing the only
   * copy. [T2a]
   */
  /*
   * A TAB IS OFFERED WHERE IT HAS SOMETHING UNDER IT. A row of
   * five with three dead ends is a row that teaches a reader
   * not to press any of them. [D-21]
   */
  const held = new Set<string>([
    ...(calls.length > 0 ? ['calls'] : []),
    ...(rows ?? []).map((row) => row.kind),
  ]);
  const tabs = TABS.filter(
    (one) => one.kinds === null || one.kinds.some((kind) => held.has(kind)));
  /* A tab that was chosen and then emptied — the last call
     closed while the page was open — falls back rather than
     leaving a page with nothing on it. [U-19] */
  const chosen = tabs.some((one) => one.id === showing) ? showing : 'all';
  const shows = (kind: string) => {
    const tab = TABS.find((one) => one.id === chosen)!;
    return tab.kinds === null || (tab.kinds as readonly string[]).includes(kind);
  };

  const take = useCallback(async (row: Row) => {
    setSaid(null);
    setBusy(row.id);
    try {
      const response = await fetch(
        `/api/participate/${row.kind}/${encodeURIComponent(row.id)}`,
        { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.link) {
        throw new Error(data.error ?? 'that is not open to take part in');
      }
      setMine(keepMine({
        link: String(data.link), title: row.title, kind: row.kind,
        at: new Date().toISOString(),
      }));
      window.location.href = `/take/${encodeURIComponent(String(data.link))}`;
    } catch (error) {
      setSaid(error instanceof Error ? error.message : 'that did not work');
      setBusy(null);
    }
  }, []);

  return (
    /*
     * LIT, LIKE THE LOBBY AND LIKE GO.  [D-24, D-04]
     *
     * This page is READ: what a church or a school is being
     * asked to record, what their channels are showing, which
     * call is open. It is opened on a phone, in a hall, in
     * daylight — the furthest thing from a broadcast desk in a
     * dark room, which is the one place the dark ground was
     * argued for. The RECORDER is a different room again and
     * stays dark, because a camera preview is a picture being
     * judged. [TakeApp.tsx]
     */
    <div className="tk-page" data-ground="light" data-ground-host
         data-testid="take-home">
      {/*
        * AN IDENT, NOT A SPLASH SCREEN. The page opened with the
        * product's name centred in large letters over nothing,
        * which is what a loading screen looks like. The
        * television pages gained a mark, a name and a line
        * saying what this is; this is the same product and a
        * person may arrive at either one first. [N-4]
        */}
      <header className="tk-bar">
        <span className="tk-ident">
          <span aria-hidden="true" className="tk-ident-mark">
            <Icon name="mic" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="tk-ident-name">BalanceVid</span>
            <span className="tk-ident-says">Watch · Listen · Take part</span>
          </span>
        </span>
        {/* THE WAY TO THE NETWORK, because somebody who arrives
            here to record may well want to watch. [D-04] */}
        <a className="tk-bar-way" href="/tv">
          <Icon name="broadcast" size={14} />
          TV
        </a>
        <GroundToggle />
      </header>

      {/*
        * A FRONT, NOT A LIST.  [N-4, applied here]
        *
        * > *"See how the tv channels of take mobile fill the
        * > screen, no drop cap, no search, no design, no flesh."*
        *
        * The page opened straight onto a column of rows, so the
        * first thing a stranger met was seventeen channel names
        * — and nothing told them what this was or gave them a
        * way to cut it down. The television pages solved both
        * with a band and a field; this is the same two.
        */}
      <div className="tk-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={NETWORK_ART.hero}
             style={{ objectPosition: NETWORK_ART.heroFocus }} />
        <span aria-hidden="true" className="tk-hero-wash" />
        <div className="tk-hero-said">
          <p className="tk-hero-kicker">Welcome to</p>
          <h1 className="tk-hero-lead">
            {whereIAm?.name ?? 'BalanceVid'}
          </h1>
          {/*
            * WHO THIS IS FOR, SAID IN ONE LINE.
            *
            * > *"institutions, churches and many organization
            * > would use this take mobile to record their
            * > services and programs, being light wieghts, send
            * > to the balancevid for production."*
            *
            * The line said *watch what is on, and take part in
            * what is open*, which describes a viewer who
            * wandered in. The person this page is most often
            * opened by is a volunteer at the back of a hall who
            * was sent a link that morning and is about to
            * record a service on a phone — and nothing on the
            * screen told them they were in the right place.
            *
            * RECORD BEFORE WATCH, because that is the order of
            * the two things and the second one is the one
            * people already know how to do.
            */}
          <p className="tk-hero-under">
            Record a service, a programme or a song on your phone and send it
            straight to the studio. Watch what is on while you wait.
          </p>
          {/*
            * THE FIELD NARROWS WHAT IS ALREADY HERE RATHER THAN
            * ASKING THE SERVER AGAIN. Everything on this page has
            * been fetched — it is tens of rows, not thousands —
            * so a round trip per keystroke would be slower than
            * the filter and would not work on a bad connection,
            * which is the connection this app is for. [D-19]
            */}
          <label className="tk-find">
            <Icon name="search" size={16} />
            <input value={finding} data-testid="take-find"
                   placeholder="Find a channel or a song"
                   aria-label="Find a channel or a song"
                   onChange={(event) => setFinding(event.target.value)} />
            {finding && (
              <button type="button" className="tk-find-clear"
                      aria-label="Clear" onClick={() => setFinding('')}>
                <Icon name="close" size={13} />
              </button>
            )}
          </label>
        </div>
      </div>

      {/*
        * TABS THAT CUT THE PAGE DOWN, NOT TABS THAT NAVIGATE.
        *   [D-04]
        *
        * Everything on this page has already been fetched — it
        * is tens of rows, not thousands — so a tab is a filter
        * over what is here rather than a second screen to load.
        * The one a reader presses hides the shelves they did
        * not ask for, which on a phone is the difference
        * between a page and a scroll.
        *
        * EVERY TAB HAS SOMETHING UNDER IT. A tab that can be
        * empty is a tab somebody has to press to find out, and
        * the whole point of the row is to save them that.
        * [D-21]
        */}
      <nav className="tk-tabs" data-testid="take-tabs" aria-label="What to show">
        {tabs.map((one) => (
          <button key={one.id} type="button" className="tk-tab"
                  data-testid="take-tab"
                  aria-pressed={chosen === one.id}
                  onClick={() => setShowing(one.id)}>
            <Icon name={one.mark} size={14} />
            {one.says}
          </button>
        ))}
      </nav>

      <main className="tk-main">

        {said && (
          <p className="tk-say" data-testid="take-home-said">{said}</p>
        )}

        {/*
          * MY TAKES FIRST WHERE THERE IS SOMETHING IN IT, and not at all
          * where there is not. A returning performer came back for their
          * own material; a first-time visitor has none, and an empty "My
          * Takes" at the top of the first screen is the narrow,
          * disposable impression the brief is trying to avoid. [P5]
          */}
        {mine.length > 0 && (
          <section className="tk-shelf" data-testid="section-mine">
            <div className="tk-shelf-head">
              <h2 className="tk-shelf-title">My takes</h2>
              <span className="tk-shelf-count">
                {mine.length === 1 ? '1' : mine.length}
              </span>
            </div>
            <ul className="tk-rows">
              {mine.map((one) => (
                <li key={one.link} data-testid="mine-row" className="tk-row">
                  <span aria-hidden="true" className="tk-row-mark">
                    <Icon name="disk" size={16} />
                  </span>
                  <span className="tk-row-said">
                    <span className="tk-row-name">{one.title}</span>
                  </span>
                  <span className="tk-row-go">
                    <a className="tk-go" data-testid="mine-open"
                       href={`/take/${encodeURIComponent(one.link)}`}>
                      Open
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          * CALLS ABOVE EVERYTHING BUT A PERSON'S OWN TAKES.
          *   [GO-VIRAL §1, V-4, V-8]
          *
          * A call is the one row on this screen with a deadline on
          * it, and the loop section 1 describes starts with
          * somebody seeing one. Below the four sections it would
          * be below everything a first-time visitor scrolls past.
          *
          * AND THE LIST IS MERGED ACROSS INSTALLATIONS, which is
          * the whole of V-8's third claim drawn: the BalanceVid
          * public competition network is one more connection, its
          * calls sit next to a friend's self-hosted ones, and the
          * link goes to ITS OWN `/go` page where the ordinary Take
          * protocol takes over. Nothing is proxied through here.
          */}
        {calls.length > 0 && shows('calls') && (
          <section className="tk-shelf" data-testid="section-calls">
            <div className="tk-shelf-head">
              <h2 className="tk-shelf-title">Open calls</h2>
              <span className="tk-shelf-count">
                {calls.length === 1 ? '1 open' : `${calls.length} open`}
              </span>
            </div>
            <ul className="tk-calls">
              {calls.map((one) => (
                /*
                  * STACKED, BECAUSE A PHONE IS 390 PIXELS WIDE.
                  *   [GO-VIRAL V-8; U-19]
                  *
                  * One row held the title, the ask, the standing chip
                  * and the button, so the ask was cut to *"Sing the
                  * second verse of “The L…"* and the chip took a
                  * third of the screen. Found in a screenshot.
                  *
                  * THE ASK IS THE REASON SOMEBODY PRESSES IT, so it gets
                  * two whole lines of its own rather than whatever is
                  * left beside a chip. The chip and the button go
                  * underneath, where a thumb is.
                  */
                <li key={`${one.from?.origin ?? ''}${one.id}`}
                    data-testid="call-row" data-open={one.open ? 'yes' : 'no'}
                    className="tk-call">
                  {/*
                    * THE SUBJECT, AS A KICKER. A call is a call
                    * ABOUT something, and `about` is the track's
                    * own kind rather than a label somebody typed
                    * — so a reader can tell a song from a film
                    * before reading either. [V-4, D-19]
                    */}
                  {/*
                    * `shelfFor`, NOT `identityFor`. A logo
                    * ground is deliberately muted because it
                    * sits behind somebody else's mark; this
                    * square has nothing in front of it, and
                    * three muted ones in a column read as three
                    * empty boxes. The same argument the
                    * category tiles made. [D-19]
                    */}
                  <span aria-hidden="true" className="tk-call-art"
                        style={shelfFor(one.slug ?? one.id)} />
                  <span className="tk-call-said">
                    <span className="tk-call-kind" data-about={one.about}>
                      <Icon name={aboutSays(one.about).mark} size={11} />
                      {aboutSays(one.about).says}
                    </span>
                    <span className="tk-row-name">{one.title}</span>
                    <span className="tk-row-under">
                      {connections.length > 0 && one.from
                        ? `${one.from.name} · ${one.asks}` : one.asks}
                    </span>
                    <span className="tk-call-foot">
                      <Standing call={one} />
                    </span>
                  </span>
                  {/*
                    * THE VERB IS *TAKE PART*, WHICH IS WHAT
                    * PRESSING IT LEADS TO. It said *Look*, which
                    * is true of the next page and not of the
                    * reason anybody is on this one.
                    */}
                  <a className="tk-go tk-call-go" data-testid="call-open"
                     data-at={one.at} href={one.at}>
                    Take Part
                    <Icon name="chevron" size={13} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rows === null && (
          <p className="tk-note">Looking…</p>
        )}

        {rows !== null && SECTIONS.filter((section) => shows(section.kind))
          .map((section) => {
          const found = rows
            .filter((row) => row.kind === section.kind)
            .filter((row) => matches(row.title, finding));
          return (
            <section key={section.kind} className="tk-shelf"
                     data-testid={`section-${section.kind}`}>
              <div className="tk-shelf-head">
                <h2 className="tk-shelf-title">{section.title}</h2>
                {found.length > 0 && (
                  <span className="tk-shelf-count">{found.length}</span>
                )}
              </div>
              {found.length === 0 ? (
                <p className="tk-empty">
                  {finding ? `Nothing here matches “${finding}”.` : section.empty}
                </p>
              ) : section.kind === 'programme' ? (
                /*
                  * CHANNELS ARE TILES AND NOT ROWS, AND THERE
                  * ARE SIX OF THEM.
                  *
                  * Seventeen channel names down one column was
                  * the whole of this page below the fold — a
                  * directory rendered as a receipt. A channel
                  * has a face: the television pages give one to
                  * a station with no logo, deterministically
                  * from its address, and the same function
                  * answers here. Six, because this is the Take
                  * App and the network has its own directory
                  * one press away. [D-19, D-04, U-19]
                  */
                <>
                  <div className="tk-tiles" data-testid="take-channels">
                    {found.slice(0, SHOWN).map((row) => (
                      <a key={row.id} className="tk-tile"
                         data-testid="participate-row" data-kind={row.kind}
                         data-state={row.state}
                         style={identityFor(row.slug ?? row.id)}
                         href={`${isElsewhere(row) ? row.from!.origin : ''}${row.watch}`}>
                        <span aria-hidden="true" className="tk-tile-wash" />
                        <span className="tk-tile-top">
                          <span aria-hidden="true" className="tk-tile-mark">
                            {initials(row.title)}
                          </span>
                          {/*
                            * LIVE WHERE IT IS LIVE, and nowhere
                            * else. A badge every card carries is
                            * a badge that means nothing. [D-21]
                            */}
                          {row.live && (
                            <span className="tk-tile-live">
                              <span aria-hidden="true" className="tk-tile-dot" />
                              LIVE
                            </span>
                          )}
                        </span>
                        <span className="tk-tile-name">{row.title}</span>
                        {/*
                          * WHAT IS ON, WHERE THE CHANNEL IS
                          * SHOWING ANYTHING. The row carries it
                          * now, from the same `nowAndNext` the
                          * guide and the directory read — a card
                          * with a name and nothing under it is a
                          * card nobody can choose between. The
                          * verb falls back to *Watch* rather
                          * than drawing the words this product
                          * wrote for dead air. [N-7, D-21]
                          */}
                        <span className="tk-tile-go">
                          {row.now ?? (
                            <>
                              <Icon name="play" size={12} />
                              Watch
                            </>
                          )}
                        </span>
                      </a>
                    ))}
                  </div>
                  {found.length > SHOWN && (
                    <a className="tk-more" href="/tv/channels">
                      All {found.length} channels
                      <Icon name="chevron" size={13} />
                    </a>
                  )}
                </>
              ) : (
                <ul className="tk-rows">
                  {found.map((row) => (
                    <li key={row.id} data-testid="participate-row"
                        data-kind={row.kind} data-state={row.state}
                        className="tk-row">
                      <span aria-hidden="true" className="tk-row-mark">
                        <Icon name={MARKS[row.kind]} size={16} />
                      </span>
                      <div className="tk-row-said">
                        <div className="tk-row-name">{row.title}</div>
                        {/*
                          * WHOSE IT IS, ONCE THERE IS MORE THAN ONE.
                          *
                          * A person with three production companies in
                          * one app must never be unsure whose song they
                          * are looking at. With one installation the
                          * label is noise — it says the only thing that
                          * could be true. [U-19]
                          */}
                        {(row.author || (connections.length > 0 && row.from)) && (
                          <div className="tk-row-under">
                            {/*
                              * AND NOT TWICE. A browser run showed
                              * "Redemption Records · Redemption
                              * Records": a production company that
                              * publishes under its own name is the
                              * ordinary case, not an edge one, and
                              * the author and the installation are
                              * then the same words.
                              */}
                            {[row.author,
                              connections.length > 0 && row.from?.name !== row.author
                                ? row.from?.name : null]
                              .filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      {/*
                        * WATCH IT BEFORE DECIDING, always — the brief's
                        * own order for video and Online TV, and right for
                        * a song too: nobody sings on something they have
                        * not heard.
                        */}
                      <a className="tk-go tk-go-quiet" data-testid="row-watch"
                         href={`${isElsewhere(row) ? row.from!.origin : ''}${row.watch}`}>
                        <Icon name={row.kind === 'music' ? 'sound' : 'play'}
                              size={13} />
                        {row.kind === 'music' ? 'Listen' : 'Watch'}
                      </a>
                      {/*
                        * AND THE ACTION, ONLY WHERE IT WOULD WORK.
                        *
                        * `openToAnyone` is the one question a browsing
                        * surface can answer for itself. An item that is
                        * respondable but narrower than `anyone` needs a
                        * link or an invitation the producer hands out —
                        * so it says so rather than offering a button
                        * that would be refused, which is a control that
                        * looks like a fault. [U-19, PART FIVE]
                        */}
                      {row.openToAnyone && !isElsewhere(row) ? (
                        <button type="button" className="tk-go"
                                data-testid="row-take"
                                disabled={busy === row.id}
                                onClick={() => void take(row)}>
                          {busy === row.id ? 'Opening…' : takeVerb(row.kind)}
                        </button>
                      ) : row.openToAnyone ? (
                        /*
                          * TAKING PART HAPPENS WHERE THE SONG LIVES.
                          *
                          * Reading another installation's listing is a
                          * cross-origin GET of public data. CLAIMING is
                          * a write, and it has no CORS by design — so
                          * this sends the person to the installation
                          * that owns it rather than making a request on
                          * their behalf somewhere else. One more press,
                          * and a claim that is always same-origin on the
                          * instance that will hold the recording. [P16]
                          */
                        <a className="tk-go" data-testid="row-take-there"
                           href={`${row.from!.origin}/take`}
                           title={`Open on ${row.from!.name}`}
                           style={{
                             /*
                               * AN INSTALLATION NAMES ITSELF, so this
                               * label is as long as somebody else
                               * decided. "The Redemption Records
                               * Recording Company of Greater
                               * Manchester Limited" on a 412px phone
                               * pushed every card to 492px — clipped,
                               * not scrolled, with the action simply
                               * not on screen.
                               */
                             minWidth: 0, maxWidth: '58%',
                             flex: '0 1 auto', overflow: 'hidden',
                           }}>
                          {/*
                            * THE ELLIPSIS LIVES ON A BLOCK, because
                            * `text-overflow` does nothing on a FLEX
                            * CONTAINER — and `.btn` is one. Putting
                            * it on the anchor looked right and
                            * truncated nothing, which a measurement
                            * caught and reading the CSS did not.
                            */}
                          <span style={{
                            display: 'block', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            Open on {row.from!.name}
                          </span>
                        </a>
                      ) : row.respondable ? (
                        <span className="tk-row-quiet"
                              data-testid="row-invite-only">
                          By invitation
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {/*
          * THE INSTALLATIONS THIS DEVICE KNOWS.  [U3, P22, P23, P25]
          *
          * Last, because a first-time visitor is here to find a song
          * and not to manage a list — and the list is empty for them
          * anyway. A musician with three production companies is the
          * person this section is for, and they will come looking.
          */}
        {chosen === 'all' && (
        <section className="tk-shelf" data-testid="section-instances">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">Where you take part</h2>
          </div>
          <ul className="tk-rows">
            <li className="tk-row" data-testid="instance-here">
              <span aria-hidden="true" className="tk-row-mark">
                <Icon name="home" size={16} />
              </span>
              <span className="tk-row-said">
                <span className="tk-row-name">
                  {whereIAm?.name ?? 'This installation'}
                </span>
                <span className="tk-row-under">you are here</span>
              </span>
            </li>
            {connections
              .filter((one) => one.origin !== origin)
              .map((one) => (
                <li key={one.origin} data-testid="instance-row"
                    className="tk-row">
                  <span aria-hidden="true" className="tk-row-mark"
                        data-asleep={asleep.includes(one.origin) ? 'true' : 'false'}>
                    <Icon name="link" size={16} />
                  </span>
                  <div className="tk-row-said">
                    <div className="tk-row-name">{one.name}</div>
                    <div className="tk-row-under">
                      {asleep.includes(one.origin)
                        ? 'not answering just now'
                        : one.origin.replace(/^https?:\/\//, '')}
                    </div>
                  </div>
                  <button type="button" className="tk-quiet"
                          data-testid="instance-forget"
                          title="Forget this installation on this device"
                          onClick={() => forget(one.origin)}>
                    Forget
                  </button>
                </li>
              ))}
          </ul>
          <div className="tk-field">
            <input data-testid="instance-add"
                   placeholder="Add another BalanceVid"
                   aria-label="The address of another BalanceVid"
                   value={adding}
                   onChange={(event) => setAdding(event.target.value)}
                   onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} />
            <button type="button" className="tk-go"
                    data-testid="instance-add-go"
                    disabled={!adding.trim()}
                    onClick={() => void add()}>
              Add
            </button>
          </div>
        </section>
        )}

        <p className="tk-note">
          {/*
            * WHOSE INSTALLATION THIS IS, said plainly. One Take App
            * speaks to many independent BalanceVid installations, and a
            * person who has taken part in three of them should never be
            * unsure which one they are looking at. [P13, P22]
            */}
          Every BalanceVid keeps its own productions. What you record for
          one of them stays with them, and this list is on your device
          alone.
        </p>
      </main>

      {/*
        * A BOTTOM BAR, WHICH IS WHAT AN APP HAS.  [D-04]
        *
        * EVERY TAB GOES SOMEWHERE THAT EXISTS. The design this
        * was built against carries Home, Discover, Take Part, My
        * Takes and Library; three of those are pages this
        * product has and two are not, so three are drawn. A bar
        * with a dead tab in it is worse than a bar with three
        * live ones. [D-21]
        *
        * TAKE PART IS THE RAISED ONE because it is the verb the
        * whole application is named for — and it goes to the
        * calls, which is where taking part starts.
        */}
      <nav className="tk-bottom" aria-label="Where to go"
           data-testid="take-bottom">
        <a className="tk-bottom-way" href="/take" aria-current="page">
          <Icon name="home" size={19} />
          Home
        </a>
        <a className="tk-bottom-way" href="/tv">
          <Icon name="broadcast" size={19} />
          Watch
        </a>
        <a className="tk-bottom-go" href="/go">
          <span aria-hidden="true" className="tk-bottom-go-mark">
            <Icon name="plus" size={20} />
          </span>
          Take Part
        </a>
        <a className="tk-bottom-way" href="/tv/guide">
          <Icon name="calendar" size={19} />
          Guide
        </a>
        <a className="tk-bottom-way" href="/tv/favorites">
          <Icon name="passed" size={19} />
          Mine
        </a>
      </nav>
    </div>
  );
}

/**
 * Whether this row belongs to another installation.
 *
 * COMPARED AGAINST WHERE THE PAGE IS, not against a flag, because the
 * row's own `from` is filled in by whichever client asked — and the
 * question being answered is "can I act on this here", which only the
 * page's own origin can answer.
 */
function isElsewhere(row: { from?: { origin: string } }): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(row.from && row.from.origin !== window.location.origin);
}

/**
 * How many channels a shelf shows before it points at the
 * directory.
 *
 * SIX, BECAUSE THIS IS THE TAKE APP. The network has its own
 * directory one press away, and a page whose job is *what can I
 * take part in* should not be seventeen channel names long
 * before a visitor reaches the thing they came for.
 */
const SHOWN = 6;

/**
 * A CALL'S SUBJECT, AS A READER'S WORD FOR IT.
 *
 * `about` is the track's own kind — `performance`,
 * `conversation`, `channel` — which is a word about how this
 * product stores things. What goes on a card is what the call
 * asks of somebody, which is the same three in their own
 * language. The mapping is here, on the surface, because the
 * domain must not acquire an opinion about English. [D-19]
 */
const ABOUT: Record<string, { says: string; mark: IconName }> = {
  performance: { says: 'Music', mark: 'music' },
  conversation: { says: 'Video', mark: 'play' },
  channel: { says: 'Programme', mark: 'broadcast' },
};

/*
 * AND A CALL FROM A NEWER INSTALLATION STILL DRAWS. These rows
 * are merged across installations, so `about` is a word
 * somebody ELSE's version of this product chose — a kind added
 * there and not here must not leave a hole in the card. [V-8,
 * U-19]
 */
function aboutSays(kind: string): { says: string; mark: IconName } {
  return ABOUT[kind] ?? { says: 'Call', mark: 'live' };
}

/**
 * WHAT A TAB SHOWS, AND THE ONE RULE THEY ALL OBEY.
 *
 * `All` is not a tab that filters nothing — it is the absence
 * of a filter, which is why it has no `kinds`. Every other tab
 * names the shelves it keeps, and a tab whose shelves are all
 * empty is not offered at all. [D-21]
 */
const TABS = [
  { id: 'all', says: 'For You', mark: 'home' as IconName, kinds: null },
  { id: 'calls', says: 'Take Part', mark: 'live' as IconName, kinds: ['calls'] },
  { id: 'tv', says: 'Live TV', mark: 'broadcast' as IconName, kinds: ['programme'] },
  { id: 'music', says: 'Music', mark: 'music' as IconName, kinds: ['music'] },
  { id: 'video', says: 'Video', mark: 'play' as IconName, kinds: ['video'] },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Two letters for a channel with no logo here.
 *
 * THE SAME TWO THE TELEVISION CARDS USE, and derived the same
 * way: a callsign if the listing carried one, and the first
 * letters of the name otherwise. This surface is handed a title
 * and nothing else, so it is always the name. [D-19]
 */
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '··';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Whether a row survives what is being looked for.
 *
 * FOLDED AND TRIMMED, because somebody types ` Worship ` and
 * means `worship`, and a filter that cared would be a filter
 * that fails for a reason nobody can see. An empty query
 * matches everything rather than nothing, which is what an
 * untouched field has to mean. [channelSearch.ts]
 */
function matches(title: string, finding: string): boolean {
  const want = finding.trim().toLowerCase();
  return !want || title.toLowerCase().includes(want);
}

/** The verb that matches what is being offered. [P2, P3, P4] */
function takeVerb(kind: Row['kind']): string {
  if (kind === 'music') return 'Take this song';
  if (kind === 'video') return 'Respond';
  return 'Send something in';
}






