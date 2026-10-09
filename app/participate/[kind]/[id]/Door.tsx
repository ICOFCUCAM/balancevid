'use client';

import { useCallback, useState } from 'react';

/**
 * The button a stranger presses to get their own three goes.
 *
 * IT CLAIMS ON THE PRESS AND NOT ON THE PAGE LOAD. A request
 * minted by arriving would spend one on every person who opened
 * the link to see what it was, and on every preview a messaging
 * app fetches on their behalf — the producer would find twenty
 * requests and three singers. [D-21]
 *
 * AND IT GOES WHERE THE TAKE APP ALREADY GOES. The response
 * carries the new link and this walks through the same door
 * `TakeHome` uses: `/take/<link>`, which is the recorder, the
 * retry queue and the offline shell that already exist. [D-19]
 */
export default function Door({
  state, kind, id, title,
}: {
  state: 'open' | 'missing';
  kind: string;
  id: string;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const take = useCallback(async () => {
    setBusy(true);
    setSaid(null);
    try {
      const response = await fetch(
        `/api/participate/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
        { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.link) {
        throw new Error(data.error ?? 'this is not open to take part in');
      }
      window.location.href = `/take/${encodeURIComponent(String(data.link))}`;
    } catch (error) {
      setSaid(error instanceof Error ? error.message : 'that did not work');
      setBusy(false);
    }
  }, [id, kind]);

  if (state === 'missing') {
    return (
      <main className="room" data-testid="door-shut" style={{
        maxWidth: 440, margin: '0 auto', padding: 24, textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 'var(--text-lg)' }}>This link is not open</h1>
        <p className="muted">
          It may have been closed, or it may never have been opened. Ask
          whoever sent it to you.
        </p>
      </main>
    );
  }

  return (
    <main className="room" data-testid="door-open" style={{
      maxWidth: 440, margin: '0 auto', padding: 24,
    }}>
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        YOU HAVE BEEN INVITED TO SING ON
      </p>
      <h1 data-testid="door-title" style={{ margin: '4px 0 12px' }}>{title}</h1>
      {/*
        * WHAT THEY GET, BEFORE THEY PRESS. Three goes is the thing
        * this whole door exists to hand out, and a person deciding
        * whether to sing should know they may sing again. [D-21]
        */}
      <p style={{ marginTop: 0 }}>
        Press below and you get your own three goes at it — record them on
        your phone, keep the one you like, and send it.
      </p>
      <button className="button" data-testid="door-take" disabled={busy}
              onClick={() => void take()}
              style={{ width: '100%', padding: '12px 16px' }}>
        {busy ? 'Opening…' : 'Take part'}
      </button>
      {said && (
        <p data-testid="door-error" style={{ color: 'var(--bad)' }}>{said}</p>
      )}
      <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
        {/* Nobody needs an account, which is the whole premise and
            is worth saying to somebody deciding whether to tap. */}
        No account needed. Your goes are yours — other people using this same
        link get their own.
      </p>
    </main>
  );
}
