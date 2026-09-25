'use client';

import { useState } from 'react';

/**
 * The way into Studio Three.  [Doctrine CHANNEL §1, §2, §13]
 *
 * A third door, for the reason there is a second one: this studio asks for
 * something the other two never do and never asks for what they both do.
 *
 * IT ASKS FOR NO MEDIA AT ALL, which is the first thing about a channel worth
 * knowing and the reason this form has two fields. Studio One's door asks for
 * something to respond to; Studio Two's asks for something to perform
 * against; this one asks for a name and a place, because a channel holds
 * nothing and broadcasts what the other two finished. [D-18]
 *
 * AND IT ASKS FOR THE ZONE. A channel is a place as much as a stream —
 * breakfast is breakfast where the channel is, not where the server is — and
 * a schedule built in the server's zone is a schedule that is quietly wrong
 * for everybody who does not live there. The browser knows the answer, so it
 * is offered rather than demanded.
 */
export default function StartChannel() {
  const guessed = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(guessed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/channels', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, timezone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that channel could not be started');
      window.location.href = `/t/${data.channel.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div data-testid="start-channel">
      <h2 style={{ fontSize: 16, margin: '0 0 2px' }}>Start a channel</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Schedule what you have already made. Nothing is copied.
      </p>
      <div className="field">
        <label htmlFor="channel-name">What is it called</label>
        <input
          id="channel-name" data-testid="channel-name" value={name}
          placeholder="Prof Class One"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="channel-zone">Where it keeps time</label>
        <input
          id="channel-zone" data-testid="channel-zone" value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        />
        <span className="small muted" style={{ fontSize: 11 }}>
          {/* Said because the consequence is invisible: a schedule in the
              wrong zone looks right and goes out an hour early. [§2] */}
          Nine o&rsquo;clock means nine o&rsquo;clock here.
        </span>
      </div>
      <button className="primary" data-testid="start-channel-go"
              disabled={busy || !name.trim()} onClick={() => void start()}>
        {busy ? 'Starting…' : 'Start the channel'}
      </button>
      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
    </div>
  );
}
