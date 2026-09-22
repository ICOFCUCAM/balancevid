'use client';

/**
 * Studio Mode.  [Doctrine §17, §26, §36, U-28]
 *
 * "Studio Mode is for the user who wants more. It is never the price of
 *  admission." A user can go from source to published video without ever
 * opening this. What they get here is refinement: trim, audition another take,
 * re-record, move a point, change how it looks, delete it.
 *
 * Every control writes to the Conversation and nothing else. The timeline, the
 * plan, the captions and the article are recomputed from it (INV-00), so there
 * is no second place for an edit to be applied — or forgotten.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { INTERVENTION_TYPES, type InterventionType } from '../../../src/domain/document.js';
import { LAYOUTS, TYPE_PRESENTATION } from '../../../src/domain/presentation.js';
import { HOUSE_FPS, formatTimecode } from '../../../src/domain/time.js';

interface Props {
  conversationId: string;
  snapshot: any;
  refresh: () => Promise<void>;
  onRerecord: (interventionId: string) => void;
  canRecord: boolean;
  onSeek: (frame: number) => void;
}

export default function StudioMode({
  conversationId, snapshot, refresh, onRerecord, canRecord, onSeek,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (path: string, init: RequestInit) => {
    setBusy(path);
    setError(null);
    try {
      const response = await fetch(path, {
        headers: { 'content-type': 'application/json' },
        ...init,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `request failed (${response.status})`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const conversation = snapshot?.conversation;
  const timeline = snapshot?.timeline;
  if (!conversation) return null;

  const interventions = [...(conversation.interventions ?? [])]
    .sort((a: any, b: any) => a.anchor.tSourceFrame - b.anchor.tSourceFrame);

  return (
    <div>
      {error && (
        <div className="panel" style={{ borderColor: 'var(--bad)', marginBottom: 12 }}>{error}</div>
      )}

      <TimelineBand timeline={timeline} onSeek={onSeek} />

      <ClipsPanel conversationId={conversationId} />

      {interventions.length === 0 && (
        <div className="panel muted">
          Nothing to refine yet. Record a response in Live mode first.
        </div>
      )}

      {interventions.map((intervention: any, index: number) => (
        <InterventionCard
          key={intervention.id}
          index={index + 1}
          conversationId={conversationId}
          intervention={intervention}
          sourceDurationFrames={conversation.source.durationFrames}
          busy={busy}
          canRecord={canRecord}
          onCall={call}
          onRerecord={onRerecord}
          onSeek={onSeek}
        />
      ))}
    </div>
  );
}

/**
 * The conversation timeline.  [Doctrine §18]
 *
 * Source and response are distinguished by fill and position, not colour
 * alone, so the band survives greyscale and colour-blindness (U-20).
 */
function TimelineBand({ timeline, onSeek }: { timeline: any; onSeek: (frame: number) => void }) {
  if (!timeline?.items?.length) return null;
  const total = timeline.totalOutputFrames || 1;

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <strong className="grow">Conversation timeline</strong>
        <span className="small muted mono">{formatTimecode(timeline.totalOutputFrames)}</span>
      </div>
      <div style={{ display: 'flex', height: 26, borderRadius: 4, overflow: 'hidden' }}>
        {timeline.items.map((item: any, i: number) => {
          const source = item.kind === 'source';
          return (
            <div
              key={i}
              title={source
                ? `Source ${formatTimecode(item.sourceInFrame)} → ${formatTimecode(item.sourceOutFrame)}`
                : `Your response · ${formatTimecode(item.durationFrames)}`}
              onClick={() => source && onSeek(item.sourceInFrame)}
              style={{
                width: `${(item.durationFrames / total) * 100}%`,
                cursor: source ? 'pointer' : 'default',
                background: source ? 'var(--source-accent)' : 'var(--user-accent)',
                // Responses are hatched as well as tinted.
                backgroundImage: source
                  ? 'none'
                  : 'repeating-linear-gradient(45deg, rgba(0,0,0,.25) 0 4px, transparent 4px 8px)',
                borderRight: '1px solid var(--bg)',
              }}
            />
          );
        })}
      </div>
      <div className="row small muted" style={{ marginTop: 6, gap: 14 }}>
        <span>▇ source</span>
        <span>▨ you</span>
        <span className="grow" />
        <span>{Math.round((timeline.sourceFrames / total) * 100)}% source material</span>
      </div>
    </div>
  );
}

