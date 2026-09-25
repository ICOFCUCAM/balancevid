'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClaimCard } from '../../../src/publish/claimCard.js';

/**
 * A card per exchange, and the page that plays them.  [Doctrine U-30, D-16]
 *
 * "Every claim/response could produce a beautiful static card." This is that,
 * with one decision made on the author's behalf and stated here rather than
 * buried: the WORDS are shown before the pictures are drawn.
 *
 * That ordering is the point. A card carries a sentence from the source and a
 * sentence from a machine transcript of the author's own voice, and the second
 * of those can be wrong. Showing the text first means the author reads what
 * the card will say while it is still cheap to fix — by correcting the
 * transcript, which is where the correction belongs (D-16: edit the object,
 * not the shadow) — rather than discovering it in a post.
 */

interface CardJob {
  id: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  progress?: number;
  error?: string | null;
  result?: { cards?: number; drawn?: number } | null;
}

export default function CardsPanel({ conversationId }: { conversationId: string }) {
  const [cards, setCards] = useState<ClaimCard[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [jobs, setJobs] = useState<CardJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/cards`,
      { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setCards(data.cards ?? []);
    setDrawn(data.drawn ?? []);
    setJobs(data.jobs ?? []);
  }, [conversationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const working = jobs.some((job) => job.state === 'pending' || job.state === 'running');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/cards`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginTop: 22 }} data-testid="cards-panel">
      <h3 style={{ fontSize: 16, marginBottom: 2 }}>Share cards</h3>
      <p className="small muted" style={{ marginTop: 0, maxWidth: 640 }}>
        One card for each thing you answered: the claim, and what you said
        back. Made from the conversation, so nothing here is written twice.
      </p>

      {cards.length === 0 && (
        <p className="small muted">
          {/* Said plainly rather than shown as an empty grid. */}
          Record a response and there will be a card for it.
        </p>
      )}

      <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 8 }}>
        <button className="small" data-testid="make-cards"
                disabled={busy || working || cards.length === 0}
                onClick={() => void make()}>
          {working ? 'Drawing…'
            : drawn.length > 0 ? 'Draw them again'
              : `Make ${cards.length === 1 ? 'the card' : `${cards.length} cards`}`}
        </button>
        {drawn.length > 0 && (
          <span className="small muted" data-testid="cards-drawn">
            {drawn.length} of {cards.length} drawn
          </span>
        )}
      </div>

      {jobs.some((job) => job.state === 'failed') && (
        <p className="small" style={{ color: 'var(--bad)' }}>
          {jobs.find((job) => job.state === 'failed')?.error ?? 'that did not work'}
        </p>
      )}
      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}

      {cards.length > 0 && (
        <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {cards.map((card) => (
            <li key={card.interventionId} data-testid="card-row"
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '10px 0', borderTop: '1px solid var(--line)',
                }}>
              {drawn.includes(card.index) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/conversations/${conversationId}/cards/${card.index}`}
                     alt={card.alt} width={96} height={96}
                     style={{ borderRadius: 4, flex: '0 0 auto', background: 'var(--panel)' }} />
              ) : (
                <div style={{
                  width: 96, height: 96, borderRadius: 4, flex: '0 0 auto',
                  background: 'var(--panel)', border: '1px dashed var(--line)',
                }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div className="small" style={{ color: 'var(--muted)' }}>{card.eyebrow}</div>
                <div style={{ fontSize: 13, margin: '2px 0' }}>
                  {card.claim.quoted ? `“${card.claim.text}”` : card.claim.text}
                </div>
                <div className="small" style={{
                  color: card.response.kind === 'unheard' ? 'var(--muted)' : 'inherit',
                  fontStyle: card.response.kind === 'unheard' ? 'italic' : 'normal',
                }}>
                  <strong style={{ fontSize: 10, letterSpacing: '.08em' }}>
                    {card.label.toUpperCase()}
                  </strong>{' '}
                  {card.response.text}
                </div>
                {drawn.includes(card.index) && (
                  <a className="small" data-testid="card-download"
                     href={`/api/conversations/${conversationId}/cards/${card.index}`} download>
                    Download
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
