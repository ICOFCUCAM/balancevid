/**
 * Which part of the source a response is about.
 *
 * Its own module, and not part of the planner, for a reason worth stating:
 * the editor needs this function too. A preview of a 9:16 clip has to crop
 * the source exactly as the render will, and a second implementation of
 * "where was the author looking" is a second answer to it. The planner pulls
 * in hashing and ffmpeg profiles, none of which can cross into a browser
 * bundle, so the shared arithmetic lives here where both sides can reach it.
 */
import type { Annotation, Intervention } from './document.js';
import type { Rect } from './presentation.js';

/**
 * Where the author was looking.  [Doctrine U-12, U-22 §3]
 *
 * Not a new field to fill in: the marks they placed already say it. A point,
 * a circle, an arrow's head, a box — each names a part of the frame the
 * response is about, and their union with some air around it is the region a
 * narrow canvas should show.
 *
 * Blur marks are excluded deliberately. A blur says "do not look here", and
 * cropping towards the one thing being hidden is the exact opposite of what
 * was asked for.
 *
 * Nothing marked means no focus, and a reframed panel then shows the whole
 * frame — which is the honest answer when the author has not said otherwise.
 */
export const FOCUS_PADDING = 0.12;
/** Below this a crop is a zoom so deep the subject loses all context. */
export const MIN_FOCUS_SPAN = 0.22;

export function focusRegion(intervention: Intervention): Rect | undefined {
  const marks = (intervention.annotations ?? [])
    .filter((a: Annotation) => a.kind !== 'blur');
  if (marks.length === 0) return undefined;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const mark of marks) {
    // An arrow points AT its second coordinate; where it started is just
    // somewhere with room for a shaft.
    const points = mark.kind === 'arrow' ? mark.points.slice(-1) : mark.points;
    for (const point of points) { xs.push(point.x); ys.push(point.y); }
  }
  if (xs.length === 0) return undefined;

  let x1 = Math.min(...xs) - FOCUS_PADDING;
  let x2 = Math.max(...xs) + FOCUS_PADDING;
  let y1 = Math.min(...ys) - FOCUS_PADDING;
  let y2 = Math.max(...ys) + FOCUS_PADDING;

  // Grow anything too tight, about its own centre, before clamping — so a
  // single point does not become a crop of a dozen pixels.
  const grow = (a: number, b: number): [number, number] => {
    const span = b - a;
    if (span >= MIN_FOCUS_SPAN) return [a, b];
    const centre = (a + b) / 2;
    return [centre - MIN_FOCUS_SPAN / 2, centre + MIN_FOCUS_SPAN / 2];
  };
  [x1, x2] = grow(x1, x2);
  [y1, y2] = grow(y1, y2);

  // Slide back inside the frame rather than clipping, so the region keeps the
  // size it needs even when the subject is at an edge.
  const slide = (a: number, b: number): [number, number] => {
    const span = Math.min(1, b - a);
    if (a < 0) return [0, span];
    if (b > 1) return [1 - span, 1];
    return [a, b];
  };
  [x1, x2] = slide(x1, x2);
  [y1, y2] = slide(y1, y2);

  const rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  // A "focus" on everything is not a focus, and cropping to it costs quality
  // for nothing.
  if (rect.w > 0.97 && rect.h > 0.97) return undefined;
  return rect;
}
