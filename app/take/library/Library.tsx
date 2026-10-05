'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import Icon from '../../Icon.js';
import { GroundToggle } from '../../Ground.js';
import { type Mine, forgetMine, readMine } from '../mine.js';

/**
 * The Library.  [TAKE-APP T16, P5; Doctrine D-04, D-19, D-25]
 *
 * > *"Mobile take app should have the Library (which has my
 * > collection. My collection are already produced TAKE of the
 * > person that was produced by the balancevid studio and
 * > generated. The owner of take can download it or share it
 * > through their phones) where there is My Takes and other
 * > information"*
 *
 * TWO SHELVES AND THEY ANSWER TWO QUESTIONS. *My collection* is
 * what came BACK: the finished pieces a studio produced with
 * this person's work in them, which they can keep or send to
 * somebody. *My takes* is what went OUT: every link this device
 * holds, open or decided. A single list ordered by date would
 * bury the four things somebody actually wants under forty
 * invitations they have finished with. [D-04]
 *
 * THE COLLECTION IS DERIVED, NOT STORED. Nothing on this device
 * records *you are in this film*; the link does, by asking. Each
 * held link is read, and the ones whose answer carries a
 * `collection` are the collection — so a piece that is
 * published next week appears next week without this phone
 * having been told anything, and a piece its producer withdraws
 * disappears the same way. [T16]
 *
 * ASKED WHEN THE PAGE OPENS AND NOT BEFORE. The home screen
 * makes one request for the whole network; this makes one per
 * held link, which is the cost of there being no account to
 * query. It is paid on a page somebody chose to open, in
 * parallel, and a link that fails is a row that says so rather
 * than a page that does not load. [U-19]
 */

interface Entry {
  mine: Mine;
  /** What came back, where anything did. */
  title?: string;
  outcome?: { state: string; says: string };
  collection?: { title: string; watch: string; file: string };
  /** The link could not be read at all. */
  lost?: boolean;
}

/**
 * HOW MANY ARE ASKED AT ONCE.
 *
 * Fifty parallel requests from a phone on a hall's wifi is a
 * phone that times out on all fifty. Six at a time is what a
 * browser would do to one origin anyway, done on purpose so the
 * first rows appear while the rest are still going.
 */
const AT_ONCE = 6;

async function askAll(
  held: Mine[], onRow: (entry: Entry) => void,
): Promise<void> {
  const queue = [...held];
  const workers = Array.from({ length: Math.min(AT_ONCE, queue.length) },
    async () => {
      for (;;) {
        const one = queue.shift();
        if (!one) return;
        onRow(await ask(one));
      }
    });
  await Promise.all(workers);
}

async function ask(mine: Mine): Promise<Entry> {
  try {
    const answer = await fetch(
      `/api/take/${encodeURIComponent(mine.link)}`, { cache: 'no-store' });
    if (!answer.ok) return { mine, lost: true };
    const said = await answer.json() as {
      request?: {
        assignment?: { asks?: string };
        outcome?: { state: string; says: string };
        collection?: { title: string; watch: string; file: string };
      };
    };
    const request = said.request;
    return {
      mine,
      ...(request?.assignment?.asks ? { title: request.assignment.asks } : {}),
      ...(request?.outcome ? { outcome: request.outcome } : {}),
      ...(request?.collection ? { collection: request.collection } : {}),
    };
  } catch {
    /* No connection is not a lost link — it is a link nobody
       could ask about just now, and saying "gone" would be a
       lie a person acts on. [U-19] */
    return { mine };
  }
}

/**
 * Send it to somebody, with the phone's own sheet where there
 * is one.
 *
 * `navigator.share` IS THE WHOLE POINT ON A PHONE. It opens the
 * list of applications the person already sends things with —
 * their own messages, their own group — and this product does
 * not have to know what any of them are. Where it does not
 * exist, the address goes on the clipboard, which is what a
 * desktop browser can do.
 */
function useShare(): (title: string, url: string) => Promise<string | null> {
  return useCallback(async (title: string, url: string) => {
    const whole = new URL(url, window.location.origin).toString();
    const sheet = (navigator as unknown as {
      share?: (data: { title?: string; url?: string }) => Promise<void>;
    }).share;
    if (sheet) {
      try {
        await sheet.call(navigator, { title, url: whole });
        return null;
      } catch {
        /* A person who opened the sheet and closed it again has
           not failed at anything, and a red line telling them
           they have is worse than silence. */
        return null;
      }
    }
    try {
      await navigator.clipboard.writeText(whole);
      return 'Link copied.';
    } catch {
      return 'Could not copy — the address is in the page.';
    }
  }, []);
}

