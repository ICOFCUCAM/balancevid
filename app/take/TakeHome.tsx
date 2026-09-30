'use client';

import { useCallback, useEffect, useState } from 'react';

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

interface Row {
  kind: 'music' | 'video' | 'programme';
  id: string;
  title: string;
  author?: string;
  publishedAt?: string;
  respondable: boolean;
  access: string | null;
  state: string;
  watch: string;
  openToAnyone: boolean;
}

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
  const [mine, setMine] = useState<Mine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => { setMine(readMine()); }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const response = await fetch('/api/participate', { cache: 'no-store' })
        .catch(() => null);
      if (!alive) return;
      const data = await response?.json().catch(() => ({})) ?? {};
      setRows((data.participate ?? []) as Row[]);
    })();
    return () => { alive = false; };
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
                        <div style={{ fontSize: 'var(--text-sm)' }}>{row.title}</div>
                        {row.author && (
                          <div className="small muted"
                               style={{ fontSize: 'var(--text-2xs)' }}>
                            {row.author}
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
                         href={row.watch}>
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
                      {row.openToAnyone ? (
                        <button className="ctl sm" data-testid="row-take"
                                disabled={busy === row.id}
                                onClick={() => void take(row)}>
                          {busy === row.id ? 'Opening…' : takeVerb(row.kind)}
                        </button>
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

        <p className="small muted" style={{
          textAlign: 'center', margin: 0, fontSize: 'var(--text-2xs)',
        }}>
          {/*
            * WHOSE INSTALLATION THIS IS, said plainly. One Take App
            * speaks to many independent BalanceVid installations, and a
            * person who has taken part in three of them should never be
            * unsure which one they are looking at. [P13, P22]
            */}
          You are looking at one BalanceVid installation. What you take
          part in here stays here.
        </p>
      </div>
    </main>
  );
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

const column: React.CSSProperties = {
  width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column',
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

const card: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px',
  border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
  background: 'var(--console-control)',
};
