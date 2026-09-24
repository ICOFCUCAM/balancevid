'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';

interface CardWords { title: string; description: string; image: { alt: string } }

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
          <SharePreview conversationId={conversationId} />
          <div className="row">
            <a className="btn small" href={`/c/${conversationId}/watch`} target="_blank" rel="noreferrer">
              Open it
            </a>
            <button className="small" data-testid="copy-share-link" disabled={busy}
                    onClick={() => { void navigator.clipboard?.writeText(
                      `${window.location.origin}/c/${conversationId}/watch`); }}>
              Copy link
            </button>
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

/**
 * What this link will look like when somebody sends it.  [Doctrine U-31, §52]
 *
 * Shown for the same reason a print proof is shown: the author is about to put
 * this in front of people, and until now the one artefact more people would
 * see than the video itself was the one thing they could not look at.
 *
 * Laid out the way a chat window lays a preview out — picture, then title,
 * then the line under it — so what they are looking at is the thing, not a
 * description of the thing.
 */
function SharePreview({ conversationId }: { conversationId: string }) {
  const [card, setCard] = useState<CardWords | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [gone, setGone] = useState(false);

  const look = useCallback(async () => {
    const response = await fetch(
      `/api/conversations/${conversationId}/representations?id=share-card.json`,
      { cache: 'no-store' },
    ).catch(() => null);
    if (response?.ok) setCard(await response.json() as CardWords);
    const picture = await fetch(`/api/conversations/${conversationId}/card`,
      { cache: 'no-store', method: 'HEAD' }).catch(() => null);
    setDrawn(Boolean(picture?.ok));
    return Boolean(picture?.ok);
  }, [conversationId]);

  /*
   * The picture is drawn by the worker a moment after publishing, so the
   * first look usually misses it. Looking once and giving up is the mistake
   * that made response stills disappear for good; this keeps asking, slowly,
   * and stops when it has it.
   */
  useEffect(() => {
    let stopped = false;
    let tries = 0;
    const again = async () => {
      if (stopped) return;
      const found = await look();
      tries += 1;
      if (!found && tries < 12) window.setTimeout(() => { void again(); }, 2000);
      else if (!found) setGone(true);
    };
    void again();
    return () => { stopped = true; };
  }, [look]);

  if (!card) return null;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <div data-testid="share-preview" style={{ margin: '10px 0' }}>
      <div className="small muted" style={{ textTransform: 'uppercase',
        letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
        When you send this link
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 8,
        overflow: 'hidden', background: 'var(--panel-2)' }}>
        {drawn ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/conversations/${conversationId}/card`}
            alt={card.image.alt}
            data-testid="share-preview-image"
            style={{ display: 'block', width: '100%', aspectRatio: '1200 / 630' }}
          />
        ) : (
          <div className="small muted" style={{ display: 'grid', placeItems: 'center',
            aspectRatio: '1200 / 630', textAlign: 'center', padding: 12 }}>
            {gone
              ? 'The picture could not be drawn. The link still carries its title.'
              : 'Drawing the picture…'}
          </div>
        )}
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{card.title}</div>
          <div className="small muted" style={{ marginTop: 2 }}>{card.description}</div>
          <div className="small muted" style={{ marginTop: 4, fontSize: 11 }}>
            {origin.replace(/^https?:\/\//, '')}
          </div>
        </div>
      </div>
    </div>
  );
}
