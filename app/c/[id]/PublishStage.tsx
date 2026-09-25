'use client';

import { useCallback, useEffect, useState } from 'react';
import { CAPTION_STYLES, EXPORT_PROFILES } from '../../../src/domain/presentation.js';
import { HOUSE_FPS, formatTimecode } from '../../../src/domain/time.js';
import { MAX_HOOK_LENGTH } from '../../../src/domain/document.js';
import { forCreator } from '../../../src/web/language.js';
import CompositionStage from './CompositionStage.js';
import PublishPanel from './PublishPanel.js';
import BundlePanel from './BundlePanel.js';
import AudioPanel from './AudioPanel.js';
import CardsPanel from './CardsPanel.js';

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

        <CaptionLook
          conversationId={conversationId}
          chosen={conversation?.captionStyleId ?? null}
          onChanged={refresh}
        />

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
              <div
                key={candidate.interventionId}
                data-testid="clip-candidate"
                data-intervention-id={candidate.interventionId}
                className="panel"
                style={{
                  padding: 10, marginBottom: 8,
                  borderColor: picked ? '#6fb3e0' : 'var(--line)',
                }}
              >
                {/*
                  Only the checkbox and the title are the label. It used to
                  wrap the whole card, which was fine until the card had
                  controls in it — every click on the opening editor would
                  also have toggled whether the clip was being made.
                */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <label className="grow" style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    minWidth: 0, cursor: 'pointer', marginBottom: 0,
                  }}>
                    <input
                      type="checkbox" checked={picked}
                      data-testid="clip-choose"
                      onChange={() => toggle(candidate.interventionId)}
                      style={{ width: 'auto', marginTop: 3 }}
                    />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, display: 'block' }}>
                        {candidate.claim
                          ? `“${candidate.claim.slice(0, 90)}${candidate.claim.length > 90 ? '…' : ''}”`
                          : `Your ${String(candidate.typeLabel).toLocaleLowerCase()} at ${
                            formatTimecode(candidate.tSourceFrame).slice(0, 8)}`}
                      </span>
                      <span className="small muted">
                        {formatTimecode(candidate.totalFrames).slice(3, 8)} ·{' '}
                        {String(candidate.typeLabel).toLocaleLowerCase()}
                        {candidate.tooLong && ' · longer than most feeds allow'}
                        {candidate.reasons?.length > 0 && ` · ${candidate.reasons[0]}`}
                      </span>
                    </span>
                  </label>
                  {made && (
                    <span className="small muted" data-testid="clip-state"
                          style={{ flex: '0 0 auto' }}>
                      {made.state === 'done' ? 'ready' : made.state}
                    </span>
                  )}
                </div>
                <OpeningEditor
                  conversationId={conversationId}
                  candidate={candidate}
                  onChanged={loadClips}
                />
              </div>
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
        <CardsPanel conversationId={conversationId} />
        <AudioPanel
          conversationId={conversationId}
          hasRender={jobs.some((j) =>
            (j.kind === 'render' || j.kind === 'render_reel') && j.state === 'done')}
        />
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

/**
 * How this clip opens.  [Doctrine U-22 §2, INV-05]
 *
 * A vertical clip is decided in its first second, and until now the product
 * decided it. This is the author taking that back: what the clip opens on,
 * what it says, and how much runs before the cut.
 *
 * THE ONE THING THE INTERFACE MUST MAKE OBVIOUS is which of those two the
 * author is writing. The statement is the source's own sentence and appears in
 * quotation marks, because the clip plays it a moment later. A line of their
 * own is theirs, over somebody else's picture, and is never quoted — so the
 * control says so in words rather than leaving it to be discovered in the
 * export.
 */
