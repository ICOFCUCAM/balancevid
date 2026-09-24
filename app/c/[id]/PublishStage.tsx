'use client';

import { useCallback, useEffect, useState } from 'react';
import { EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import { formatTimecode } from '../../../src/domain/time.js';
import { forCreator } from '../../../src/web/language.js';
import CompositionStage from './CompositionStage.js';
import PublishPanel from './PublishPanel.js';
import BundlePanel from './BundlePanel.js';

/**
 * How the conversation becomes public.  [Doctrine INV-00, U-22, U-30, D-16]
 *
 * The third stage, after Live and Studio. Live is where the conversation
 * happens; Studio is where it is composed; this is where it is turned into
 * the forms in which it travels.
 *
 * Every one of them is a REPRESENTATION of the same Conversation, and none of
 * them is a second copy of it (INV-00). A 9:16 clip is the same composition
 * reframed, not a separate edit. The article is the same claims and responses
 * as prose. Change the conversation and every one of these changes with it,
 * because each is regenerated rather than stored.
 *
 * That is why the formats sit beside the article, the captions and the
 * manifest rather than in an "export" drawer: they are the same kind of
 * thing.
 */

/**
 * The four shapes, in the order a person decides between them.
 *
 * The master first, because it is the conversation; the social formats after,
 * because they are excerpts of it. Each names what it is for rather than its
 * dimensions — nobody thinks in 1080×1350.
 */
export const PUBLICATION_FORMATS = [
  { profileId: 'youtube_16x9', ratio: '16:9', name: 'Master',
    detail: 'YouTube, a website, a presentation', master: true },
  { profileId: 'vertical_9x16', ratio: '9:16', name: 'Vertical',
    detail: 'Shorts, Reels, TikTok' },
  { profileId: 'portrait_4x5', ratio: '4:5', name: 'Portrait',
    detail: 'A social feed' },
  { profileId: 'square_1x1', ratio: '1:1', name: 'Square',
    detail: 'LinkedIn, an embedded post' },
] as const;

export default function PublishStage({
  conversationId, conversation, snapshot, refresh, embedded,
}: {
  conversationId: string;
  conversation: any;
  snapshot: any;
  refresh: () => Promise<void>;
  embedded: boolean;
}) {
  const [format, setFormat] = useState<string>('youtube_16x9');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [clipJobs, setClipJobs] = useState<any[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const interventions: any[] = [...(conversation?.interventions ?? [])]
    .sort((a, b) => a.anchor.tSourceFrame - b.anchor.tSourceFrame);
  /* Something to preview with: the first response that has been assembled. */
  const preview = interventions.find((iv) => (iv.takes ?? [])
    .some((t: any) => t.id === iv.selectedTakeId && t.durationFrames > 0)) ?? interventions[0];

  const jobs: any[] = snapshot?.jobs ?? [];

  const loadClips = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/clips`,
      { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setCandidates(data.candidates ?? []);
    setClipJobs(data.jobs ?? []);
  }, [conversationId]);

  useEffect(() => { void loadClips(); }, [loadClips]);

  const clipsWorking = clipJobs.some((j) => j.state === 'pending' || j.state === 'running');
  useEffect(() => {
    if (!clipsWorking) return;
    const timer = setInterval(() => { void loadClips(); }, 1500);
    return () => clearInterval(timer);
  }, [clipsWorking, loadClips]);

  const render = async (profileId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/renders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: embedded ? 'reel' : 'full', exportProfileId: profileId }),
      });
      const data = await response.json().catch(() => ({}));
      // The rule keeps its code for the log; the person gets a sentence.
      if (!response.ok) throw new Error(forCreator(data.code, data.error ?? 'could not start it'));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const makeClips = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const interventionId of chosen) {
        await fetch(`/api/conversations/${conversationId}/clips`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ interventionId }),
        });
      }
      setChosen(new Set());
      await loadClips();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setChosen((was) => {
    const next = new Set(was);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="shell-body" style={{ overflowY: 'auto', padding: '18px 24px 40px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {error && (
          <div className="panel" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* ---- the shapes it travels in --------------------------------- */}
        <h2 style={{ fontSize: 20, marginBottom: 2 }}>How this conversation travels</h2>
        <p className="small muted" style={{ marginTop: 0, maxWidth: 620 }}>
          One conversation, composed once. Each of these is the same exchange
          in a different shape — not a separate edit, so changing the
          conversation changes all of them.
        </p>

        {embedded ? (
          <div className="panel" data-testid="publish-embedded" style={{ lineHeight: 1.45 }}>
            <strong>This video plays on its own platform</strong>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              We never hold its picture, so there is no single file to cut. What
              publishes is a player that runs the original and cuts to you at
              each of your moments — and your own recordings, which can be
              exported on their own.
            </p>
          </div>
        ) : (
          <div data-testid="publish-formats" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 14, marginTop: 14,
          }}>
            {PUBLICATION_FORMATS.map((entry) => {
              const profile = EXPORT_PROFILES[entry.profileId]!;
              const active = format === entry.profileId;
              return (
                <button
                  key={entry.profileId}
                  data-testid="publish-format"
                  data-profile={entry.profileId}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => setFormat(entry.profileId)}
                  style={{
                    textAlign: 'left', padding: 12, borderRadius: 10,
                    background: active ? 'rgba(43,95,138,0.26)' : 'var(--panel)',
                    border: `1px solid ${active ? '#6fb3e0' : 'var(--line)'}`,
                  }}
                >
                  <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'nowrap' }}>
                    <strong className="grow" style={{ fontSize: 14 }}>{entry.name}</strong>
                    <span className="mono small muted">{entry.ratio}</span>
                  </div>

                  {/*
                    A real preview: the same layout the renderer will resolve
                    for this canvas, with the same crop. A picture of the 16:9
                    version squeezed into a tall box would be a picture of a
                    video nobody is going to get. [U-18, U-22 §3]
                  */}
                  <div style={{
                    display: 'grid', placeItems: 'center', height: 180,
                    background: '#0b0d10', borderRadius: 6, overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'relative', height: '100%',
                      aspectRatio: `${profile.width} / ${profile.height}`,
                      maxWidth: '100%',
                    }}>
                      {preview ? (
                        <CompositionStage
                          conversationId={conversationId}
                          intervention={preview}
                          profileId={entry.profileId}
                        />
                      ) : (
                        <div className="small muted" style={{
                          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                        }}>
                          no responses yet
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="small muted" style={{ marginTop: 6, fontSize: 11 }}>
                    {entry.detail}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!embedded && (
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <button className="primary" data-testid="publish-render"
                    disabled={busy} onClick={() => void render(format)}>
              {busy ? 'Starting…' : `Make the ${
                PUBLICATION_FORMATS.find((f) => f.profileId === format)!.name.toLowerCase()} video`}
            </button>
            <span className="small muted">
              Captions are generated from the transcript and travel with every format.
            </span>
          </div>
        )}

        <RenderList jobs={jobs} conversationId={conversationId} />

        {/* ---- the moments worth posting on their own -------------------- */}
        <section style={{ marginTop: 26 }} data-testid="publish-clips">
          <h3 style={{ fontSize: 16, marginBottom: 2 }}>Share clips</h3>
          <p className="small muted" style={{ marginTop: 0, maxWidth: 620 }}>
            A long conversation has no short form, but each exchange in it does:
            the statement, then your answer. Choose the ones worth posting —
            nothing is published for you.
          </p>

          {candidates.length === 0 && (
            <div className="panel small muted">
              Nothing to clip yet. Each response you record becomes one.
            </div>
          )}

          {candidates.map((candidate) => {
            const picked = chosen.has(candidate.interventionId);
            const made = clipJobs.find(
              (j) => j.payload?.interventionId === candidate.interventionId);
            return (
              <label
                key={candidate.interventionId}
                data-testid="clip-candidate"
                data-intervention-id={candidate.interventionId}
                className="panel"
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', padding: 10,
                  marginBottom: 8, cursor: 'pointer',
                  borderColor: picked ? '#6fb3e0' : 'var(--line)',
                }}
              >
                <input
                  type="checkbox" checked={picked}
                  data-testid="clip-choose"
                  onChange={() => toggle(candidate.interventionId)}
                  style={{ width: 'auto', marginTop: 3 }}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {candidate.claim
                      ? `“${candidate.claim.slice(0, 90)}${candidate.claim.length > 90 ? '…' : ''}”`
                      : `Your ${String(candidate.typeLabel).toLocaleLowerCase()} at ${
                        formatTimecode(candidate.tSourceFrame).slice(0, 8)}`}
                  </div>
                  <div className="small muted">
                    {formatTimecode(candidate.totalFrames).slice(3, 8)} ·{' '}
                    {String(candidate.typeLabel).toLocaleLowerCase()}
                    {candidate.tooLong && ' · longer than most feeds allow'}
                    {candidate.reasons?.length > 0 && ` · ${candidate.reasons[0]}`}
                  </div>
                </div>
                {made && (
                  <span className="small muted" data-testid="clip-state"
                        style={{ flex: '0 0 auto' }}>
                    {made.state === 'done' ? 'ready' : made.state}
                  </span>
                )}
              </label>
            );
          })}

          {candidates.length > 0 && (
            <button
              className="primary" data-testid="publish-make-clips"
              disabled={busy || chosen.size === 0}
              onClick={() => void makeClips()}
            >
              {chosen.size === 0 ? 'Choose clips to make'
                : `Make ${chosen.size} ${chosen.size === 1 ? 'clip' : 'clips'}`}
            </button>
          )}
        </section>

        {/* ---- the forms that are not video ------------------------------ */}
        <BundlePanel conversationId={conversationId} ready={interventions.length > 0} />
        <PublishPanel
          conversationId={conversationId}
          conversation={conversation}
          hasRender={jobs.some((j) =>
            (j.kind === 'render' || j.kind === 'render_reel') && j.state === 'done')}
          onChanged={refresh}
        />
      </div>
    </div>
  );
}

/** What has been made, and where to get it. */
function RenderList({ jobs, conversationId }: { jobs: any[]; conversationId: string }) {
  const renders = jobs.filter((j) => j.kind === 'render' || j.kind === 'render_reel');
  if (renders.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }} data-testid="publish-renders">
      {renders.map((job) => {
        const profile = EXPORT_PROFILES[String(job.payload?.exportProfileId ?? 'youtube_16x9')];
        const hash = job.result?.planHash;
        return (
          <div key={job.id} className="row small" style={{ gap: 10, padding: '5px 0' }}>
            <span className="grow">
              {profile?.label ?? 'Video'}
              {job.state !== 'done' && ` · ${job.state}`}
              {job.state === 'failed' && job.error && ` — ${String(job.error).slice(0, 80)}`}
            </span>
            {job.state === 'done' && hash && (
              <a className="btn small" data-testid="publish-download"
                 href={`/api/conversations/${conversationId}/renders/${hash}/file`}>
                Download
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
