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

import { useCallback, useRef, useState } from 'react';
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
                    src={`/api/conversations/${conversationId}/takes/${take.id}/media`}
                    controls
                    preload="metadata"
                    style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                  />
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