function InterventionCard({
  index, conversationId, intervention, sourceDurationFrames,
  busy, canRecord, onCall, onRerecord, onSeek,
}: {
  index: number;
  conversationId: string;
  intervention: any;
  sourceDurationFrames: number;
  busy: string | null;
  canRecord: boolean;
  onCall: (path: string, init: RequestInit) => Promise<void>;
  onRerecord: (interventionId: string) => void;
  onSeek: (frame: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const base = `/api/conversations/${conversationId}/interventions/${intervention.id}`;
  const take = intervention.takes.find((t: any) => t.id === intervention.selectedTakeId)
    ?? intervention.takes[0];
  const ready = take && take.durationFrames > 0;
  const kept = ready ? take.mediaOutFrame - take.mediaInFrame : 0;
  const disabled = busy !== null;

  const patchTake = (body: Record<string, unknown>) =>
    onCall(`${base}/takes/${take.id}`, { method: 'PATCH', body: JSON.stringify(body) });

  return (
    <div className="panel" style={{ marginBottom: 10 }}>
      <div className="row">
        <span className="mono small" style={{ color: 'var(--source-accent)', minWidth: 96 }}>
          <button
            style={{ background: 'transparent', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer' }}
            onClick={() => onSeek(intervention.anchor.tSourceFrame)}
            title="Jump to this moment"
          >
            {formatTimecode(intervention.anchor.tSourceFrame)}
          </button>
        </span>
        <span className="small" style={{ color: 'var(--user-accent)', minWidth: 130 }}>
          {index}. {TYPE_PRESENTATION[intervention.type as InterventionType]?.lowerThird ?? intervention.type}
        </span>
        <span className="grow small muted" style={{ fontStyle: intervention.anchor.quote ? 'italic' : 'normal' }}>
          {intervention.anchor.quote ? `“${intervention.anchor.quote}”` : intervention.note ?? ''}
        </span>
        <span className="mono small muted">{ready ? formatTimecode(kept) : 'processing…'}</span>
        <button className="small" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button>
      </div>

      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
            <div>
              {ready ? (
                <>
                  <video
                    ref={videoRef}
                    controls
                    preload="metadata"
                    style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                  >
                    {/* The browser takes the first it can decode. [U-39] */}
                    <source
                      src={`/api/conversations/${conversationId}/takes/${take.id}/media`}
                      type="video/mp4"
                    />
                    <source
                      src={`/api/conversations/${conversationId}/takes/${take.id}/media?kind=proxy`}
                      type="video/webm"
                    />
                  </video>
                  <TrimControls
                    take={take}
                    disabled={disabled}
                    onPreview={(frame) => {
                      const video = videoRef.current;
                      if (video) video.currentTime = frame / HOUSE_FPS;
                    }}
                    onCommit={(range) => patchTake(range)}
                    onReset={() => patchTake({ reset: true })}
                  />
                </>
              ) : (
                <div className="small muted">This take is still being assembled.</div>
              )}
            </div>

            <div>
              <div className="field">
                <label htmlFor={`type-${intervention.id}`}>Type — drives layout and captions</label>
                <select
                  id={`type-${intervention.id}`}
                  value={intervention.type}
                  disabled={disabled}
                  onChange={(e) => onCall(base, {
                    method: 'PATCH', body: JSON.stringify({ type: e.target.value }),
                  })}
                >
                  {INTERVENTION_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_PRESENTATION[t].lowerThird}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor={`layout-${intervention.id}`}>Layout</label>
                <select
                  id={`layout-${intervention.id}`}
                  value={intervention.layoutId ?? ''}
                  disabled={disabled}
                  onChange={(e) => onCall(base, {
                    method: 'PATCH',
                    body: JSON.stringify({ layoutId: e.target.value === '' ? null : e.target.value }),
                  })}
                >
                  <option value="">
                    From the type ({LAYOUTS[TYPE_PRESENTATION[intervention.type as InterventionType].layoutId]?.label})
                  </option>
                  {Object.values(LAYOUTS).map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor={`anchor-${intervention.id}`}>
                  Interrupt at — moving this drops a quoted claim rather than mis-citing it
                </label>
                <input
                  id={`anchor-${intervention.id}`}
                  type="range"
                  min={0}
                  max={sourceDurationFrames}
                  defaultValue={intervention.anchor.tSourceFrame}
                  disabled={disabled}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  onPointerUp={(e) => onCall(base, {
                    method: 'PATCH',
                    body: JSON.stringify({ tSourceFrame: Number((e.target as HTMLInputElement).value) }),
                  })}
                  onKeyUp={(e) => onCall(base, {
                    method: 'PATCH',
                    body: JSON.stringify({ tSourceFrame: Number((e.target as HTMLInputElement).value) }),
                  })}
                />
              </div>

              <TakeList
                intervention={intervention}
                disabled={disabled}
                onSelect={(takeId) => onCall(`${base}/takes/${takeId}`, {
                  method: 'PATCH', body: JSON.stringify({ select: true }),
                })}
                onDelete={(takeId) => onCall(`${base}/takes/${takeId}`, { method: 'DELETE' })}
              />

              <EvidencePanel
                conversationId={conversationId}
                intervention={intervention}
                take={take}
                disabled={disabled}
                onCall={onCall}
              />

              <div className="row" style={{ marginTop: 10 }}>
                <button
                  disabled={disabled || !canRecord}
                  onClick={() => onRerecord(intervention.id)}
                  title={canRecord ? 'Record another take; this one is kept' : 'Arm the camera first'}
                >
                  🎙 Re-record
                </button>
                <button
                  className="danger"
                  disabled={disabled}
                  onClick={() => {
                    if (confirm('Delete this point? The recordings stay on disk.')) {
                      void onCall(base, { method: 'DELETE' });
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Trim controls.
 *
 * The full media is shown, including the pre-roll, so the words spoken before
 * the key press are visibly there to be recovered rather than quietly gone.
 * [U-04 §3]
 */
function TrimControls({
  take, disabled, onPreview, onCommit, onReset,
}: {
  take: any;
  disabled: boolean;
  onPreview: (frame: number) => void;
  onCommit: (range: { mediaInFrame?: number; mediaOutFrame?: number }) => void;
  onReset: () => void;
}) {
  const [inFrame, setIn] = useState(take.mediaInFrame);
  const [outFrame, setOut] = useState(take.mediaOutFrame);

  return (
    <div style={{ marginTop: 10 }}>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}>
        <span className="mono">in {formatTimecode(inFrame)}</span>
        <span className="mono">kept {formatTimecode(Math.max(0, outFrame - inFrame))}</span>
        <span className="mono">out {formatTimecode(outFrame)}</span>
      </div>
      {/*
        Committed on pointer-up, key-up AND blur. Committing on mouse-up alone
        would mean a slider adjusted with the arrow keys never saves, which
        makes the control unusable for keyboard users (D-04).
      */}
      <input
        type="range" min={0} max={take.durationFrames} value={inFrame} disabled={disabled}
        onChange={(e) => { const v = Number(e.target.value); setIn(v); onPreview(v); }}
        onPointerUp={() => onCommit({ mediaInFrame: inFrame })}
        onKeyUp={() => onCommit({ mediaInFrame: inFrame })}
        onBlur={() => onCommit({ mediaInFrame: inFrame })}
        aria-label="Trim start"
      />
      <input
        type="range" min={0} max={take.durationFrames} value={outFrame} disabled={disabled}
        onChange={(e) => { const v = Number(e.target.value); setOut(v); onPreview(v); }}
        onPointerUp={() => onCommit({ mediaOutFrame: outFrame })}
        onKeyUp={() => onCommit({ mediaOutFrame: outFrame })}
        onBlur={() => onCommit({ mediaOutFrame: outFrame })}
        aria-label="Trim end"
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button
          className="small"
          disabled={disabled}
          onClick={() => { setIn(0); setOut(take.durationFrames); onReset(); }}
          title="Restore the whole take, pre-roll included"
        >
          Restore full take
        </button>
        {take.prerollFrames > 0 && (
          <span className="small muted">
            {formatTimecode(take.prerollFrames)} captured before you pressed the key
          </span>
        )}
      </div>
    </div>
  );
}

function TakeList({
  intervention, disabled, onSelect, onDelete,
}: {
  intervention: any;
  disabled: boolean;
  onSelect: (takeId: string) => void;
  onDelete: (takeId: string) => void;
}) {
  if (intervention.takes.length <= 1) return null;
  return (
    <div className="field">
      <label>Takes — every attempt is kept</label>
      {intervention.takes.map((take: any, i: number) => (
        <div key={take.id} className="row small" style={{ gap: 8, padding: '3px 0' }}>
          <input
            type="radio"
            name={`take-${intervention.id}`}
            checked={intervention.selectedTakeId === take.id}
            disabled={disabled || take.durationFrames === 0}
            onChange={() => onSelect(take.id)}
            style={{ width: 'auto' }}
            aria-label={`Use take ${i + 1}`}
          />
          <span className="grow">
            Take {i + 1}
            {take.durationFrames === 0
              ? ' · processing'
              : ` · ${formatTimecode(take.mediaOutFrame - take.mediaInFrame)}`}
          </span>
          <button className="small" disabled={disabled} onClick={() => onDelete(take.id)}>
            remove
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Evidence.  [Doctrine §44, U-33]
 *
 * Attach a page or a file, say which part of it matters, and say when it is on
 * screen. The archive happens in the worker; until it succeeds the citation is
 * shown as unarchived rather than quietly presented as verified.
 */
function EvidencePanel({
  conversationId, intervention, take, disabled, onCall,
}: {
  conversationId: string;
  intervention: any;
  take: any;
  disabled: boolean;
  onCall: (path: string, init: RequestInit) => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const base = `/api/conversations/${conversationId}/interventions/${intervention.id}/evidence`;
  const evidence: any[] = intervention.evidence ?? [];

  const attachUrl = async () => {
    if (!url.trim()) return;
    await onCall(base, { method: 'POST', body: JSON.stringify({ url: url.trim() }) });
    setUrl('');
  };

  const attachFile = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', file.name);
    // No JSON content-type here: the browser must set the multipart boundary.
    await onCall(base, { method: 'POST', body: form, headers: {} });
  };

  return (
    <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <label>Evidence — archived when attached, so the citation still works later</label>

      {evidence.map((item) => (
        <EvidenceItem
          key={item.id}
          conversationId={conversationId}
          evidence={item}
          take={take}
          disabled={disabled}
          onCall={onCall}
          base={base}
        />
      ))}

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <input
          type="url"
          placeholder="https://… a page to archive"
          value={url}
          disabled={disabled}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void attachUrl(); } }}
          aria-label="Evidence URL"
        />
        <button className="small" disabled={disabled || !url.trim()} onClick={() => void attachUrl()}>
          Archive
        </button>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <input
          type="file"
          className="small"
          disabled={disabled}
          aria-label="Evidence file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void attachFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function EvidenceItem({
  conversationId, evidence, take, disabled, onCall, base,
}: {
  conversationId: string;
  evidence: any;
  take: any;
  disabled: boolean;
  onCall: (path: string, init: RequestInit) => Promise<void>;
  base: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const region = evidence.locator?.region;
  const patch = (body: Record<string, unknown>) =>
    onCall(`${base}/${evidence.id}`, { method: 'PATCH', body: JSON.stringify(body) });

  const status = evidence.archiveError
    ? { text: 'archive failed', colour: 'var(--bad)' }
    : evidence.archived
      ? { text: `archived ${evidence.retrievedAt?.slice(0, 10) ?? ''}`, colour: 'var(--ok)' }
      : { text: 'archiving…', colour: 'var(--muted)' };

  /** Drag a box over the capture. The numeric fields below are the same thing
   *  reachable from the keyboard (D-04). */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const host = boxRef.current;
    if (!host || disabled) return;
    const rect = host.getBoundingClientRect();
    const startX = (event.clientX - rect.left) / rect.width;
    const startY = (event.clientY - rect.top) / rect.height;

    const move = (e: PointerEvent) => {
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      host.dataset['draft'] = JSON.stringify({
        x: Math.min(startX, x), y: Math.min(startY, y),
        w: Math.abs(x - startX), h: Math.abs(y - startY),
      });
      host.style.setProperty('--dx', `${Math.min(startX, x) * 100}%`);
      host.style.setProperty('--dy', `${Math.min(startY, y) * 100}%`);
      host.style.setProperty('--dw', `${Math.abs(x - startX) * 100}%`);
      host.style.setProperty('--dh', `${Math.abs(y - startY) * 100}%`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const draft = host.dataset['draft'];
      if (draft) void patch({ region: JSON.parse(draft) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
      <div className="row small">
        <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {evidence.url
            ? <a href={evidence.url} target="_blank" rel="noreferrer nofollow">{evidence.title}</a>
            : evidence.title}
        </span>
        <span style={{ color: status.colour }}>{status.text}</span>
        <button className="small" onClick={() => setOpen(!open)} disabled={disabled}>
          {open ? 'Close' : 'Locate'}
        </button>
        <button
          className="small"
          disabled={disabled}
          onClick={() => onCall(`${base}/${evidence.id}`, { method: 'DELETE' })}
        >
          remove
        </button>
      </div>
      {evidence.archiveError && (
        <div className="small" style={{ color: 'var(--bad)' }}>{evidence.archiveError}</div>
      )}

      {open && (
        <div style={{ marginTop: 8 }}>
          {evidence.captureAssetId ? (
            <div
              ref={boxRef}
              onPointerDown={onPointerDown}
              style={{ position: 'relative', cursor: 'crosshair', lineHeight: 0 }}
            >
              <img
                src={`/api/conversations/${conversationId}/evidence/${evidence.id}/capture`}
                alt={`Archived capture of ${evidence.title}`}
                style={{ width: '100%', borderRadius: 4, border: '1px solid var(--line)' }}
              />
              {region && (
                <div style={{
                  position: 'absolute',
                  left: `${region.x * 100}%`, top: `${region.y * 100}%`,
                  width: `${region.w * 100}%`, height: `${region.h * 100}%`,
                  border: '2px solid var(--user-accent)',
                  background: 'rgba(194,121,79,.16)', pointerEvents: 'none',
                }} />
              )}
            </div>
          ) : (
            <div className="small muted">
              No visual capture for this format — it is cited but not shown on screen.
            </div>
          )}

          <div className="row small" style={{ gap: 6, marginTop: 8 }}>
            {(['x', 'y', 'w', 'h'] as const).map((key) => (
              <label key={key} style={{ flex: 1, margin: 0 }}>
                {key}
                <input
                  type="number" min={0} max={100} step={1}
                  value={Math.round(((region?.[key] ?? (key === 'w' || key === 'h' ? 1 : 0))) * 100)}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = {
                      x: region?.x ?? 0, y: region?.y ?? 0, w: region?.w ?? 1, h: region?.h ?? 1,
                      [key]: Number(e.target.value) / 100,
                    };
                    void patch({ region: next });
                  }}
                />
              </label>
            ))}
          </div>

          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor={`quote-${evidence.id}`}>The line you are citing</label>
            <input
              id={`quote-${evidence.id}`}
              defaultValue={evidence.locator?.quote ?? ''}
              disabled={disabled}
              onBlur={(e) => patch({ quote: e.target.value })}
            />
          </div>

          {take?.durationFrames > 0 && (
            <EvidenceWindow take={take} evidence={evidence} disabled={disabled} onPatch={patch} />
          )}
        </div>
      )}
    </div>
  );
}

/** When the document is on screen, within the response's own clock. [U-33 §3] */
function EvidenceWindow({
  take, evidence, disabled, onPatch,
}: {
  take: any;
  evidence: any;
  disabled: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [appear, setAppear] = useState(evidence.appearFrame ?? take.mediaInFrame);
  const [dismiss, setDismiss] = useState(evidence.dismissFrame ?? take.mediaOutFrame);
  const commit = () => onPatch({ appearFrame: appear, dismissFrame: dismiss });

  return (
    <div className="field">
      <label>
        On screen from {formatTimecode(appear)} to {formatTimecode(dismiss)} — it appears when you
        refer to it, not for the whole response
      </label>
      <input
        type="range" min={0} max={take.durationFrames} value={appear} disabled={disabled}
        onChange={(e) => setAppear(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        aria-label="Evidence appears"
      />
      <input
        type="range" min={0} max={take.durationFrames} value={dismiss} disabled={disabled}
        onChange={(e) => setDismiss(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        aria-label="Evidence dismisses"
      />
      <button
        className="small"
        disabled={disabled}
        onClick={() => onPatch({ appearFrame: null, dismissFrame: null })}
      >
        Show for the whole response
      </button>
    </div>
  );
}

/**
 * Vertical clips.  [Doctrine U-22, U-10 §2]
 *
 * "One conversation therefore yields: one long-form video, one article, and a
 *  dozen clips. The composition step is the distribution engine."
 *
 * The product proposes; it never publishes. Each candidate says why it was
 * ranked where it was, so a creator can disagree with the ranking instead of
 * being told what is good.
 */
function ClipsPanel({ conversationId }: { conversationId: string }) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/clips`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setCandidates(data.candidates ?? []);
    setJobs(data.jobs ?? []);
  }, [conversationId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const working = jobs.some((job) => job.state === 'pending' || job.state === 'running');
  useEffect(() => {
    if (!open || !working) return;
    const timer = setInterval(() => { void load(); }, 1500);
    return () => clearInterval(timer);
  }, [open, working, load]);

  const make = async (interventionId: string) => {
    setBusy(interventionId);
    try {
      await fetch(`/api/conversations/${conversationId}/clips`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ interventionId }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const jobFor = (interventionId: string) =>
    jobs.find((job) => job.payload?.interventionId === interventionId);

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="row">
        <strong className="grow">Clips</strong>
        <span className="small muted">
          Each point, on its own, vertical — the claim then your reply
        </span>
        <button className="small" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Show'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {candidates.length === 0 && (
            <div className="small muted">No response is finished enough to clip yet.</div>
          )}
          {candidates.map((candidate) => {
            const job = jobFor(candidate.interventionId);
            const done = job?.state === 'done' && job.result?.planHash;
            return (
              <div
                key={candidate.interventionId}
                className="row small"
                style={{ borderTop: '1px solid var(--line)', padding: '8px 0', gap: 10 }}
              >
                <span className="mono" style={{ color: 'var(--source-accent)', minWidth: 92 }}>
                  {formatTimecode(candidate.tSourceFrame)}
                </span>
                <span style={{ color: 'var(--user-accent)', minWidth: 118 }}>
                  {candidate.typeLabel}
                </span>
                <span className="grow" style={{ fontStyle: candidate.claim ? 'italic' : 'normal' }}>
                  {candidate.claim ? `“${candidate.claim}”` : 'no statement captured'}
                  <div className="muted" style={{ fontStyle: 'normal' }}>
                    {candidate.reasons.join(' · ')}
                  </div>
                </span>
                <span
                  className="mono muted"
                  style={{ color: candidate.tooLong ? 'var(--warn)' : undefined }}
                  title={candidate.tooLong ? 'Longer than these formats reward' : ''}
                >
                  {formatTimecode(candidate.totalFrames)}
                </span>
                {done ? (
                  <a
                    className="btn small"
                    href={`/api/conversations/${conversationId}/renders/${job.result.planHash}/file`}
                  >
                    Download
                  </a>
                ) : job && job.state !== 'failed' ? (
                  <span className="mono muted">{job.progress ?? 0}%</span>
                ) : (
                  <button
                    className="small"
                    disabled={busy !== null}
                    onClick={() => void make(candidate.interventionId)}
                  >
                    Make clip
                  </button>
                )}
                {job?.state === 'failed' && (
                  <span className="small" style={{ color: 'var(--bad)' }}>{job.error}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