export default function Library() {
  const [held, setHeld] = useState<Mine[] | null>(null);
  const [rows, setRows] = useState<Record<string, Entry>>({});
  const [said, setSaid] = useState<string | null>(null);
  const share = useShare();

  useEffect(() => {
    const mine = readMine();
    setHeld(mine);
    if (mine.length === 0) return;
    let stopped = false;
    void askAll(mine, (entry) => {
      if (stopped) return;
      setRows((was) => ({ ...was, [entry.mine.link]: entry }));
    });
    return () => { stopped = true; };
  }, []);

  const drop = useCallback((link: string) => {
    setHeld(forgetMine(link));
  }, []);

  const collection = (held ?? [])
    .map((one) => rows[one.link])
    .filter((one): one is Entry & { collection: NonNullable<Entry['collection']> } =>
      one?.collection !== undefined);

  return (
    <div className="tk-page" data-ground="light" data-ground-host
         data-testid="take-library">
      <header className="tk-bar">
        <Link href="/take" className="tk-ident">
          <span aria-hidden="true" className="tk-ident-mark">
            <Icon name="library" size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="tk-ident-name">Library</span>
            <span className="tk-ident-says">Your work, and your takes</span>
          </span>
        </Link>
        <Link href="/take" className="tk-bar-way">
          <Icon name="home" size={14} />
          Home
        </Link>
        <GroundToggle />
      </header>

      <main className="tk-main">
        {said && (
          <p className="tk-say" data-testid="library-said">{said}</p>
        )}

        {/*
          * MY COLLECTION FIRST, because it is the reason to open
          * this page. *My takes* is a record; this is a shelf of
          * finished things with somebody's own voice on them.
          * [D-04]
          */}
        <section className="tk-shelf" data-testid="section-collection">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">My collection</h2>
            {collection.length > 0 && (
              <span className="tk-shelf-count">{collection.length}</span>
            )}
          </div>
          {collection.length === 0
            ? (
              /*
               * AND THE EMPTY STATE SAYS WHAT HAS TO HAPPEN,
               * which is not *nothing here yet*. A person whose
               * take was accepted last week and whose producer
               * has not published is in a true and specific
               * situation, and a blank shelf reads as a fault
               * in the app. [U-19, C-46]
               */
              <p className="tk-empty" data-testid="collection-empty">
                Nothing finished yet. When a studio publishes something your
                take is in, it appears here to keep or to send on.
              </p>
            )
            : (
              <ul className="tk-rows">
                {collection.map((one) => (
                  <li key={one.mine.link} className="tk-row"
                      data-testid="collection-row">
                    <span aria-hidden="true" className="tk-row-mark">
                      <Icon name="play" size={16} />
                    </span>
                    <span className="tk-row-said">
                      <span className="tk-row-name">{one.collection.title}</span>
                      <span className="tk-row-under">
                        {one.outcome?.says ?? 'Your take was used.'}
                      </span>
                    </span>
                    <span className="tk-row-go tk-row-keep">
                      {/*
                        * WATCH, KEEP, SEND — three verbs, and the
                        * middle one is the one this page exists
                        * for. `download` on an anchor is what a
                        * phone's own browser understands as *put
                        * this in my files*; a button that fetched
                        * the bytes into memory first would be the
                        * same file, held twice, on the device with
                        * the least room for it.
                        */}
                      <a className="tk-go tk-go-quiet" href={one.collection.watch}
                         data-testid="collection-watch">Watch</a>
                      {/*
                        * KEEP IS THE FILLED ONE, because it is
                        * the verb this page was asked for: *the
                        * owner of take can download it or share
                        * it*. Watching is what the public page
                        * is for; keeping is what having been in
                        * it earns. [D-04]
                        */}
                      <a className="tk-go" href={one.collection.file}
                         download data-testid="collection-keep">Keep</a>
                      <button type="button" className="tk-go tk-go-quiet"
                              data-testid="collection-share"
                              onClick={() => {
                                void share(one.collection.title,
                                  one.collection.watch).then(setSaid);
                              }}>
                        Send
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        {/*
          * AND EVERYTHING THIS DEVICE HOLDS, open or decided.
          * [P5]
          */}
        <section className="tk-shelf" data-testid="section-mine">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">My takes</h2>
            {(held?.length ?? 0) > 0 && (
              <span className="tk-shelf-count">{held!.length}</span>
            )}
          </div>
          {held !== null && held.length === 0
            ? (
              <p className="tk-empty" data-testid="mine-empty">
                You have not taken part in anything on this phone yet. A studio
                sends you a link; everything you open is kept here.
              </p>
            )
            : (
              <ul className="tk-rows">
                {(held ?? []).map((one) => {
                  const row = rows[one.link];
                  return (
                    <li key={one.link} className="tk-row" data-testid="mine-row">
                      <span aria-hidden="true" className="tk-row-mark">
                        <Icon name="disk" size={16} />
                      </span>
                      <span className="tk-row-said">
                        <span className="tk-row-name">
                          {row?.title ?? one.title}
                        </span>
                        <span className="tk-row-under">
                          {row === undefined ? 'Checking…'
                            : row.lost ? 'That link is closed.'
                              : row.outcome?.says ?? 'Still open.'}
                        </span>
                      </span>
                      <span className="tk-row-go tk-row-keep">
                        <a className="tk-go tk-go-quiet"
                           data-testid="mine-open"
                           href={`/take/${encodeURIComponent(one.link)}`}>
                          Open
                        </a>
                        {/*
                          * FORGETTING IS LOCAL AND TELLS THE
                          * INSTALLATION NOTHING, because the
                          * installation was never told anything.
                          * A link somebody opened by mistake is
                          * theirs to remove from their own
                          * phone. [D-03]
                          */}
                        <button type="button" className="tk-go tk-go-quiet"
                                data-testid="mine-forget"
                                onClick={() => drop(one.link)}>
                          Forget
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>

        {/*
          * AND THE OTHER INFORMATION, which is one sentence and
          * is the most important one on the page.
          *
          * This list is the browser's, not an account's: there
          * is no sign-in on the Take App by construction, and
          * nothing about this device is written down on any
          * installation. A person who clears their storage has
          * lost the list, and being told so afterwards is being
          * told too late. [D-03, U-19]
          */}
        <section className="tk-shelf" data-testid="section-about">
          <div className="tk-shelf-head">
            <h2 className="tk-shelf-title">About this library</h2>
          </div>
          <p className="tk-empty">
            This list lives on this phone, not in an account — BalanceVid never
            asks who you are. Clearing your browser&rsquo;s storage clears it,
            so keep the links a studio sends you. Finished work stays on
            BalanceVid either way.
          </p>
        </section>
      </main>
    </div>
  );
}
