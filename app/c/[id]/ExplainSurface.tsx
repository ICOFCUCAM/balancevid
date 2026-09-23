'use client';

import { useEffect, useRef, useState } from 'react';
import { HOUSE_FPS } from '../../../src/domain/time.js';
import type { ExplainTool } from './CompositionRail.js';

/**
 * Marking the picture, on the picture.  [Doctrine §14, §15, U-12]
 *
 * A transparent pointer layer over the composition. The author sees what the
 * audience will see and marks THAT — which matters for more than the feel of
 * it: annotations are canvas coordinates, so a circle placed on a full-bleed
 * source frame lands somewhere else entirely once the response is exported
 * side by side. Marking the composition is the only placement that means the
 * same thing in the export.
 *
 * This is also the whole argument for doing it on the stage rather than in a
 * panel: the author is explaining something to someone, and a person
 * explaining something points at it. A coordinate typed into a field is the
 * same data and a different act.
 *
 * Nothing is rasterised. A click produces normalised coordinates in the
 * document (U-12), which the renderer draws at export resolution; the shapes
 * drawn here and the ASS the renderer emits come from the same numbers.
 */
export default function ExplainSurface({
  intervention, tool, onPlace, onDone, onDraft,
}: {
  intervention: any;
  tool: ExplainTool;
  /** The shape under the pointer, so the composition can show it forming. */
  onDraft: (draft: any) => void;
  /** A finished mark, in normalised coordinates. */
  onPlace: (mark: {
    kind: ExplainTool;
    points: { x: number; y: number }[];
    text?: string;
    drawFrames?: number;
  }) => void;
  onDone: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const setDraft = onDraft;

  // Escape puts the tool down. A mode with no way out is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const relative = (event: { clientX: number; clientY: number }) => {
    const box = hostRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1),
      y: Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = relative(event);
    const startedAt = performance.now();

    // One click, one mark: the tools a person uses by pointing.
    if (tool === 'point') { onPlace({ kind: 'point', points: [from], drawFrames: 6 }); return; }
    if (tool === 'text') {
      const text = window.prompt('Label');
      if (text?.trim()) onPlace({ kind: 'text', points: [from], text: text.trim() });
      return;
    }

    const path = [from];
    setDraft({ kind: tool, points: [from, from] });

    const move = (e: PointerEvent) => {
      const to = relative(e);
      if (tool === 'freehand') { path.push(to); setDraft({ kind: tool, points: [...path] }); }
      else setDraft({ kind: tool, points: [from, to] });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const to = relative(e);
      const points = tool === 'freehand' ? [...path, to] : [from, to];
      setDraft(null);
      const span = Math.hypot(points.at(-1)!.x - points[0]!.x, points.at(-1)!.y - points[0]!.y);
      if (span < 0.02 && tool !== 'freehand') return; // a tap, not a mark
      onPlace({
        kind: tool, points,
        // How fast it was actually drawn, so it animates on at hand speed
        // rather than appearing. [U-12 §3]
        drawFrames: Math.min(45, Math.round(((performance.now() - startedAt) / 1000) * HOUSE_FPS)),
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={hostRef}
      data-testid="explain-surface"
      data-tool={tool}
      onPointerDown={onPointerDown}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', lineHeight: 0 }}
    >
      <div className="small" style={{
        position: 'absolute', left: 12, top: 12, padding: '4px 10px', borderRadius: 5,
        background: 'rgba(0,0,0,0.65)', color: '#fff', lineHeight: 1.3,
        pointerEvents: 'none',
      }}>
        Marking the frame — Escape to stop
      </div>
    </div>
  );
}
