'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { mayPublish } from '../../../src/domain/performance.js';

/**
 * A page to send people.  [Doctrine STUDIO-TWO §14, U-30, U-31, INV-15]
 *
 * The last act, and now the only thing in its own module. It used to share a
 * heading called "Share it" with the clip candidates and the render jobs —
 * three unrelated things in one container because they were built in the
 * same week — and it ended in a red sentence:
 *
 *     make the master video first — there is nothing to publish yet
 *
 * WHICH IS A STATE AND NOT AN ERROR. `--bad` is the colour this product uses
 * for something having gone wrong, and nothing has: a performance that has
 * not been mastered is the ordinary condition of every performance for most
 * of its life. It is a lamp that is not lit, so it is drawn as one.
 *
 * THE CARD IS THE PICTURE A LINK ARRIVES WITH (U-30), which is why it sits
 * here rather than with the versions: it is not something to watch, it is
 * what a stranger sees before they decide whether to.
 */

interface CardJob {
  id: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
}

export default function PublishPanel({
  performance, onChanged, cardJobs, masterReady, onRendered,
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
  cardJobs: CardJob[];
  masterReady: boolean;
  onRendered: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const id = performance.id;
  const publishable = mayPublish(performance.master);
  const published = Boolean(performance.publication
    && !performance.publication.unpublishedAt);
  const hasCard = cardJobs.some((job) => job.state === 'done');

  const reload = useCallback(async () => {
    const response = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
    if (response.ok) onChanged((await response.json()).performance);
  }, [id, onChanged]);

  const post = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      onRendered();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}/publish`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? 'that did not work');
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /*
   * WHY IT CANNOT BE PUBLISHED, IN THE ORDER THE AUTHOR CAN ACT ON. The
   * rights question is first because it is the one that cannot be fixed by
   * pressing another button, and a person told "make the master first" who
   * then makes it and is told "this music is somebody else's" has been sent
   * the long way round. [INV-15]
   */
  const why = !publishable
    ? 'This music is somebody else’s, so there is no page to give it. '
      + 'A private export is still yours.'
    : !masterReady
      ? 'There is no master video yet. Make one above and this becomes a page '
        + 'anyone with the link can watch.'
      : null;

  const state = published ? { cls: 'is-live', say: 'published' }
    : why ? { cls: 'is-off', say: 'not yet' }
      : { cls: 'is-armed', say: 'ready' };

  return (
    <section className="module" data-testid="publish-module"
             data-published={published ? 'true' : 'false'} style={{ marginTop: 12 }}>
      <header className="module-head">
        <span className="module-label">Publish</span>
        <span className="module-sub grow" style={{ minWidth: 0 }}>
          a page anyone with the link can watch
        </span>
        <span className={`state ${state.cls}`} data-testid="publish-state">
          {state.say}
        </span>
      </header>

      <div className="module-body is-padded" style={{
        display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap',
      }}>
        {/* ---- the picture a link arrives with (U-30) ----------------- */}
        <div style={{ flex: '0 0 auto', width: 300 }}>
          {hasCard ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              data-testid="card-image"
              src={`/api/performances/${id}/card?image=1`}
              alt="The link preview for this performance"
              style={{
                width: '100%', display: 'block',
                borderRadius: 'var(--radius-screen)',
                border: 'var(--border) solid var(--line)',
                background: 'var(--screen-bed)',
              }}
            />
          ) : (
            <div aria-hidden="true" style={{
              width: '100%', aspectRatio: '1200 / 630',
              borderRadius: 'var(--radius-screen)',
              border: 'var(--border) dashed var(--line)',
              background: 'var(--screen-bed)',
              display: 'grid', placeItems: 'center',
              fontSize: 'var(--text-2xs)', color: 'var(--text-faint)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>no preview yet</div>
          )}
          <button className="ctl sm" data-testid="render-card"
                  disabled={busy || !publishable}
                  title={publishable ? undefined
                    : 'a card is made to be posted, and this music is not yours'}
                  onClick={() => void post('/card')}
                  style={{ marginTop: 'var(--space-3)', width: '100%' }}>
            {hasCard ? 'Draw it again' : 'Make the link preview'}
          </button>
        </div>

        {/* ---- and the page itself ------------------------------------ */}
        <div className="grow" style={{
          minWidth: 220, display: 'flex', flexDirection: 'column',
          gap: 'var(--space-4)',
        }}>
          <p className="small muted" data-testid="publication-state"
             style={{ margin: 0, maxWidth: 520 }}>
            {published
              ? 'Anyone with the link can watch this. Withdrawing stops the link '
                + 'working; the video stays here.'
              : why
                ?? 'Publishing puts the master video on a page anyone with the '
                  + 'link can watch. Nobody can answer it — this is a '
                  + 'performance, not an argument.'}
          </p>
          <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {published ? (
              <>
                <a className="ctl sm" data-testid="watch-link"
                   href={`/p/${id}/watch`} target="_blank" rel="noreferrer">
                  Open the page people see
                </a>
                <button className="ctl sm" data-testid="unpublish" disabled={busy}
                        onClick={() => void withdraw()}>
                  Withdraw it
                </button>
              </>
            ) : (
              <button className="ctl is-key" data-testid="publish"
                      disabled={busy || Boolean(why)}
                      title={why ?? undefined}
                      onClick={() => void post('/publish')}>
                Publish it
              </button>
            )}
          </div>
          {error && (
            <p className="small" data-testid="publish-error"
               style={{ margin: 0, color: 'var(--bad)' }}>{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
