'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Before there is a room.  [Doctrine ROOM §6]
 *
 * One decision and one field. The name matters because it is what everyone
 * else sees beside whatever the host says, and asking for it here is cheaper
 * than asking for it in the middle of a seminar.
 */
export default function OpenRoom({
  conversationId, title,
}: { conversationId: string; title: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/room`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'open', hostName: name.trim() || 'Host' }),
      });
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'could not open it');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <header className="shell-bar">
        <h1 className="grow" style={{ fontSize: 17, margin: 0 }}>{title}</h1>
        <a className="btn" href={`/c/${conversationId}`} style={{ padding: '7px 14px' }}>
          Back to the studio
        </a>
      </header>
      <div className="shell-body" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="panel" data-testid="open-room" style={{ maxWidth: 460, padding: 26 }}>
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>Open a room</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Bring other people into this conversation. You send them a link;
            they join in a browser with no account. Everyone who joins can hear
            the conversation — you decide who appears in the video.
          </p>
          <div className="field">
            <label htmlFor="hostName">What should people call you?</label>
            <input
              id="hostName" value={name} data-testid="host-name"
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void open(); }}
            />
          </div>
          {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
          <button className="primary" data-testid="open-room-go" disabled={busy}
                  onClick={() => void open()}>
            {busy ? 'Opening…' : 'Open the room'}
          </button>
        </div>
      </div>
    </div>
  );
}
