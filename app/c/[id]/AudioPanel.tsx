'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ListeningCost } from '../../../src/domain/audioExport.js';

/**
 * The conversation, to listen to.  [Doctrine U-22, D-16, INV-00]
 *
 * "Not everything should become video." A lot of listening happens where
 * watching cannot, and a conversation is mostly people talking.
 *
 * WHAT IT IS NOT is a second edit. The audio is taken from a finished render,
 * so the cuts are the cuts and the mix is the mix; only the mastering changes,
 * to where spoken word is mastered rather than where video is.
 *
 * AND THE COST IS SAID BEFORE IT IS PAID. A response that circles a road on a
 * map does not survive being heard: the words are there and the subject is
 * not. The number comes from the document — how many responses mark the frame
 * or show a document — so it is a measurement rather than a caution.
 */

interface AudioJob {
  id: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  progress?: number;
  error?: string | null;
  result?: { planHash?: string; chapters?: number } | null;
}

export default function AudioPanel({
  conversationId, hasRender,
}: {
  conversationId: string;
  hasRender: boolean;
}) {
  const [jobs, setJobs] = useState<AudioJob[]>([]);
  const [listening, setListening] = useState<ListeningCost | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/audio`,
      { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setJobs(data.jobs ?? []);
    setListening(data.listening ?? null);
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
      const response = await fetch(`/api/conversations/${conversationId}/audio`, {
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

  const done = jobs.find((job) => job.state === 'done');

  return (
    <section style={{ marginTop: 22 }} data-testid="audio-panel">
      <h3 style={{ fontSize: 16, marginBottom: 2 }}>Listen to it</h3>
      <p className="small muted" style={{ marginTop: 0, maxWidth: 640 }}>
        The same conversation as an audio file, with a chapter at every moment
        you interrupted. Taken from the video rather than assembled again, so
        the cuts are the cuts.
      </p>

      {listening?.note && (
        <p className="small" data-testid="listening-cost"
           style={{ color: 'var(--warn)', maxWidth: 640 }}>
          {listening.note}
        </p>
      )}

      <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 8 }}>
        <button className="small" data-testid="make-audio"
                disabled={busy || working || !hasRender}
                onClick={() => void make()}>
          {working ? 'Taking the audio…' : done ? 'Take it again' : 'Make an audio file'}
        </button>
        {!hasRender && (
          <span className="small muted">
            {/* The audio is a derivation, so it needs something to derive. */}
            Render the conversation first.
          </span>
        )}
        {done?.result?.planHash && (
          <a className="small" data-testid="audio-download"
             href={`/api/conversations/${conversationId}/renders/${done.result.planHash}/file?kind=mp3`}
             download>
            Download the audio
            {typeof done.result.chapters === 'number' && done.result.chapters > 0
              ? ` · ${done.result.chapters} chapters` : ''}
          </a>
        )}
      </div>

      {jobs.some((job) => job.state === 'failed') && (
        <p className="small" style={{ color: 'var(--bad)' }}>
          {jobs.find((job) => job.state === 'failed')?.error ?? 'that did not work'}
        </p>
      )}
      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
    </section>
  );
}
