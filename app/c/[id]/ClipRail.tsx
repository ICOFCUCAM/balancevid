'use client';

import { formatTimecode } from '../../../src/domain/time.js';
import { RightClickHint } from '../../Menu.js';

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
  /**
   * Whose response this is, where naming them tells the author something.
   *
   * Absent in a conversation with one voice — a rail of the author's own name
   * eleven times is noise, and the same test decides it here as decides the
   * lower third, so the rail and the finished video agree. [D-17, U-20]
   */
  speakerName?: string;
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
  items, selectedId, onSelect, onAdd, onRetry, canAdd, rowMenu,
}: {
  items: ClipRailItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRetry: (jobId: string) => void;
  canAdd: boolean;
  /*
   * WHAT CAN BE DONE TO A CLIP IS THE STUDIO'S QUESTION, NOT THE RAIL'S.
   * The rail knows how a clip looks; deleting one, moving it or changing
   * what kind of move it is all go through the conversation, which the
   * rail has never had and should not be given in order to grow a menu.
   * So it takes the handler and attaches it. [D-20]
   */
  rowMenu: (item: ClipRailItem) => {
    onContextMenu: (event: React.MouseEvent) => void };
}) {
  return (
    <aside
      data-testid="clip-rail"
      /*
       * NOT a scroll container any more. The left column now holds people and
       * then responses, and it scrolls as one — two nested scrollers in one
       * column give a list you can scroll to the bottom of while the thing
       * above it stays put and the scrollbar you grabbed was the wrong one.
       */
      aria-label="Your responses"
    >
      <div className="module-label" style={{ marginBottom: 8 }}>
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
            {...rowMenu(item)}
            /*
              * A CLIP IS A SOURCE IN A RAIL, not a card in a feed. Each
              * sat on its own panel with an 8px radius and eight pixels
              * of gap, so eleven responses read as eleven objects rather
              * than as one rail with eleven entries — and the chosen one
              * was outlined AND tinted, which is two cues for one state.
              *
              * Same treatment as the playlist in 06 and Studio Two's
              * takes in 25: a shared face, a hairline between
              * neighbours, and the chosen one lit on its leading edge.
              */
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              marginBottom: 4, padding: 8, borderRadius: 3,
              background: chosen
                ? 'var(--console-control-hover)' : 'var(--console-control)',
              border: '1px solid var(--console-seam)',
              boxShadow: chosen
                ? 'inset 2px 0 0 var(--accent), var(--console-bevel-strong)'
                : 'var(--console-bevel)',
            }}
          >
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '16 / 9',
              borderRadius: 2, overflow: 'hidden', background: 'var(--screen-bed)',
              display: 'grid', placeItems: 'center', marginBottom: 6,
            }}>
              {item.posterUrl ? (
                <img alt="" src={item.posterUrl} data-testid="clip-poster"
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="small" style={{
                  fontSize: 'var(--text-2xs)', textAlign: 'center', padding: '0 4px', lineHeight: 1.25,
                  color: item.state === 'failed' ? 'var(--bad)' : 'var(--muted)',
                }}>
                  {item.state === 'failed' ? 'did not save'
                    : item.state === 'waiting' ? 'waiting'
                    : 'preparing'}
                </span>
              )}
              {/*
                * THE KIND OF MOVE, ON A LAMP RATHER THAN A FLOOD.
                * [U-11, U-20, brief §19]
                *
                * This was a saturated plate of `item.accent` with near
                * black text lying across the bottom of the poster —
                * the third instance of the same object, after Online
                * TV's ARMED pill and Studio Two's take labels. In a
                * rail of six clips it is six saturated rectangles in
                * six different colours stacked vertically, which is
                * the loudest thing in Studio One and is labelling the
                * quietest.
                *
                * Same answer as the other two: a dark plate with the
                * colour as a bar down its leading edge. The kind is
                * still colour-coded, still readable at a glance down
                * the rail, and the pictures underneath come back.
                */}
              <span style={{
                position: 'absolute', left: 0, bottom: 0,
                padding: '2px 6px 2px 5px',
                fontSize: 'var(--text-2xs)', letterSpacing: 0.6,
                background: 'rgba(0,0,0,0.72)',
                borderLeft: `3px solid ${item.accent}`,
                borderTop: '1px solid rgba(255,255,255,0.14)',
                borderRight: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.94)', fontWeight: 700,
                borderTopRightRadius: 'var(--radius-screen)',
              }}>
                {item.label}
              </span>
              {/* And whose it is, where the conversation has more than one
                  voice. Opposite corner from the move, so the two read as
                  two facts rather than one long label. [D-17] */}
              {item.speakerName && (
                <span data-testid="clip-speaker" style={{
                  position: 'absolute', right: 0, bottom: 0,
                  padding: '2px 6px', fontSize: 'var(--text-2xs)', letterSpacing: 0.4,
                  /* The agreed plate, not a seventh private near-black.
                     This was rgba(14,15,17,0.82) — its own dark, its own
                     alpha, next to a plate it is meant to pair with. */
                  background: 'rgba(0,0,0,0.72)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRight: 0, borderBottom: 0,
                  color: 'rgba(255,255,255,0.94)',
                  borderTopLeftRadius: 'var(--radius-screen)',
                }}>
                  {item.speakerName}
                </span>
              )}
              {/* A statement is bound to this one. Not a badge that judges the
                  source — a mark that says this answer has a subject. */}
              {item.quote && (
                <span data-testid="clip-has-claim" title={item.quote} style={{
                  position: 'absolute', right: 5, top: 5,
                  width: 9, height: 9, transform: 'rotate(45deg)', borderRadius: 2,
                  background: 'var(--source-accent)',
                  /*
                    * NO HALO. This was a 6px bloom in the marker's own
                    * hue, which on a 9px diamond is mostly bloom — and
                    * the glow ban did not catch it because the ban
                    * looked for `rgba(`, `${` or `var(` after the blur
                    * radius and this one is assembled with `color-mix`.
                    * Third spelling, same decoration. A hard ring at
                    * full contrast is smaller, sharper and found
                    * faster over a bright poster.
                    */
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.65)',
                }} />
              )}
            </div>

            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <span className="mono small" style={{ fontSize: 'var(--text-sm)' }}>
                {item.durationFrames > 0
                  ? formatTimecode(item.durationFrames).slice(3, 8)
                  : '--:--'}
              </span>
              <span className="grow" />
              <span className="mono small muted" style={{ fontSize: 'var(--text-xs)' }}>
                Source {formatTimecode(item.tSourceFrame).slice(3, 8)}
              </span>
            </div>

            {item.quote && (
              <div className="small muted" style={{
                fontSize: 'var(--text-xs)', marginTop: 3, lineHeight: 1.3,
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
                <div className="small" style={{ color: 'var(--bad)', fontSize: 'var(--text-xs)',
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
                      background: 'var(--panel-2)', cursor: 'pointer', fontSize: 'var(--text-xs)',
                    }}
                  >
                    Try again
                  </span>
                )}
              </div>
            )}

            {item.state === 'waiting' && (
              <div className="small muted" data-testid="clip-waiting"
                   style={{ marginTop: 4, fontSize: 'var(--text-xs)', lineHeight: 1.3 }}>
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
          width: '100%', padding: '10px 8px', borderRadius: 'var(--radius-control)',
          border: '1px dashed var(--line)', background: 'transparent',
          color: 'var(--muted)',
        }}
      >
        + Add response
      </button>
      {items.length > 0 && <RightClickHint what="a clip" />}
    </aside>
  );
}
