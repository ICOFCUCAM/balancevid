'use client';

import type { ReactNode, RefObject } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';

/**
 * The stage.
 *
 * The video is the product, so the video is the page. Everything else is a
 * bar above it or a bar below it, and nothing competes with it for the centre.
 *
 * The stage is a FIELD, not a box in a document. It is handed whatever height
 * the window has left once the bars are drawn, and the picture is centred in
 * it at its own ratio — as large as that field allows and no larger. There is
 * no `vh` cap here on purpose: a cap is a guess about the window, and it is
 * wrong on every window that is not the one it was guessed for. Dead space
 * below the video, which is what a cap produces on a wide screen, is the
 * thing this exists to remove.
 */
export type Stance = 'idle' | 'listening' | 'yours' | 'saving' | 'blocked';

const STANCE: Record<Stance, { dot: string; title: string; hint: string }> = {
  idle: { dot: '#7d8b99', title: 'Ready', hint: 'Press space to start' },
  listening: { dot: '#4fd07a', title: 'Listening', hint: 'Press space to interrupt' },
  yours: { dot: '#e0674f', title: 'Your turn', hint: 'Press space to continue' },
  saving: { dot: '#e0b24f', title: 'Saving your response', hint: 'One moment' },
  blocked: { dot: '#7d8b99', title: 'Camera not available', hint: 'Check your browser permissions' },
};

export default function Stage({
  children, stance, cameraStream, cameraOn, claim, aspect, fit = 'height',
}: {
  /**
   * Which way round the picture is sized.
   *
   * 'height' is Live: the stage owns the window, so the picture is as tall as
   * the window allows. 'width' is Studio: the stage shares a column with the
   * timeline and the panels, so it takes the column's width and is whatever
   * height that ratio makes it. Sizing by height in a column produces black
   * gutters either side, which is the same dead space in a different place.
   */
  fit?: 'height' | 'width';
  /** The source's own ratio, so the frame is the shape of the picture. */
  aspect?: number | null;
  children: ReactNode;
  stance: Stance;
  /** The live camera, shown over the source only while it is wanted. */
  cameraStream: RefObject<HTMLVideoElement | null>;
  cameraOn: boolean;
  /** What is being answered, shown at the moment it matters. */
  claim?: string | null;
}) {
  const ratio = aspect && aspect > 0 ? aspect : 16 / 9;

  return (
    <div className="stage-field" data-testid="stage-field"
         style={fit === 'width' ? { padding: 0, background: 'transparent' } : undefined}>
      {/*
        The frame shrink-wraps the picture, and the picture fills the field.
        `height: 100%` with the source's own aspect-ratio and `max-width: 100%`
        means: be as tall as the room allows, be the shape of the video, and
        give way to the width when the room is taller than it is wide. Black
        bars are impossible either way, because the frame carries the ratio.
      */}
      <div
        data-testid="stage-frame"
        style={{
          position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden',
          aspectRatio: String(ratio), lineHeight: 0,
          ...(fit === 'width'
            ? { width: '100%', maxHeight: '100%' }
            : { height: '100%', maxWidth: '100%' }),
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
        }}
      >
        {children}

        {/*
          The camera sits over the source, small, and only when it is on. An
          empty black rectangle held open for a camera nobody has enabled makes
          the application look broken before it has done anything.
        */}
        <video
          ref={cameraStream}
          autoPlay muted playsInline
          data-testid="camera-pip"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: '20%', maxWidth: 240, aspectRatio: '16 / 9',
            objectFit: 'cover', borderRadius: 8,
            border: `2px solid ${stance === 'yours' ? '#e0674f' : 'rgba(255,255,255,0.35)'}`,
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            display: cameraOn ? 'block' : 'none',
            // The recording indicator is the picture itself (D-03): if you can
            // see yourself, you are live.
          }}
        />

        {/* What you are answering, over the frozen frame, while you answer it. */}
        {claim && stance === 'yours' && (
          <div data-testid="stage-claim" style={{
            // Clear of the player's own control bar. Sitting at bottom: 0 put
            // the statement underneath the scrubber, where it read as a
            // rendering fault rather than as the thing being answered.
            position: 'absolute', left: 0, right: 0, bottom: 48,
            padding: '32px 24px 16px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.88))',
            lineHeight: 1.35,
          }}>
            <div className="small" style={{ opacity: 0.7, marginBottom: 4 }}>
              You are answering
            </div>
            <div style={{ fontSize: 18, maxWidth: '75%' }}>
              “{claim}”
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The one line that matters, now living in the bottom bar.
 *
 * Deliberately large. One key does the whole loop, and an interface built on
 * one key has to say, unmissably, what that key will do right now —
 * "listening" and "your turn" are the only two things the person needs to
 * know, and they should be readable from across a room.
 */
export function StageStatus({
  stance, currentFrame, durationFrames,
}: { stance: Stance; currentFrame: number; durationFrames: number }) {
  const state = STANCE[stance];
  return (
    <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'nowrap' }}>
      <span aria-hidden style={{
        width: 10, height: 10, borderRadius: '50%', background: state.dot,
        boxShadow: `0 0 10px ${state.dot}`, flex: '0 0 auto',
      }} />
      <div style={{ minWidth: 0 }}>
        <div data-testid="stance" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.15 }}>
          {state.title}
        </div>
        <div className="small muted" data-testid="stance-hint">{state.hint}</div>
      </div>
      <span className="mono small muted" data-testid="stage-time" style={{ flex: '0 0 auto' }}>
        {formatTimecode(currentFrame).slice(0, 8)}
        {durationFrames > 0 && ` / ${formatTimecode(durationFrames).slice(0, 8)}`}
      </span>
    </div>
  );
}
