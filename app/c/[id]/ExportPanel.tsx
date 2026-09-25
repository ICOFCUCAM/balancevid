'use client';

import { useState } from 'react';
import { forCreator } from '../../../src/web/language.js';
import PublishPanel from './PublishPanel.js';
import BundlePanel from './BundlePanel.js';

/**
 * Finishing.
 *
 * One step, opened when the author is ready for it, rather than a column of
 * export machinery sitting beside them the whole time they are trying to
 * think and speak. Nothing here is needed until the conversation exists.
 */
export default function ExportPanel({
  conversationId, conversation, snapshot, refresh,
}: {
  conversationId: string;
  conversation: any;
  snapshot: any;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobs: any[] = snapshot?.jobs ?? [];
  const renderJob = jobs.find((j) => j.kind === 'render' || j.kind === 'render_reel');
  const done = renderJob?.state === 'done';
  const embedded = conversation?.source?.class === 'B';

  const render = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/renders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: embedded ? 'reel' : 'full' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // The rule keeps its code for the log; the person gets a sentence.
        throw new Error(forCreator(data.code, data.error ?? 'could not start the export'));
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="row">
        <div className="grow">
          <strong>Finish and publish</strong>
          <div className="small muted">
            {embedded
              ? 'This video stays on its own platform, so your responses publish '
                + 'alongside it as a player that drives the original.'
              : 'Your responses and the source, composed into one video.'}
          </div>
        </div>
        <button data-testid="toggle-export" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Open'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}

          <div className="row" style={{ marginBottom: 12 }}>
            <span className="grow small">
              {done ? 'Export ready.'
                : renderJob?.state === 'running' ? `Rendering… ${renderJob.progress ?? 0}%`
                  : renderJob?.state === 'failed' ? 'The last export did not finish.'
                    : 'Not exported yet.'}
            </span>
            <button className="primary" disabled={busy} onClick={() => void render()}
                    data-testid="start-export">
              {embedded ? 'Make the response reel' : 'Generate final video'}
            </button>
          </div>

          {done && renderJob?.result?.planHash && (
            <div className="row small" style={{ gap: 10, marginBottom: 12 }}>
              <a className="btn small"
                 href={`/api/conversations/${conversationId}/renders/${renderJob.result.planHash}/file`}>
                Download video
              </a>
              <a className="small"
                 href={`/api/conversations/${conversationId}/renders/${renderJob.result.planHash}/file?kind=srt`}>
                Captions (.srt)
              </a>
              <a className="small"
                 href={`/api/conversations/${conversationId}/renders/${renderJob.result.planHash}/file?kind=vtt`}>
                .vtt
              </a>
            </div>
          )}

          <BundlePanel conversationId={conversationId} ready={done} />

          <PublishPanel
            conversationId={conversationId}
            conversation={conversation}
            hasRender={Boolean(done || conversation?.publication)}
            onChanged={refresh}
          />

          <div className="row small" style={{ gap: 10, marginTop: 12 }}>
            <a className="btn small" href={`/c/${conversationId}/watch`} target="_blank" rel="noreferrer">
              Watch the conversation
            </a>
            <a className="btn small" href={`/c/${conversationId}/article`} target="_blank" rel="noreferrer">
              Read it as an article
            </a>
            {/* The same conversation to move around in: an index of the
                exchanges over the video, each one a seek. [D-16] */}
            <a className="btn small" data-testid="open-interactive"
               href={`/c/${conversationId}/explore`} target="_blank" rel="noreferrer">
              Explore the exchanges
            </a>
            {/* And the same conversation to stand up and deliver: the source
                stops where you interrupted it, and you say it yourself. */}
            <a className="btn small" data-testid="open-present"
               href={`/c/${conversationId}/present`} target="_blank" rel="noreferrer">
              Present it live
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
