'use client';

import type { ReactNode, RefObject } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';

/**
 * The stage.
 *
 * The video is the product, so the video is the page. Everything else is a
 * strip beneath it or a panel beside it, and nothing competes with it for the
 * centre.
 *
 * The state line is deliberately large. One key does the whole loop, and an
 * interface built on one key has to say, unmissably, what that key will do
 * right now — "listening" and "your turn" are the only two things the person
 * needs to know, and they should be readable from across a room.
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
  children, stance, currentFrame, durationFrames, cameraStream, cameraOn, claim, tall, aspect,
}: {
  /** The source's own ratio, so the frame is the shape of the picture. */
  aspect?: number | null;
  /** Live has nothing else on the page, so the stage takes the room. */
  tall?: boolean;
  children: ReactNode;
  stance: Stance;
  currentFrame: number;
  durationFrames: number;
  /** The live camera, shown over the source only while it is wanted. */
  cameraStream: RefObject<HTMLVideoElement | null>;
  cameraOn: boolean;
  /** What is being answered, shown at the moment it matters. */
  claim?: string | null;
}) {
  const state = STANCE[stance];

  return (
    <div>
      {/*
        The frame shrink-wraps the picture.
        Capping the height while the box stays full width makes a frame wider
        than the video, and the player fills the difference with black — bars
        inside a border, which looks like a bug and is one. So the box takes
        its size FROM the media: whatever shape the source is, the frame is
        that shape.

        Still capped in height, because the loop is watch → interrupt →
        respond → continue and a hero so tall that the rest falls below the
        fold breaks the loop to look impressive.
      */}
      <div style={{
        position: 'relative', background: '#000', borderRadius: 10, overflow: 'hidden',
        border: '1px solid var(--line)',
        width: aspect
          ? `min(100%, calc(${tall ? '66vh' : '54vh'} * ${aspect}))`
          : 'fit-content',
        maxWidth: '100%', margin: '0 auto', lineHeight: 0,
        ...(aspect ? { aspectRatio: String(aspect) } : {}),
      }}>
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
            width: '22%', maxWidth: 260, aspectRatio: '16 / 9',
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
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '28px 24px 20px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
          }}>
            <div className="small" style={{ opacity: 0.7, marginBottom: 4 }}>
              You are answering
            </div>
            <div style={{ fontSize: 18, lineHeight: 1.35, maxWidth: '75%' }}>
              “{claim}”
            </div>
          </div>
        )}
      </div>

      {/* The one line that matters. */}
      <div className="row" style={{ marginTop: 12, gap: 14, alignItems: 'center' }}>
        <span aria-hidden style={{
          width: 10, height: 10, borderRadius: '50%', background: state.dot,
          boxShadow: `0 0 10px ${state.dot}`, flex: '0 0 auto',
        }} />
        <div className="grow">
          <div data-testid="stance" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>
            {state.title}
          </div>
          <div className="small muted" data-testid="stance-hint">{state.hint}</div>
        </div>
        <span className="mono small muted" data-testid="stage-time">
          {formatTimecode(currentFrame).slice(0, 8)}
          {durationFrames > 0 && ` / ${formatTimecode(durationFrames).slice(0, 8)}`}
        </span>
      </div>
    </div>
  );
}
