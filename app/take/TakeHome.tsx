'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  addConnection, asOrigin, askInstance, readConnections, removeConnection,
  type Connection,
} from './connections.js';
import { type HomeCall, type Row, homeFrom } from './home.js';
import { Standing } from '../go/Go.js';

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
    <main className="shell" data-testid="take-home" style={page}>
      <div style={column}>
        <header style={{ textAlign: 'center' }}>
          <h1 style={brand}>BalanceVid</h1>
          <p className="small muted" style={{ margin: 0 }}>
            Watch, listen, and take part.
          </p>
        </header>

        {said && (
          <p className="small" data-testid="take-home-said"
             style={{ margin: 0, textAlign: 'center', color: 'var(--ink-on-bad)' }}>
            {said}
          </p>
        )}

        {/*
          * MY TAKES FIRST WHERE THERE IS SOMETHING IN IT, and not at all
          * where there is not. A returning performer came back for their
          * own material; a first-time visitor has none, and an empty "My
          * Takes" at the top of the first screen is the narrow,
          * disposable impression the brief is trying to avoid. [P5]
          */}
        {mine.length > 0 && (
          <section data-testid="section-mine">
            <h2 style={heading}>My takes</h2>
            <ul style={list}>
              {mine.map((one) => (
                <li key={one.link} data-testid="mine-row" style={card}>
                  <span className="grow" style={{ fontSize: 'var(--text-sm)' }}>
                    {one.title}
                  </span>
                  <a className="btn ctl sm" data-testid="mine-open"
                     href={`/take/${encodeURIComponent(one.link)}`}>
                    Open
                  </a>
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
        {calls.length > 0 && (
          <section data-testid="section-calls">
            <h2 style={heading}>Open calls</h2>
            <ul style={list}>
              {calls.map((one) => (
                <li key={`${one.from?.origin ?? ''}${one.id}`}
                    data-testid="call-row" data-open={one.open ? 'yes' : 'no'}
                    style={card}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--text-sm)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{one.title}</div>
                    <div className="small muted"
                         style={{
                           fontSize: 'var(--text-2xs)', overflow: 'hidden',
                           textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                         }}>
                      {connections.length > 0 && one.from
                        ? `${one.from.name} · ${one.asks}` : one.asks}
                    </div>
                  </div>
                  <Standing call={one} />
                  <a className="btn ctl sm" data-testid="call-open"
                     data-at={one.at} href={one.at}>
                    Look
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rows === null && (
          <p className="small muted" style={{ textAlign: 'center' }}>Loading…</p>
        )}

        {rows !== null && SECTIONS.map((section) => {
          const found = rows.filter((row) => row.kind === section.kind);
          return (
            <section key={section.kind} data-testid={`section-${section.kind}`}>
              <h2 style={heading}>{section.title}</h2>
              {found.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>{section.empty}</p>
              ) : (
                <ul style={list}>
                  {found.map((row) => (
                    <li key={row.id} data-testid="participate-row"
                        data-kind={row.kind} data-state={row.state} style={card}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 'var(--text-sm)', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{row.title}</div>
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
                          <div className="small muted"
                               style={{
                                 fontSize: 'var(--text-2xs)',
                                 overflow: 'hidden', textOverflow: 'ellipsis',
                                 whiteSpace: 'nowrap',
                               }}>
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
                      <a className="btn quiet sm" data-testid="row-watch"
                         href={`${isElsewhere(row) ? row.from!.origin : ''}${row.watch}`}>
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
                        <button className="ctl sm" data-testid="row-take"
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
                        <a className="btn ctl sm" data-testid="row-take-there"
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
                        <span className="small muted" data-testid="row-invite-only"
                              style={{ fontSize: 'var(--text-2xs)' }}>
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
        <section data-testid="section-instances">
          <h2 style={heading}>Where you take part</h2>
          <ul style={list}>
            <li style={{ ...card, opacity: 0.75 }} data-testid="instance-here">
              <span className="grow" style={{ fontSize: 'var(--text-sm)' }}>
                {whereIAm?.name ?? 'This installation'}
              </span>
              <span className="small muted" style={{ fontSize: 'var(--text-2xs)' }}>
                you are here
              </span>
            </li>
            {connections
              .filter((one) => one.origin !== origin)
              .map((one) => (
                <li key={one.origin} data-testid="instance-row" style={card}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--text-sm)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{one.name}</div>
                    <div className="small muted" style={{
                      fontSize: 'var(--text-2xs)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {asleep.includes(one.origin)
                        ? 'not answering just now'
                        : one.origin.replace(/^https?:\/\//, '')}
                    </div>
                  </div>
                  <button className="quiet sm" data-testid="instance-forget"
                          title="Forget this installation on this device"
                          onClick={() => forget(one.origin)}>
                    Forget
                  </button>
                </li>
              ))}
          </ul>
          <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'nowrap' }}>
            <input
              className="small grow" data-testid="instance-add"
              placeholder="Add another BalanceVid"
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} />
            <button className="ctl sm" data-testid="instance-add-go"
                    disabled={!adding.trim()}
                    onClick={() => void add()}>
              Add
            </button>
          </div>
        </section>

        <p className="small muted" style={{
          textAlign: 'center', margin: 0, fontSize: 'var(--text-2xs)',
        }}>
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
      </div>
    </main>
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

/** The verb that matches what is being offered. [P2, P3, P4] */
function takeVerb(kind: Row['kind']): string {
  if (kind === 'music') return 'Take this song';
  if (kind === 'video') return 'Respond';
  return 'Send something in';
}

const page: React.CSSProperties = {
  minHeight: '100dvh', display: 'grid', placeItems: 'start center',
  padding: 'var(--space-5)',
};

/*
 * `minWidth: 0` ON A GRID ITEM, for the same reason the cards need it:
 * a grid item's automatic minimum size is its MIN-CONTENT, so a single
 * unbreakable label anywhere inside pushed this whole column — and
 * every card in it — to 492px inside a 412px phone. The page did not
 * even scroll; it clipped, so the action was simply not there.
 */
const column: React.CSSProperties = {
  width: '100%', maxWidth: 480, minWidth: 0,
  display: 'flex', flexDirection: 'column',
  gap: 'var(--space-6)', paddingTop: 'var(--space-6)',
};

const brand: React.CSSProperties = {
  margin: 0, fontSize: 'var(--text-xl)', letterSpacing: '0.02em',
};

const heading: React.CSSProperties = {
  margin: '0 0 6px', fontSize: 'var(--text-2xs)', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'var(--muted)',
};

const list: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
};

/*
 * A FLEX ITEM CANNOT SHRINK BELOW ITS MIN-CONTENT WIDTH WITHOUT
 * `min-width: 0`, and that is the whole of a fault a browser run
 * found. An installation names ITSELF, so "The Redemption Records
 * Recording Company of Greater Manchester Limited" is a label this
 * page is handed rather than one it writes — and with it the cards
 * measured 492px inside a 412px phone, clipped rather than scrolled,
 * with the action pushed off the screen entirely.
 *
 * `maxWidth` on the button could not fix it: a percentage resolves
 * against a container that had already grown. `minWidth: 0` is what
 * lets the row shrink at all, and `overflow: hidden` is what makes
 * the clip happen at the card's own edge instead of the page's.
 */
const card: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px',
  border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
  background: 'var(--console-control)',
  minWidth: 0, overflow: 'hidden',
};
