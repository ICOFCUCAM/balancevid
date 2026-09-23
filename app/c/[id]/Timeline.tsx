'use client';

import { useRef, useState } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';

/**
 * The conversation timeline.
 *
 * This is the product's one genuinely new object, and it should not look like
 * a video editor's track list. A video editor shows clips; this shows an
 * exchange — where the source was interrupted, and by what.
 *
 * Two lanes, deliberately: the source runs unbroken along the top, because
 * from the source's point of view nothing was removed. Responses hang beneath
 * the moments they answer, because that is what they are. The eye should read
 * it as "here, and here, and here, I had something to say".
 *
 * Dragging a response moves WHEN IT ANSWERS, and that is the only kind of
 * reordering this product has. Order is derived from the anchor and never
 * stored (U-08), so there is no sequence to rearrange independently — a
 * response that could sit somewhere other than the moment it answers would
 * break the one thing the product promises. Moving it on the timeline and
 * moving it in the conversation are therefore the same act.
 */
export interface TimelineResponse {
  id: string;
  tSourceFrame: number;
  durationFrames: number;
  type: string;
  thumbnailUrl?: string;
  selected?: boolean;
}

export default function Timeline({
  durationFrames, currentFrame, responses, pendingClaim, onSeek, onSelect, onMove,
}: {
  /** Move a response to a different moment. Absent where editing is not offered. */
  onMove?: (id: string, frame: number) => void;
  durationFrames: number;
  currentFrame: number;
  responses: TimelineResponse[];
  /** A statement chosen but not yet answered. */
  pendingClaim?: { startFrame: number; anchorFrame: number } | null;
  onSeek: (frame: number) => void;
  onSelect?: (id: string) => void;
}) {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{ id: string; frame: number } | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, durationFrames);

  /** Where on the source clock a pointer at this x is. */
  const frameAtX = (clientX: number): number => {
    const box = laneRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    const ratio = (clientX - box.left) / box.width;
    return Math.round(Math.min(1, Math.max(0, ratio)) * span);
  };
  const at = (frame: number) => `${Math.min(100, Math.max(0, (frame / span) * 100))}%`;
  /**
   * Keep a response card on screen when it sits at either end.
   * A marker at 00:00 centred on its position is half off the page, and the
   * first thing anyone answers is often the opening sentence.
   */
  const card = (frame: number) => {
    const pct = (frame / span) * 100;
    if (pct < 3) return { left: '0%', transform: 'translateX(0)' };
    if (pct > 97) return { left: '100%', transform: 'translateX(-100%)' };
    return { left: `${pct}%`, transform: 'translateX(-50%)' };
  };

  return (
    <div data-testid="conversation-timeline" style={{ userSelect: 'none' }}>
      <div className="row small muted" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span>Conversation</span>
        <span className="mono">
          {responses.length} {responses.length === 1 ? 'response' : 'responses'}
        </span>
      </div>

      {/* The source lane. Clicking anywhere on it is a seek — the whole
          point of a timeline is that a position is a place you can go. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Source timeline"
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={currentFrame}
        ref={laneRef}
        data-testid="timeline-source"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          onSeek(Math.round(((e.clientX - box.left) / box.width) * span));
        }}
        onKeyDown={(e) => {
          // Keyboard reachable is not the same as keyboard usable (D-04).
          const step = e.shiftKey ? span / 20 : span / 100;
          if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentFrame - step));
          if (e.key === 'ArrowRight') onSeek(Math.min(span, currentFrame + step));
        }}
        style={{
          position: 'relative', height: 30, borderRadius: 6, cursor: 'pointer',
          background: 'linear-gradient(180deg, #1d2a36, #16202a)',
          border: '1px solid var(--line)',
        }}
      >
        {/* How much of the source has been watched. */}
        <div style={{
          position: 'absolute', inset: 0, width: at(currentFrame),
          background: 'rgba(120,170,220,0.18)', borderRadius: '6px 0 0 6px',
        }} />
        {/* Where each interruption happened. */}
        {responses.map((r) => (
          <div key={r.id} style={{
            position: 'absolute', left: at(r.tSourceFrame), top: -2, bottom: -2, width: 2,
            background: r.selected ? 'var(--user-accent, #6fb3e0)' : '#6fb3e0',
            opacity: r.selected ? 1 : 0.65,
          }} />
        ))}
        {/* The statement waiting for an answer, so the timeline says what
            the rest of the screen is saying. */}
        {pendingClaim && (
          <div data-testid="timeline-pending" style={{
            position: 'absolute', top: -3, bottom: -3,
            left: at(pendingClaim.startFrame),
            width: `calc(${at(pendingClaim.anchorFrame)} - ${at(pendingClaim.startFrame)})`,
            minWidth: 3,
            background: 'rgba(111,179,224,0.45)',
            border: '1px solid var(--source-accent, #6fb3e0)', borderRadius: 3,
          }} />
        )}
        {dragging && (
          <div data-testid="timeline-drop" style={{
            position: 'absolute', left: at(dragging.frame), top: -5, bottom: -5, width: 2,
            background: '#e0b24f', boxShadow: '0 0 8px rgba(224,178,79,0.8)',
          }} />
        )}
        <div data-testid="timeline-playhead" style={{
          position: 'absolute', left: at(currentFrame), top: -4, bottom: -4, width: 2,
          background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.6)',
        }} />
      </div>

      {/* The response lane. Each one hangs from the moment it answers. */}
      <div style={{ position: 'relative', height: responses.length ? 54 : 18, marginTop: 4 }}>
        {responses.map((r) => (
          <button
            key={r.id}
            data-testid="timeline-response"
            data-response-id={r.id}
            data-frame={r.tSourceFrame}
            title={onMove
              ? `${r.type} at ${formatTimecode(r.tSourceFrame)} — drag to move it`
              : `${r.type} at ${formatTimecode(r.tSourceFrame)}`}
            onClick={() => { onSelect?.(r.id); onSeek(r.tSourceFrame); }}
            onPointerDown={(e) => {
              if (!onMove) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging({ id: r.id, frame: r.tSourceFrame });
            }}
            onPointerMove={(e) => {
              if (!onMove || dragging?.id !== r.id) return;
              setDragging({ id: r.id, frame: frameAtX(e.clientX) });
            }}
            onPointerUp={(e) => {
              if (!onMove || dragging?.id !== r.id) return;
              e.currentTarget.releasePointerCapture(e.pointerId);
              const frame = dragging.frame;
              setDragging(null);
              if (frame !== r.tSourceFrame) onMove(r.id, frame);
            }}
            /*
             * Arrow keys move it too. A control that only works with a
             * pointer is one half the people cannot use, and this project
             * has already shipped that bug once with the trim sliders (D-04).
             */
            onKeyDown={(e) => {
              if (!onMove) return;
              const step = e.shiftKey ? Math.round(span / 50) : 30;
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onMove(r.id, Math.max(0, r.tSourceFrame - step));
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                onMove(r.id, Math.min(span, r.tSourceFrame + step));
              }
            }}
            style={{
              position: 'absolute', top: 0,
              ...card(dragging?.id === r.id ? dragging.frame : r.tSourceFrame),
              padding: 0, width: 62, background: 'transparent', border: 'none',
              cursor: onMove ? (dragging?.id === r.id ? 'grabbing' : 'grab') : 'pointer',
              touchAction: 'none',
              zIndex: dragging?.id === r.id ? 2 : 1,
            }}
          >
            {/* The line back to the moment, so the pairing is visible rather
                than inferred from horizontal position alone. */}
            <div style={{
              width: 2, height: 8, margin: '0 auto',
              background: r.selected ? '#6fb3e0' : 'rgba(111,179,224,0.5)',
            }} />
            <div style={{
              width: 62, height: 34, borderRadius: 5, overflow: 'hidden',
              border: `1px solid ${r.selected ? '#6fb3e0' : 'var(--line)'}`,
              background: '#0d1319',
              display: 'grid', placeItems: 'center',
            }}>
              {r.thumbnailUrl && !failed.has(r.id) ? (
                <img
                  alt="" src={r.thumbnailUrl} data-testid="timeline-poster"
                  // A still that is not there yet falls back to the duration
                  // rather than to a broken-image icon.
                  onError={() => setFailed((was) => new Set(was).add(r.id))}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span className="small muted" style={{ fontSize: 10 }}>
                  {formatTimecode(r.durationFrames).slice(3, 8)}
                </span>
              )}
            </div>
            {dragging?.id === r.id && (
              <div className="small mono" data-testid="timeline-drop-time" style={{
                marginTop: 2, color: '#e0b24f', fontSize: 10,
              }}>
                {formatTimecode(dragging.frame).slice(0, 8)}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
