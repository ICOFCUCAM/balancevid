'use client';

import { formatTimecode } from '../../../src/domain/time.js';

/**
 * What I said.  [Doctrine §40, U-08]
 *
 * The left rail of the Studio: every response the author has made, in the
 * order the conversation makes them — which is the order of the moments they
 * answer, because order is derived from the anchor and never stored (U-08).
 *
 * Each card is a thing, not a row in a list: the author's own face from the
 * take that will be published, how long they spoke for, the moment they were
 * answering, and whether a statement is bound to it. Choosing one makes that
 * response the active object, and the right rail changes to describe it.
 *
 * The mental model this rail belongs to:
 *
 *   LEFT    what I said
 *   CENTRE  how it looks
 *   RIGHT   how I want to express it
 *   BOTTOM  when it happens
 */
export interface ClipRailItem {
  id: string;
  index: number;
  tSourceFrame: number;
  durationFrames: number;
  /** The lower-third label — the kind of move this response is. [U-11] */
  label: string;
  accent: string;
  posterUrl?: string;
  /** The source sentence this answers, when one is bound. */
  quote?: string;
  /**
   * Where the recording has got to.
   *
   *   ready      assembled, with frames and a length
   *   preparing  the worker has it
   *   waiting    queued, and nothing has picked it up yet
   *   failed     it fell over, and says why
   *
   * "preparing" forever is the same screen as "failed", and the author has no
   * way to tell which they are looking at or anything to do about it (D-07).
   */
  state: 'ready' | 'preparing' | 'waiting' | 'failed';
  /** Why it failed, in whatever the job recorded. */
  error?: string;
  /** The job to try again. */
  jobId?: string;
}

export default function ClipRail({
  items, selectedId, onSelect, onAdd, onRetry, canAdd,
}: {
  items: ClipRailItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRetry: (jobId: string) => void;
  canAdd: boolean;
}) {
  return (
    <aside
      data-testid="clip-rail"
      className="shell-scroll"
      style={{ paddingRight: 4 }}
      aria-label="Your responses"
    >
      <div className="small muted" style={{
        textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, marginBottom: 8,
      }}>
        Your clips
      </div>

      {items.length === 0 && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Nothing yet. Press space while the video plays and answer it.
        </p>
      )}

      {items.map((item) => {
        const chosen = item.id === selectedId;
        return (
          <button
            key={item.id}
            data-testid="clip-card"
            data-clip-id={item.id}
            data-selected={chosen ? 'true' : 'false'}
            onClick={() => onSelect(item.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', marginBottom: 8,
              padding: 8, borderRadius: 8,
              background: chosen ? 'rgba(43,95,138,0.28)' : 'var(--panel)',
              border: `1px solid ${chosen ? '#6fb3e0' : 'var(--line)'}`,
            }}
          >
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '16 / 9',
              borderRadius: 5, overflow: 'hidden', background: '#0d1319',
              display: 'grid', placeItems: 'center', marginBottom: 6,
            }}>
              {item.posterUrl ? (
                <img alt="" src={item.posterUrl} data-testid="clip-poster"
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="small" style={{
                  fontSize: 10, textAlign: 'center', padding: '0 4px', lineHeight: 1.25,
                  color: item.state === 'failed' ? 'var(--bad)' : 'var(--muted)',
                }}>
                  {item.state === 'failed' ? 'did not save'
                    : item.state === 'waiting' ? 'waiting'
                    : 'preparing'}
                </span>
              )}
              {/* The kind of move, in its own colour, over its own frame. */}
              <span style={{
                position: 'absolute', left: 0, bottom: 0,
                padding: '2px 6px', fontSize: 9, letterSpacing: 0.6,
                background: item.accent, color: '#0e0f11', fontWeight: 700,
                borderTopRightRadius: 4,
              }}>
                {item.label}
              </span>
              {/* A statement is bound to this one. Not a badge that judges the
                  source — a mark that says this answer has a subject. */}
              {item.quote && (
                <span data-testid="clip-has-claim" title={item.quote} style={{
                  position: 'absolute', right: 5, top: 5,
                  width: 9, height: 9, transform: 'rotate(45deg)', borderRadius: 2,
                  background: 'var(--source-accent, #6fb3e0)',
                  boxShadow: '0 0 6px rgba(111,179,224,0.9)',
                }} />
              )}
            </div>

            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <span className="mono small" style={{ fontSize: 12 }}>
                {item.durationFrames > 0
                  ? formatTimecode(item.durationFrames).slice(3, 8)
                  : '--:--'}
              </span>
              <span className="grow" />
              <span className="mono small muted" style={{ fontSize: 11 }}>
                Source {formatTimecode(item.tSourceFrame).slice(3, 8)}
              </span>
            </div>

            {item.quote && (
              <div className="small muted" style={{
                fontSize: 11, marginTop: 3, lineHeight: 1.3,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                “{item.quote}”
              </div>
            )}

            {/*
              A recording that is not coming back says so, and says what to do.
              The words the author spoke are still on disk — assembling them is
              the whole recovery (D-07).
            */}
            {item.state === 'failed' && (
              <div data-testid="clip-failed" style={{ marginTop: 5 }}>
                <div className="small" style={{ color: 'var(--bad)', fontSize: 11,
                  lineHeight: 1.3 }}>
                  This recording did not finish saving.
                  {item.error ? ` ${item.error}` : ''}
                </div>
                {item.jobId && (
                  <span
                    role="button"
                    tabIndex={0}
                    data-testid="clip-retry"
                    onClick={(e) => { e.stopPropagation(); onRetry(item.jobId!); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation(); onRetry(item.jobId!);
                      }
                    }}
                    className="small"
                    style={{
                      display: 'inline-block', marginTop: 4, padding: '3px 8px',
                      borderRadius: 5, border: '1px solid var(--line)',
                      background: 'var(--panel-2)', cursor: 'pointer', fontSize: 11,
                    }}
                  >
                    Try again
                  </span>
                )}
              </div>
            )}

            {item.state === 'waiting' && (
              <div className="small muted" data-testid="clip-waiting"
                   style={{ marginTop: 4, fontSize: 11, lineHeight: 1.3 }}>
                Waiting to be prepared.
              </div>
            )}
          </button>
        );
      })}

      <button
        data-testid="clip-add"
        onClick={onAdd}
        disabled={!canAdd}
        title={canAdd ? undefined : 'Enable your camera first'}
        style={{
          width: '100%', padding: '10px 8px', borderRadius: 8,
          border: '1px dashed var(--line)', background: 'transparent',
          color: 'var(--muted)',
        }}
      >
        + Add response
      </button>
    </aside>
  );
}
