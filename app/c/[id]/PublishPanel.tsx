'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';

export default function PublishPanel({
  conversationId, conversation, hasRender, onChanged,
}: {
  conversationId: string;
  conversation: any;
  hasRender: boolean;
  onChanged: () => Promise<void>;
}) {
  const [respondable, setRespondable] = useState(true);
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publication = conversation?.publication;
  const live = publication && !publication.unpublishedAt;

  const act = async (init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/publish`, init);
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'could not publish');
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <strong>Publish</strong>
      {live ? (
        <>
          <p className="small muted" style={{ marginTop: 2 }}>
            Published {publication.publishedAt?.slice(0, 10)}
            {publication.author ? ` as ${publication.author}` : ''} ·{' '}
            {publication.respondable
              ? 'anyone may respond to it'
              : 'responses are not allowed'}
          </p>
          <div className="row">
            <a className="btn small" href={`/c/${conversationId}/watch`} target="_blank" rel="noreferrer">
              Open it
            </a>
            <button className="small" disabled={busy}
                    onClick={() => void act({ method: 'DELETE' })}>
              Withdraw
            </button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Withdrawing stops new responses. Responses already made are left
            alone — they answered a version that existed.
          </p>
        </>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 2 }}>
            A published conversation can itself be answered. That is how a
            response becomes an exchange.
          </p>
          <div className="field">
            <label htmlFor="pub-author">Publish as</label>
            <input id="pub-author" value={author} placeholder="Your name"
                   onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <label className="row small" style={{ gap: 8, marginBottom: 8 }}>
            <input type="checkbox" checked={respondable} style={{ width: 'auto' }}
                   onChange={(e) => setRespondable(e.target.checked)} />
            <span>Allow anyone to respond to this</span>
          </label>
          {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
          <button
            className="primary"
            disabled={busy || !hasRender}
            onClick={() => void act({
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ respondable, author }),
            })}
          >
            {publication?.unpublishedAt ? 'Publish again' : 'Publish'}
          </button>
          {!hasRender && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              Render the conversation first — what gets published is a finished
              video, not a draft that could change under whoever answers it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
