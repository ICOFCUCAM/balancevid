/**
 * Annotations as vector drawings.  [Doctrine §14, U-12]
 *
 * libass draws paths, so the marks composite at render resolution rather than
 * being scaled up from whatever size the editing canvas happened to be. They
 * are crisp at 1080p and at 4K, and they reflow for a vertical export because
 * they are emitted in canvas coordinates computed per export (U-18).
 *
 * Timing is native: an ASS event has a start and an end, so a circle appears
 * when the author says the word and goes when they move on.
 */

import type { AnnotationCue } from '../domain/plan.js';
import type { ExportProfile } from '../domain/presentation.js';
import type { Frames } from '../domain/time.js';

/** ASS drawing coordinates are the script resolution, which is the canvas. */
interface Canvas { width: number; height: number; fps: number }

export function annotationEvents(
  cues: AnnotationCue[], profile: ExportProfile, shotStartFrame: Frames,
  assTime: (frames: Frames, fps: number) => string,
): string[] {
  const canvas: Canvas = { width: profile.width, height: profile.height, fps: profile.fps };
  const lines: string[] = [];

  for (const cue of cues) {
    if (cue.kind === 'blur') continue; // a blur is pixels, not a drawing
    const start = shotStartFrame + cue.startFrame;
    const end = shotStartFrame + cue.endFrame;
    if (end <= start) continue;

    const body = cue.kind === 'text'
      ? textEvent(cue, canvas)
      : drawingEvent(cue, canvas);
    if (!body) continue;

    lines.push(
      `Dialogue: 0,${assTime(start, canvas.fps)},${assTime(end, canvas.fps)},Annotation,,0,0,0,,${body}`,
    );
  }
  return lines;
}

function textEvent(cue: AnnotationCue, canvas: Canvas): string | null {
  if (!cue.text?.trim()) return null;
  const at = point(cue.points[0], canvas);
  const size = Math.round(Math.min(canvas.width, canvas.height) * 0.035);
  return `{\\an7\\pos(${at.x},${at.y})\\fs${size}\\1c${assColour(cue.style.color)}\\bord3\\3c&H000000&}` +
    escape(cue.text);
}

function drawingEvent(cue: AnnotationCue, canvas: Canvas): string | null {
  const path = pathFor(cue, canvas);
  if (!path) return null;

  const colour = assColour(cue.style.color);
  const stroke = Math.max(2, Math.round((cue.style.width ?? 0.005) * canvas.height));
  const alpha = alphaTag(cue.style.opacity ?? 1);
  const filled = cue.style.filled === true;

  // Outline by default: a mark points at the picture, it does not cover it.
  const paint = filled
    ? `\\1c${colour}\\1a${alpha}\\bord0`
    : `\\1a&HFF&\\3c${colour}\\3a${alpha}\\bord${stroke}`;

  // Draw-on. A rectangular wipe is all libass can animate, which is enough to
  // read as a stroke arriving rather than a shape appearing. [U-12 §3]
  const reveal = cue.drawFrames > 0 ? wipe(cue, canvas) : '';

  return `{\\an7\\pos(0,0)\\shad0${paint}${reveal}\\p1}${path}{\\p0}`;
}

function wipe(cue: AnnotationCue, canvas: Canvas): string {
  const xs = cue.points.map((p) => p.x * canvas.width);
  const ys = cue.points.map((p) => p.y * canvas.height);
  const pad = Math.round(canvas.height * 0.02);
  const x1 = Math.round(Math.min(...xs)) - pad;
  const x2 = Math.round(Math.max(...xs)) + pad;
  const y1 = Math.round(Math.min(...ys)) - pad;
  const y2 = Math.round(Math.max(...ys)) + pad;
  const ms = Math.round((cue.drawFrames / canvas.fps) * 1000);
  return `\\clip(${x1},${y1},${x1},${y2})\\t(0,${ms},\\clip(${x1},${y1},${x2},${y2}))`;
}

function pathFor(cue: AnnotationCue, canvas: Canvas): string | null {
  const points = cue.points.map((p) => point(p, canvas));
  switch (cue.kind) {
    case 'box': {
      const [a, b] = [points[0]!, points[1]!];
      return `m ${a.x} ${a.y} l ${b.x} ${a.y} ${b.x} ${b.y} ${a.x} ${b.y} ${a.x} ${a.y}`;
    }
    case 'ellipse': {
      const [a, b] = [points[0]!, points[1]!];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      // Four cubic beziers, the standard circle approximation.
      const k = 0.5523;
      const ox = Math.round(rx * k);
      const oy = Math.round(ry * k);
      const r = (n: number) => Math.round(n);
      return `m ${r(cx - rx)} ${r(cy)} ` +
        `b ${r(cx - rx)} ${r(cy) - oy} ${r(cx) - ox} ${r(cy - ry)} ${r(cx)} ${r(cy - ry)} ` +
        `b ${r(cx) + ox} ${r(cy - ry)} ${r(cx + rx)} ${r(cy) - oy} ${r(cx + rx)} ${r(cy)} ` +
        `b ${r(cx + rx)} ${r(cy) + oy} ${r(cx) + ox} ${r(cy + ry)} ${r(cx)} ${r(cy + ry)} ` +
        `b ${r(cx) - ox} ${r(cy + ry)} ${r(cx - rx)} ${r(cy) + oy} ${r(cx - rx)} ${r(cy)}`;
    }
    case 'underline': {
      const [a, b] = [points[0]!, points[1]!];
      const thickness = Math.max(2, Math.round((cue.style.width ?? 0.006) * canvas.height));
      return `m ${a.x} ${a.y} l ${b.x} ${b.y} ${b.x} ${b.y + thickness} ${a.x} ${a.y + thickness}`;
    }
    case 'arrow': {
      const [from, to] = [points[0]!, points[1]!];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      const head = Math.max(14, Math.round(canvas.height * 0.022));
      const half = Math.round(head * 0.5);
      const baseX = Math.round(to.x - ux * head);
      const baseY = Math.round(to.y - uy * head);
      // Shaft as a thin quad, plus a triangular head.
      const w = Math.max(2, Math.round((cue.style.width ?? 0.004) * canvas.height));
      const px = Math.round(-uy * w);
      const py = Math.round(ux * w);
      return `m ${from.x + px} ${from.y + py} l ${baseX + px} ${baseY + py} ` +
        `${baseX - px} ${baseY - py} ${from.x - px} ${from.y - py} ` +
        `m ${baseX + Math.round(-uy * half)} ${baseY + Math.round(ux * half)} ` +
        `l ${to.x} ${to.y} ${baseX - Math.round(-uy * half)} ${baseY - Math.round(ux * half)}`;
    }
    case 'freehand': {
      if (points.length < 2) return null;
      const [first, ...rest] = points;
      return `m ${first!.x} ${first!.y} l ${rest.map((p) => `${p.x} ${p.y}`).join(' ')}`;
    }
    default:
      return null;
  }
}

function point(p: { x: number; y: number } | undefined, canvas: Canvas): { x: number; y: number } {
  return {
    x: Math.round((p?.x ?? 0) * canvas.width),
    y: Math.round((p?.y ?? 0) * canvas.height),
  };
}

/** &HBBGGRR, the order ASS wants. */
function assColour(hex?: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex ?? '#ffcc00').trim());
  const rgb = match?.[1] ?? 'ffcc00';
  return `&H${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}&`.toUpperCase();
}

function alphaTag(opacity: number): string {
  const value = Math.round((1 - Math.min(Math.max(opacity, 0), 1)) * 255);
  return `&H${value.toString(16).padStart(2, '0').toUpperCase()}&`;
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}
