'use client';

/**
 * One call, as a stranger reads it.  [GO-VIRAL V-4, §10, §20]
 *
 * THE THREE THINGS THE JUDGING SENTENCE NAMES, in the order
 * somebody does them: *"reads the rules, watches entries and
 * enters."* The rules are server-rendered above this; the wall and
 * the way in are here, because both need a browser.
 */

import { useCallback, useState } from 'react';

import type { CallRow } from '../../../src/domain/campaign.js';
import { Countdown } from '../Go.js';

export interface WallEntry {
  submissionId: string;
  kind: 'video' | 'audio' | 'text';
  at: string;
  participant?: string;
  durationSamples?: number;
  media: string;
}

export interface Numbers {
  entries: number;
  finishers: number;
  arrivals: number;
  arrivalsWhoEntered: number;
}

/**
 * The way in.  [GO-VIRAL V-4, §3]
 *
 * ONE PRESS AND THEN THE TAKE APP. The request is minted by the
 * call's own door — which knows which call this is, where the
 * discovery listing's button could only guess — and what comes
 * back is a link. The page then goes there, because the next
 * thing is recording and the recorder is a surface that already
 * exists. No second recorder, no modal, no account. [D-19, D-25]
 *
 * AND IT SAYS WHAT THE SERVER SAID WHEN IT WILL NOT. A call
 * already prints its deadline and its state on this page, so a
 * refusal that repeated them leaks nothing and saves somebody
 * staring at a button that did nothing.
 */
export function EnterButton(
  { handle, asksConsent }: { handle: string; asksConsent: boolean },
) {
  const [going, setGoing] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const enter = useCallback(async () => {
    setGoing(true);
    setSaid(null);
    try {
      const response = await fetch(
        `/api/go/${encodeURIComponent(handle)}/enter`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.take) {
        setSaid(typeof data.error === 'string' ? data.error : 'that did not work');
        setGoing(false);
        return;
      }
      window.location.assign(data.take);
    } catch {
      setSaid('that did not reach the server');
      setGoing(false);
    }
  }, [handle]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button className="ctl lg primary" data-testid="go-enter"
              style={{ width: '100%', minHeight: 48 }}
              disabled={going} onClick={() => void enter()}>
        {going ? 'Opening…' : 'Enter this call'}
      </button>
      {/*
        * SAID BEFORE THE PRESS AND NOT AFTER IT.  [V-3]
        *
        * A person who presses *Enter* and lands on a wall of terms
        * has been moved somewhere they did not choose to go. One
        * line here is the whole of what they need to decide
        * whether to press it.
        */}
      {asksConsent && (
        <p className="small muted" data-testid="go-asks-consent"
           style={{ margin: 0, textAlign: 'center' }}>
          You will be asked to agree to this call&rsquo;s terms before
          the camera opens.
        </p>
      )}
      {said && (
        <p className="small" data-testid="go-said"
           style={{ margin: 0, textAlign: 'center', color: 'var(--ink-on-bad)' }}>
          {said}
        </p>
      )}
    </div>
  );
}

/**
 * The entries wall.  [GO-VIRAL V-4; V-3]
 *
 * WHAT IS HERE IS WHAT ITS MAKER SAID MAY BE HERE, and nothing
 * else. The server asked `permits(consent, 'display')` per entry;
 * an entry whose maker did not tick that box never reaches this
 * component, and one that was taken back leaves it on the next
 * load. The page does not decide this and must not look as though
 * it could. [D-19]
 *
 * `preload="metadata"`, BECAUSE A WALL IS A HUNDRED OF THESE. A
 * page that preloaded every entry would download a gigabyte onto
 * a phone to show a grid of first frames.
 *
 * AND NUMBERED WHERE THERE IS NO NAME. A claimed entry has no
 * participant — a stranger pressing *Enter* typed nothing and was
 * asked for nothing — so the wall says *Entry 4* rather than
 * inventing a name or leaving a blank where one should be.
 */
export function Wall({ entries }: { entries: WallEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="small muted" data-testid="go-wall-empty">
        No entries are being shown yet. An entry appears here when the
        person who made it agreed that it could be.
      </p>
    );
  }
  return (
    <div data-testid="go-wall" style={{
      display: 'grid', gap: 'var(--space-3)',
      /*
       * TWO ACROSS ON A PHONE, WHICH IS WHAT MAKES IT A WALL.
       * At 220px one entry filled the screen at 3:4 and a person
       * scrolled past one video per swipe — a list, not a wall.
       * A competition page is for seeing that many people entered.
       */
      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    }}>
      {entries.map((entry, index) => (
        <figure key={entry.submissionId} data-testid="go-entry"
                style={{
                  margin: 0, border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-md)', overflow: 'hidden',
                  background: 'var(--console-control)',
                }}>
          {entry.kind === 'audio' ? (
            <audio controls preload="metadata" src={entry.media}
                   style={{ width: '100%' }} />
          ) : (
            <video controls playsInline preload="metadata" src={entry.media}
                   style={{ width: '100%', display: 'block', aspectRatio: '3 / 4',
                     objectFit: 'cover', background: 'var(--screen-bed)' }} />
          )}
          <figcaption className="small muted" style={{ padding: '7px 9px' }}>
            {entry.participant ?? `Entry ${index + 1}`}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * The loop, measured.  [GO-VIRAL §20]
 *
 * > *"If entries go up and arrivals-who-entered goes down, the
 * > loop is leaking and the big number is lying to you."*
 *
 * SO THE PAIR IS DRAWN TOGETHER AND THE BIG NUMBER IS NOT DRAWN
 * BIG. Four counts of what this installation wrote about itself,
 * side by side, and the one the brief warns about — entries —
 * stands beside the one that contradicts it.
 *
 * THERE IS NO FIFTH. Shares cannot be counted without watching
 * where a visitor came from, and this installation does not watch
 * anybody. A count it cannot honestly take is a count it does not
 * print.
 */
export function Loop({ numbers }: { numbers: Numbers }) {
  const rows: [string, number][] = [
    ['Entries', numbers.entries],
    ['Finished', numbers.finishers],
    ['Arrived on their own', numbers.arrivals],
    ['…and finished', numbers.arrivalsWhoEntered],
  ];
  return (
    <dl data-testid="go-numbers" style={{
      /*
       * TWO BY TWO ON A PHONE, NOT THREE AND A STRAY. At 120px
       * three fitted and the fourth wrapped alone, which put
       * *…and finished* on a row of its own — away from the
       * *Arrived* it is the second half of, and that pair is the
       * one the brief says to read together. [§20]
       */
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 'var(--space-3)', margin: 0,
    }}>
      {rows.map(([says, count]) => (
        <div key={says} style={{
          padding: 'var(--space-3)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius-md)', background: 'var(--console-control)',
        }}>
          <dt className="small muted" style={{ margin: 0 }}>{says}</dt>
          <dd className="mono" style={{
            margin: 0, fontSize: 'var(--text-lg)',
            fontVariantNumeric: 'tabular-nums',
          }}>{count}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The deadline, with the countdown beside it where there is one. */
export function Deadline({ call }: { call: CallRow }) {
  if (!call.closesAt) return null;
  const running = call.msLeft !== null && call.msLeft > 0
    && (call.clock === 'live' || call.clock === 'closing');
  return (
    <p className="small" data-testid="go-deadline" style={{ margin: 0 }}>
      <span className="muted">Closes </span>
      <time dateTime={call.closesAt}>{call.closesAt.replace('T', ' ').slice(0, 16)} UTC</time>
      {running && <> · <Countdown msLeft={call.msLeft!} /> left</>}
    </p>
  );
}
