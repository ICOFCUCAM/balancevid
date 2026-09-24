'use client';

import { useState } from 'react';
import RoomView, { type RoomState } from '../../c/[id]/room/RoomView.js';

/**
 * Joining a room from a link.  [Doctrine ROOM §6, §12]
 *
 * "They click it and enter the Conversation Room. They don't necessarily need
 *  a Prof Class account initially."
 *
 * So the entire membrane is: what should we call you. The link is the
 * credential; the name is what everyone else sees. Nothing is asked that
 * would turn joining a seminar into signing up for something.
 *
 * Camera and microphone are NOT requested here. A guest hears the
 * conversation from the moment they arrive and is only ever recorded once the
 * host brings them in — asking for a camera at the door would take a
 * permission most of a lecture audience never needs.
 */
export default function Join({
  conversationId, token,
}: { conversationId: string; token: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/room/join`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, displayName: name.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'could not join');
      setRoom(data.room as RoomState);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (room) return <RoomView conversationId={conversationId} host={false} initial={room} />;

  return (
    <div className="shell">
      <div className="shell-body" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="panel" data-testid="join-card" style={{ maxWidth: 420, padding: 28 }}>
          <div className="small muted" style={{ textTransform: 'uppercase',
            letterSpacing: 0.8, fontSize: 11 }}>
            You have been invited
          </div>
          <h1 style={{ fontSize: 24, margin: '4px 0 6px' }}>Join the conversation</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            You will be able to hear and see the conversation straight away.
            You only appear in the video if the host brings you in.
          </p>

          {!token && (
            <p className="small" data-testid="join-no-token" style={{ color: 'var(--bad)' }}>
              This link is missing its invitation. Ask whoever invited you for
              the full link.
            </p>
          )}

          <div className="field">
            <label htmlFor="displayName">What should people call you?</label>
            <input
              id="displayName" value={name} data-testid="join-name"
              placeholder="Your name" autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void join(); }}
            />
          </div>

          {error && (
            <p className="small" data-testid="join-error" style={{ color: 'var(--bad)' }}>
              {error}
            </p>
          )}

          <button
            className="primary" data-testid="join-go"
            disabled={busy || !token || !name.trim()}
            onClick={() => void join()}
          >
            {busy ? 'Joining…' : 'Enter the room'}
          </button>

          <p className="small muted" style={{ marginTop: 14, marginBottom: 0, lineHeight: 1.45 }}>
            No account needed. Your name is shown to the other people here.
          </p>
        </div>
      </div>
    </div>
  );
}
