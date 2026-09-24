'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Performance } from '../../../src/domain/performance.js';
import { mayPublish, projectPerformance } from '../../../src/domain/performance.js';
import { EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import { formatMasterPosition } from '../../../src/domain/time.js';

/**
 * The master render.  [Doctrine STUDIO-TWO §2, §14, S-4, INV-15]
 *
 * "Never merge the individual takes into one irreversible video until the
 *  final master render."
 *
 * Everything before this point is reversible: a scene can be moved, a take
 * renamed, an environment changed, and the document still describes the same
 * performance. This is the one button that produces a file, and the file is a
 * PROJECTION of the document — delete it and press the button again and the
 * same bytes come back, because the plan is derived and the shots are cached
 * by content hash (U-16, INV-00).
 *
 * WHY IT SHOWS WHAT IS MISSING rather than a disabled button with no reason.
 * A render is refused for three knowable causes — the song is not covered, a
 * scene names the wrong number of takes for its arrangement, or the music is
 * not the author's to publish — and each of them is something they can act on.
 * A greyed-out control with a tooltip is how a tool teaches somebody to guess.
 */

/** §14's four shapes, in the order an author is likely to want them. */
const SHAPES = ['youtube_16x9', 'vertical_9x16', 'square_1x1', 'portrait_4x5'] as const;

interface RenderJob {
  id: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  progress?: number;
  error?: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
}

export default function MasterRender({ performance }: { performance: Performance }) {
  const [shape, setShape] = useState<string>('youtube_16x9');
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const id = performance.id;
  const timeline = projectPerformance(performance);
  const publishable = mayPublish(performance.master);
  const missing = timeline.gaps.reduce((sum, g) => sum + (g.toSample - g.fromSample), 0);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/performances/${id}/renders`, { cache: 'no-store' });
    if (response.ok) setJobs((await response.json()).jobs ?? []);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* While something is rendering, ask again. Rendering is minutes, not ms. */
  const working = jobs.some((j) => j.state === 'pending' || j.state === 'running');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const start = async (allowUnpublishable: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/performances/${id}/renders`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exportProfileId: shape, allowUnpublishable }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that render could not be planned');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const blocked = timeline.spans.length === 0 || timeline.gaps.length > 0;

  return (
    <section style={{ marginTop: 20 }} data-testid="master-render">
      <h2 style={{ fontSize: 15, marginBottom: 2 }}>Make the video</h2>
      <p className="small muted" style={{ marginTop: 0, maxWidth: 640 }}>
        Your takes stay separate files until you press this. Everything you have
        decided — which performance is on screen when, in what arrangement — is
        played out into one video here, and you can press it again after
        changing your mind without losing anything.
      </p>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {SHAPES.map((profileId) => (
          <button
            key={profileId}
            className="small"
            data-testid="export-shape"
            data-profile={profileId}
            data-chosen={shape === profileId ? 'true' : 'false'}
            onClick={() => setShape(profileId)}
            style={{
              padding: '5px 10px', fontSize: 12,
              background: shape === profileId ? 'rgba(43,95,138,0.30)' : undefined,
              borderColor: shape === profileId ? '#6fb3e0' : undefined,
            }}
          >
            {EXPORT_PROFILES[profileId]!.label}
          </button>
        ))}
      </div>

      {blocked ? (
        <p className="small" data-testid="render-blocked"
           style={{ marginTop: 10, maxWidth: 640, color: 'var(--warn)' }}>
          {timeline.spans.length === 0
            ? 'Nothing is on screen yet. Play the song and press a number to put '
              + 'a take on it.'
            : `${formatMasterPosition(missing)} of the song has nothing on screen. `
              + 'A video cannot have a hole in it, so cover the rest before '
              + 'rendering.'}
        </p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <button
            className="primary" data-testid="render-master" disabled={busy}
            onClick={() => void start(!publishable)}
          >
            {busy ? 'Planning…'
              : publishable ? 'Make the master video' : 'Export a private copy'}
          </button>
          {!publishable && (
            <p className="small muted" data-testid="private-only"
               style={{ marginTop: 6, maxWidth: 640 }}>
              {/* INV-15, said where the file is made rather than only where
                  the music was classified. */}
              This music is somebody else’s, so the video is yours to keep and
              not ours to publish. Mark it as yours, licensed or openly
              licensed above and this becomes a publishable master.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="small" data-testid="render-error"
           style={{ color: 'var(--bad)', marginTop: 8 }}>{error}</p>
      )}

      {jobs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {jobs.map((job) => {
            const profileId = String(job.payload?.['exportProfileId'] ?? 'youtube_16x9');
            const planHash = job.result?.['planHash'] as string | undefined;
            return (
              <div key={job.id} className="panel" data-testid="render-row"
                   data-state={job.state} style={{ padding: 9, marginBottom: 7 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span className="grow" style={{ minWidth: 0 }}>
                    {EXPORT_PROFILES[profileId]?.label ?? profileId}
                    {job.payload?.['allowUnpublishable']
                      ? <span className="small muted"> · private copy</span> : null}
                  </span>
                  <span className="small muted" style={{ flex: '0 0 auto' }}>
                    {job.state === 'done' ? 'ready'
                      : job.state === 'failed' ? 'failed'
                        : `${job.progress ?? 0}%`}
                  </span>
                </div>
                {job.state === 'done' && planHash && (
                  <a className="small" data-testid="render-download"
                     href={`/api/performances/${id}/renders/${planHash}/file`}
                     download style={{ display: 'inline-block', marginTop: 4 }}>
                    Download the video
                  </a>
                )}
                {job.state === 'failed' && (
                  <div className="small" style={{ color: 'var(--bad)', marginTop: 4 }}>
                    {job.error ?? 'the render failed'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