function OpeningEditor({ conversationId, candidate, onChanged }: {
  conversationId: string;
  candidate: any;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = candidate.opening?.card;
  const mode: 'statement' | 'text' | 'none' = card
    ? (card.quoted ? 'statement' : 'text')
    : (candidate.opening?.chosen ? 'none' : 'statement');
  const [draft, setDraft] = useState<string>(mode === 'text' ? card.text : '');

  const save = async (opening: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/interventions/${candidate.interventionId}`,
        {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ opening }),
        },
      );
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'could not save that');
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /*
   * A SEPARATE AXIS FROM THE CARD. What is written over the opening and what
   * plays underneath it are two decisions, so they are two controls — and
   * both travel on every save, because the document stores one `opening` and
   * sending half of it would clear the other half. [U-22 §2]
   */
  const order: 'source_first' | 'response_first' =
    candidate.opening?.order ?? 'source_first';

  const lead = Math.round((candidate.opening?.leadInFrames ?? 0) / HOUSE_FPS);
  const chosenLead = !candidate.opening?.leadInChosen
    ? 'sentence'
    : ([0, 3, 6, 10].includes(lead) ? String(lead) : 'other');

  return (
    <div data-testid="clip-opening" data-mode={mode} style={{ marginTop: 8 }}>
      <button
        className="small" data-testid="clip-opening-toggle"
        onClick={() => setOpen(!open)}
        style={{ padding: '2px 8px', fontSize: 11 }}
      >
        {open ? 'Done' : 'Opening'}
      </button>
      <span className="small muted" style={{ marginLeft: 8, fontSize: 11 }}>
        {/* What it will do, said here so the panel need not be opened to know. */}
        {mode === 'statement' && card && 'opens on the statement'}
        {mode === 'statement' && !card && 'opens straight on the footage'}
        {mode === 'text' && `opens on “${String(card.text).slice(0, 40)}”, in your words`}
        {mode === 'none' && 'opens straight on the footage'}
        {lead > 0 && ` · ${lead}s of source first`}
      </span>

      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
          <div className="row" style={{ gap: 5, marginBottom: 8 }}>
            {([
              ['statement', 'The statement', 'Their words, in quotation marks'],
              ['text', 'A line of my own', 'Your words — never in quotation marks'],
              ['none', 'Nothing', 'Straight into the footage'],
            ] as const).map(([id, label, hint]) => (
              <button
                key={id}
                className="small"
                data-testid="opening-mode"
                data-choice={id}
                data-chosen={mode === id ? 'true' : 'false'}
                title={hint}
                disabled={busy}
                onClick={() => void save(
                  id === 'text'
                    ? { order, card: { kind: 'text', text: draft || 'Watch this' } }
                    : { order, card: { kind: id } },
                )}
                style={{
                  padding: '3px 9px', fontSize: 11,
                  background: mode === id ? 'rgba(43,95,138,0.30)' : undefined,
                  borderColor: mode === id ? '#6fb3e0' : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'text' && (
            <div className="field" style={{ marginBottom: 8 }}>
              <input
                data-testid="opening-text"
                value={draft}
                maxLength={MAX_HOOK_LENGTH}
                placeholder="What makes someone stop scrolling"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft !== card?.text) {
                    void save({ order, card: { kind: 'text', text: draft } });
                  }
                }}
              />
              <span className="small muted" style={{ fontSize: 11 }}>
                {/* Said plainly, because it is the difference between quoting
                    somebody and speaking over them. */}
                Shown without quotation marks — these are your words, not
                theirs. {MAX_HOOK_LENGTH - draft.length} left.
              </span>
            </div>
          )}

          <div className="row small" style={{ gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 11 }}>Start</span>
            <select
              data-testid="opening-lead-in"
              disabled={busy}
              value={chosenLead}
              /*
                The card always goes with it. Sending only the lead-in would
                clear the card the author had chosen — an opening is one
                decision as far as the document is concerned, and a control
                that quietly undoes the control next to it is the worst kind.
              */
              onChange={(e) => void save(e.target.value === 'sentence'
                ? { order, card: cardBody(mode, draft) }
                : {
                  order,
                  leadInFrames: Number(e.target.value) * HOUSE_FPS,
                  card: cardBody(mode, draft),
                })}
              style={{ width: 'auto', padding: '2px 6px', fontSize: 11 }}
            >
              <option value="sentence">at the sentence they were answering</option>
              <option value="0">at the cut</option>
              <option value="3">3 seconds before</option>
              <option value="6">6 seconds before</option>
              <option value="10">10 seconds before</option>
              {/* What the source could actually supply, when it is not one of
                  the offered numbers — a clip near the start of the video
                  cannot have ten seconds before it. */}
              {chosenLead === 'other' && (
                <option value="other">{lead} seconds before</option>
              )}
            </select>
          </div>

          <div className="row small" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 11 }}>Order</span>
            {([
              ['source_first', 'The moment, then my reply',
                'The order the argument happened in'],
              ['response_first', 'My reply, then the moment',
                'Opens on you talking; the clip shows what you are answering after'],
            ] as const).map(([id, label, hint]) => (
              <button
                key={id}
                className="small"
                data-testid="opening-order"
                data-choice={id}
                data-chosen={order === id ? 'true' : 'false'}
                title={hint}
                disabled={busy}
                onClick={() => void save({
                  order: id,
                  card: cardBody(mode, draft),
                  ...(chosenLead === 'sentence'
                    ? {} : { leadInFrames: lead * HOUSE_FPS }),
                })}
                style={{
                  padding: '3px 9px', fontSize: 11,
                  background: order === id ? 'rgba(43,95,138,0.30)' : undefined,
                  borderColor: order === id ? '#6fb3e0' : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="small muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
            {/* Said plainly, because the reason to choose it and the reason not
                to are both real, and the author is the one who should weigh
                them rather than the default. */}
            {order === 'response_first'
              ? 'Your clip opens on you. It reaches more people and asks them to '
                + 'trust you before they have seen what you are answering.'
              : 'Your clip opens on what you are answering, which is the order '
                + 'the argument happened in.'}
          </p>

          {error && (
            <p className="small" style={{ color: 'var(--bad)', marginBottom: 0 }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** The card as the API wants it, so a lead-in change does not drop it. */
function cardBody(mode: 'statement' | 'text' | 'none', draft: string) {
  if (mode === 'text') return { kind: 'text' as const, text: draft };
  return { kind: mode };
}

/**
 * How the captions look.  [Doctrine U-19 §2, D-04]
 *
 * A short list, not a styling panel. Captions are the accessible form of what
 * was said, so what is on offer here are looks that have each been checked
 * against the legibility floor — a size slider and a colour picker would be a
 * way to produce captions nobody can read, offered by the product that
 * insisted on having them.
 *
 * "Let the video decide" is the default and stays a real option, because the
 * right answer genuinely differs by shape: the bottom of a vertical frame is
 * where the app puts its own buttons, so captions there are covered.
 */
function CaptionLook({ conversationId, chosen, onChanged }: {
  conversationId: string;
  chosen: string | null;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (captionStyleId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ captionStyleId }),
      });
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'could not save that');
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="caption-look" style={{ marginTop: 18 }}>
      <div className="small muted" style={{ textTransform: 'uppercase',
        letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
        Caption look
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button
          className="small"
          data-testid="caption-style"
          data-style="auto"
          data-chosen={chosen === null ? 'true' : 'false'}
          disabled={busy}
          onClick={() => void choose(null)}
          style={{
            padding: '5px 10px', fontSize: 12,
            background: chosen === null ? 'rgba(43,95,138,0.30)' : undefined,
            borderColor: chosen === null ? '#6fb3e0' : undefined,
          }}
          title="A tall clip gets larger captions, raised clear of the app's own buttons"
        >
          Let the format decide
        </button>
        {Object.values(CAPTION_STYLES).map((style) => (
          <button
            key={style.id}
            className="small"
            data-testid="caption-style"
            data-style={style.id}
            data-chosen={chosen === style.id ? 'true' : 'false'}
            disabled={busy}
            onClick={() => void choose(style.id)}
            title={style.hint}
            style={{
              padding: '5px 10px', fontSize: 12,
              background: chosen === style.id ? 'rgba(43,95,138,0.30)' : undefined,
              borderColor: chosen === style.id ? '#6fb3e0' : undefined,
            }}
          >
            {style.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 6, marginBottom: 0, maxWidth: 620 }}>
        {chosen ? CAPTION_STYLES[chosen]?.hint : 'A tall clip gets larger captions, '
          + 'raised clear of where apps put their own buttons; a wide one keeps them low.'}
        {' '}Every look here stays above the size captions have to be to be read.
      </p>
      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
    </section>
  );
}
