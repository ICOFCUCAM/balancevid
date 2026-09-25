/**
 * Putting a mark back where it belongs, on a canvas of another shape.
 * [Doctrine U-12, U-22 §3, U-18, D-04]
 *
 * "The user selected THIS REGION of the source as the subject of the response.
 *  The meaning survives the format change."
 *
 * An annotation is placed on the SOURCE picture: the author circles a road on
 * a map, and the circle means "this road". Every export then shows that map
 * somewhere different — filling a wide frame, in the top third of a vertical
 * one, cropped to the circle itself when the frame is narrow — and a mark that
 * does not travel with it is a circle around whatever now happens to be in the
 * middle of the screen.
 *
 * WHICH IS WHAT IT WAS. Marks were drawn straight onto the output canvas,
 * which is exactly right on a 16:9 master where the source fills the frame,
 * and wrong on every vertical, square and portrait export, where the source
 * occupies a panel. A blur is a privacy tool — a face, an address, a document
 * — so this was not only a cosmetic failure: the blur stayed in the middle of
 * the frame while the thing it was hiding moved to the top of it.
 *
 * THE TRANSFORM LIVES HERE, in the domain, because it is a composition
 * decision and composition decisions belong in the plan (U-16): the renderer
 * receives marks already in canvas coordinates and needs to know nothing about
 * any of this. It is also pure arithmetic, which means it can be tested
 * against every fit, every crop and every canvas without rendering anything.
 */

import type { Rect } from './presentation.js';

export interface Point { x: number; y: number }

export interface Placement {
  /** Where the picture sits on the canvas, normalised. */
  panel: Rect;
  /** How the picture is fitted into that panel. */
  fit: 'cover' | 'contain';
  /** The part of the source being shown, normalised on the source. */
  focus?: Rect | undefined;
  /** The source picture's own shape, width over height. */
  sourceAspect: number;
  /** The output canvas's shape, width over height. */
  canvasAspect: number;
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Where, on the finished canvas, a point of the source ends up.
 *
 * Returns `null` when the point is not on screen at all — cropped out by the
 * author's own focus region, or by a `cover` fit. A mark that is not visible
 * is not drawn at the edge of the panel instead, because a circle pinned to
 * the edge of the picture is a circle around the wrong thing.
 */
export function projectPoint(point: Point, placement: Placement): Point | null {
  const inner = visibleRegion(placement);
  if (!inner) return null;
  const focus = placement.focus ?? FULL;

  /* Where the point sits inside the cropped picture. */
  const cropped = {
    x: (point.x - focus.x) / focus.w,
    y: (point.y - focus.y) / focus.h,
  };
  if (cropped.x < 0 || cropped.x > 1 || cropped.y < 0 || cropped.y > 1) return null;

  /*
   * And where that sits inside the part of the cropped picture the panel
   * actually shows. For `contain` the whole of it is shown, in a letterboxed
   * sub-rect of the panel; for `cover` a centred part of it fills the panel,
   * and everything else is off screen.
   */
  const shown = {
    x: (cropped.x - inner.source.x) / inner.source.w,
    y: (cropped.y - inner.source.y) / inner.source.h,
  };
  if (shown.x < 0 || shown.x > 1 || shown.y < 0 || shown.y > 1) return null;

  return {
    x: inner.canvas.x + shown.x * inner.canvas.w,
    y: inner.canvas.y + shown.y * inner.canvas.h,
  };
}

/**
 * A rectangular mark, kept rectangular.
 *
 * Its corners are projected and then the result is the rectangle that contains
 * them — which for a blur is the important behaviour: a box that is half off
 * screen keeps covering the half that is on it. A box entirely off screen is
 * dropped, because it is covering something the export does not show.
 */
export function projectRect(a: Point, b: Point, placement: Placement): [Point, Point] | null {
  const visible = visibleSource(placement);
  if (!visible) return null;

  /*
   * INTERSECTED, not clamped. Clamping every corner onto the visible picture
   * turns a box that is entirely off screen into a sliver at the edge — a
   * blur covering something the export does not show, drawn over something it
   * does. The overlap is the honest answer: none of it, or the part of it
   * that is actually there.
   */
  const from = {
    x: Math.max(Math.min(a.x, b.x), visible.x),
    y: Math.max(Math.min(a.y, b.y), visible.y),
  };
  const to = {
    x: Math.min(Math.max(a.x, b.x), visible.x + visible.w),
    y: Math.min(Math.max(a.y, b.y), visible.y + visible.h),
  };
  if (to.x <= from.x || to.y <= from.y) return null;

  const topLeft = projectPoint(from, placement);
  const bottomRight = projectPoint(to, placement);
  if (!topLeft || !bottomRight) return null;
  return [topLeft, bottomRight];
}

/**
 * How much smaller the picture is on this canvas than it was on the author's.
 *
 * A stroke width is a fraction of the canvas, and a stroke that keeps its
 * fraction while the picture shrinks into a panel is a line that swallows what
 * it points at. This is the factor that keeps it proportional to the picture.
 */
export function markScale(placement: Placement): number {
  const inner = visibleRegion(placement);
  if (!inner) return 1;
  return Math.max(0.15, inner.canvas.h);
}

/* ------------------------------------------------------------------------ */

/**
 * The two rectangles the whole transform turns on: which part of the cropped
 * source is shown, and where on the canvas it is shown.
 */
function visibleRegion(
  placement: Placement,
): { source: Rect; canvas: Rect } | null {
  const { panel, fit, canvasAspect } = placement;
  const focus = placement.focus ?? FULL;
  if (panel.w <= 0 || panel.h <= 0 || focus.w <= 0 || focus.h <= 0) return null;
  if (!Number.isFinite(placement.sourceAspect) || placement.sourceAspect <= 0) return null;

  /* The shape of the picture after the author's crop, and of the panel. */
  const pictureAspect = placement.sourceAspect * (focus.w / focus.h);
  const panelAspect = (panel.w / panel.h) * canvasAspect;
  const ratio = pictureAspect / panelAspect;

  if (fit === 'contain') {
    // The whole picture, letterboxed inside the panel.
    const w = ratio >= 1 ? panel.w : panel.w * ratio;
    const h = ratio >= 1 ? panel.h / ratio : panel.h;
    return {
      source: FULL,
      canvas: {
        x: panel.x + (panel.w - w) / 2,
        y: panel.y + (panel.h - h) / 2,
        w,
        h,
      },
    };
  }

  // `cover`: the panel is filled and the overflow is cropped off, centred.
  const visibleW = ratio >= 1 ? 1 / ratio : 1;
  const visibleH = ratio >= 1 ? 1 : ratio;
  return {
    source: {
      x: (1 - visibleW) / 2,
      y: (1 - visibleH) / 2,
      w: visibleW,
      h: visibleH,
    },
    canvas: panel,
  };
}

/** The part of the SOURCE this placement actually shows, in source coordinates. */
function visibleSource(placement: Placement): Rect | null {
  const inner = visibleRegion(placement);
  if (!inner) return null;
  const focus = placement.focus ?? FULL;
  return {
    x: focus.x + inner.source.x * focus.w,
    y: focus.y + inner.source.y * focus.h,
    w: inner.source.w * focus.w,
    h: inner.source.h * focus.h,
  };
}
