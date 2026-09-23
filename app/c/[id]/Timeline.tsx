'use client';

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
  durationFrames, currentFrame, responses, onSeek, onSelect,
}: {
  durationFrames: number;
  currentFrame: number;
  responses: TimelineResponse[];
  onSeek: (frame: number) => void;
  onSelect?: (id: string) => void;
}) {
  const span = Math.max(1, durationFrames);
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
            title={`${r.type} at ${formatTimecode(r.tSourceFrame)}`}
            onClick={() => { onSelect?.(r.id); onSeek(r.tSourceFrame); }}
            style={{
              position: 'absolute', top: 0, ...card(r.tSourceFrame), padding: 0, width: 62,
              background: 'transparent', border: 'none', cursor: 'pointer',
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
              {r.thumbnailUrl ? (
                <img alt="" src={r.thumbnailUrl}
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="small muted" style={{ fontSize: 10 }}>
                  {formatTimecode(r.durationFrames).slice(3, 8)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
