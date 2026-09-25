'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { mayPublish } from '../../../src/domain/performance.js';
import { clipCandidates } from '../../../src/domain/performanceClips.js';
import { formatMasterPosition } from '../../../src/domain/time.js';

/**
 * The short one, and the picture the link arrives with.
 * [Doctrine STUDIO-TWO §14, §15, U-22, U-30, INV-15]
 *
 * "The product proposes the strongest candidates but never auto-publishes."
 * So every candidate here carries its reasons and the one whose boundaries
 * the PRODUCT chose says so — an author is entitled to disagree with a
 * ranking, and cannot if they are not told what it was.
 */

interface ClipJob {
  id: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  progress?: number;
  error?: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
}

export default function PublishPanel({
  performance, onChanged,
}: {
  performance: Performance;
  onChanged: (next: Performance) => void;
}) {
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [cardJobs, setCardJobs] = useState<ClipJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const id = performance.id;
  const candidates = clipCandidates(performance);
  const publishable = mayPublish(performance.master);

  const refresh = useCallback(async () => {
    const [clips, card] = await Promise.all([
      fetch(`/api/performances/${id}/clips`, { cache: 'no-store' }),
      fetch(`/api/performances/${id}/card`, { cache: 'no-store' }),
    ]);
    if (clips.ok) setJobs((await clips.json()).jobs ?? []);
    if (card.ok) setCardJobs((await card.json()).jobs ?? []);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const working = [...jobs, ...cardJobs]
    .some((job) => job.state === 'pending' || job.state === 'running');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const published = Boolean(performance.publication
    && !performance.publication.unpublishedAt);

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}/publish`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'that did not work');
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** The document, after something changed on it elsewhere. */
  const reload = useCallback(async () => {
    const response = await fetch(`/api/performances/${id}`, { cache: 'no-store' });
    if (response.ok) onChanged((await response.json()).performance);
  }, [id, onChanged]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      await Promise.all([refresh(), reload()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginTop: 18 }} data-testid="publish">
      <h2 style={{ fontSize: 14, margin: '0 0 7px' }}
          title={'A clip is the same video with a window on it \u2014 the same '
            + 'arrangement, the same backgrounds, the same sound \u2014 cut '
            + 'vertical for the places people watch one.'}>
        Share it
      </h2>

      {candidates.length === 0 ? (
        <p className="small muted" data-testid="no-clips">
          Name a section on the timeline and it becomes something you can clip.
        </p>
      ) : (
        candidates.map((candidate) => (
          <div key={candidate.id} className="panel" data-testid="clip-candidate"
               data-candidate={candidate.id}
               data-suggested={candidate.suggested ? 'true' : 'false'}
               style={{ padding: 9, marginBottom: 7 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <span className="grow" style={{ fontWeight: 600, minWidth: 0 }}>
                {candidate.label}
              </span>
              <span className="small muted" style={{ flex: '0 0 auto' }}>
                {formatMasterPosition(candidate.toSample - candidate.fromSample)}
              </span>
              <button
                className="small" data-testid="render-clip" disabled={busy}
                onClick={() => void post('/clips', {
                  fromSample: candidate.fromSample,
                  toSample: candidate.toSample,
                  exportProfileId: 'vertical_9x16',
                  allowUnpublishable: !publishable,
                })}
              >
                Make a vertical clip
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 3, fontSize: 11 }}>
              {/* The ranking, said out loud so it can be disagreed with. */}
              {candidate.reasons.join(' · ')}
            </div>
          </div>
        ))
      )}

      {jobs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {jobs.map((job) => (
            <div key={job.id} className="row" data-testid="clip-row" data-state={job.state}
                 style={{ gap: 8, marginTop: 4 }}>
              <span className="small muted grow">
                {formatMasterPosition(Number(job.payload?.['fromSample'] ?? 0))}
                {' · '}
                {job.state === 'done' ? 'ready'
                  : job.state === 'failed' ? (job.error ?? 'failed')
                    : `${job.progress ?? 0}%`}
              </span>
              {job.state === 'done' && job.result?.['planHash'] ? (
                <a className="small" data-testid="clip-download"
                   href={`/api/performances/${id}/clips/${job.result['planHash']}/file`}
                   download>Download</a>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* ---- the picture a link arrives with (U-30) ------------------- */}
      <div style={{ marginTop: 14 }}>
        <button className="small" data-testid="render-card"
                disabled={busy || !publishable}
                onClick={() => void post('/card')}>
          Make the link preview
        </button>
        {!publishable && (
          <span className="small muted" data-testid="card-refused"
                style={{ marginLeft: 8 }}>
            {/* INV-15: a card is made to be posted. */}
            Not for music that is somebody else’s.
          </span>
        )}
        {cardJobs.some((job) => job.state === 'done') && (
          <div style={{ marginTop: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="card-image"
              src={`/api/performances/${id}/card?image=1`}
              alt="The link preview for this performance"
              style={{ width: 360, borderRadius: 8, border: '1px solid var(--line)' }}
            />
          </div>
        )}
      </div>

      {/* ---- an audience (§14, U-31, INV-15) -------------------------- */}
      <div className="panel" data-testid="publication" style={{ padding: 12, marginTop: 16 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {published ? (
            <>
              <a className="small" data-testid="watch-link"
                 href={`/p/${id}/watch`} target="_blank" rel="noreferrer">
                Open the page people see
              </a>
              <button className="small" data-testid="unpublish" disabled={busy}
                      onClick={() => void withdraw()}>
                Withdraw it
              </button>
            </>
          ) : (
            <button className="primary" data-testid="publish"
                    disabled={busy || !publishable}
                    onClick={() => void post('/publish')}>
              Publish it
            </button>
          )}
        </div>
        <p className="small muted" data-testid="publication-state"
           style={{ marginTop: 6, marginBottom: 0, maxWidth: 640 }}>
          {published
            ? 'Anyone with the link can watch this. Withdrawing stops the link '
              + 'working; the video stays here.'
            : publishable
              ? 'Publishing puts the master video on a page anyone with the link '
                + 'can watch. Nobody can answer it — this is a performance, not '
                + 'an argument.'
              /* INV-15, at the act it exists for. */
              : 'This music is somebody else’s, so there is no page to give it. '
                + 'A private export is still yours.'}
        </p>
      </div>

      {error && (
        <p className="small" data-testid="publish-error"
           style={{ color: 'var(--bad)', marginTop: 8 }}>{error}</p>
      )}
    </section>
  );
}
