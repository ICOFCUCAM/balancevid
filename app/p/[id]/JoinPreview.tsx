'use client';

import { useEffect, useRef, useState } from 'react';

import type { Performance, Scene } from '../../../src/domain/performance.js';
import { joinSpan } from '../../../src/domain/performance.js';
import { mixAt } from '../../../src/domain/transitions.js';
import {
  HOUSE_SAMPLE_RATE, formatMasterPosition, samplesToFrames,
} from '../../../src/domain/time.js';

/**
 * Watching the join, one frame at a time.
 * [MASTER-EDIT §3, §12 P1; Doctrine STUDIO-TWO §11, INV-02, U-02]
 *
 * The last P1 row. The programme monitor shows the scene at the playhead,
 * which means it shows one side of a join or the other and never the mix —
 * so an author choosing between a dissolve and a fade was choosing from a
 * name and a sentence, and finding out at the export.
 *
 * TWO PICTURES AND AN OPACITY, which is the honest browser-side answer.
 * The renderer composites in RGB with a per-pixel expression; a browser can
 * stack two video elements and cross-fade them, which is the same result
 * for the same reason — one picture going out as the other comes in.
 *
 * AND THE RAMP IS NOT GUESSED, WHICH IS THE WHOLE POINT. `mixAt` is the
 * definition the renderer's own expression is written from, and a test
 * evaluates that expression at every frame against it. A preview fading at
 * a different rate from the render is worse than no preview: it is a
 * measurement the author trusts and should not. [D-19]
 *
 * A FADE THROUGH BLACK REALLY GOES TO BLACK HERE, because both opacities
 * are taken to zero in the middle and the bed behind them is `--screen-bed`
 * — the same black the monitor uses. An `opacity` cross-fade would show the
 * outgoing picture through the incoming one and never dip, which is a
 * dissolve wearing a fade's name.
 *
 * SCRUBBED AND NOT PLAYED. The overlap is a third of a second; played, it
 * is over before an author has seen it. A scrub is how you look at ten
 * frames, and the frame number is on screen because "is this dissolve too
 * long" is a question about a count. [INV-02]
 */
export default function JoinPreview({
  performance, scene, before,
}: {
  performance: Performance;
  /** The scene being arrived at — the join is stored on it. */
  scene: Scene;
  /** The scene being left. Absent means nothing precedes this one. */
  before?: Scene;
}) {
  const [frame, setFrame] = useState(0);
  const leaving = useRef<HTMLVideoElement | null>(null);
  const arriving = useRef<HTMLVideoElement | null>(null);

  const join = joinSpan(scene, performance.master.durationSamples);
  const frames = join?.style.frames ?? 0;
  const leavingTake = before?.takeIds[0];
  const arrivingTake = scene.takeIds[0];

  /*
   * BOTH SIDES SEEK TO THE SAME MOMENT ON THE SONG CLOCK, which is the
   * whole reason this product can preview a join at all: the takes are
   * parallel, so "where are we" is one number and not two. A sequencer
   * would have to map the playhead through each clip's own in-point.
   * [S-1, INV-14]
   */
  useEffect(() => {
    if (!join) return;
    const at = (join.fromSample + (frame / 30) * HOUSE_SAMPLE_RATE)
      / HOUSE_SAMPLE_RATE;
    for (const video of [leaving.current, arriving.current]) {
      if (video && Number.isFinite(at)) video.currentTime = Math.max(0, at);
    }
  }, [frame, join]);

  if (!join || !arrivingTake || !leavingTake || !before) return null;

  const { a, b } = mixAt(join.style, frame, frames);
  const media = (takeId: string) =>
    `/api/performances/${performance.id}/takes/${takeId}/media?kind=proxy`;

  return (
    <div data-testid="join-preview" style={{ marginTop: 'var(--space-3)' }}>
      <div style={{
        position: 'relative', aspectRatio: '16 / 9', maxWidth: 360,
        background: 'var(--screen-bed)', borderRadius: 'var(--radius-screen)',
        overflow: 'hidden',
      }}>
        <video ref={leaving} data-testid="join-leaving" muted playsInline
               preload="auto" src={media(leavingTake)}
               style={{
                 position: 'absolute', inset: 0, width: '100%', height: '100%',
                 objectFit: 'cover', opacity: a,
               }} />
        <video ref={arriving} data-testid="join-arriving" muted playsInline
               preload="auto" src={media(arrivingTake)}
               style={{
                 position: 'absolute', inset: 0, width: '100%', height: '100%',
                 objectFit: 'cover', opacity: b,
               }} />
      </div>

      <div className="row" style={{
        gap: 'var(--space-3)', marginTop: 'var(--space-2)', flexWrap: 'wrap',
      }}>
        <input type="range" data-testid="join-scrub"
               min={0} max={Math.max(0, frames - 1)} step={1} value={frame}
               onChange={(event) => setFrame(Number(event.target.value))}
               style={{ flex: '1 1 160px', minWidth: 120 }} />
        {/*
          * THE FRAME NUMBER AND THE MOMENT, because "is this too long" is a
          * question about a count and "where is this" is a question about
          * the song. [INV-02]
          */}
        <span className="readout" data-testid="join-frame">
          {`${frame + 1} / ${frames}`}
        </span>
        <span className="module-sub">
          {formatMasterPosition(
            join.fromSample + (frame / 30) * HOUSE_SAMPLE_RATE)}
        </span>
      </div>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        {`${samplesToFrames(join.toSample - join.fromSample)} frames of overlap, `}
        {a === 0 && b === 0 ? 'and this one is black.' : 'scrubbed one at a time.'}
      </p>
    </div>
  );
}
