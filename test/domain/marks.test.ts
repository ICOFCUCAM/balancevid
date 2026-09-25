/**
 * A mark, on a canvas of another shape.  [Doctrine U-12, U-22 §3, D-04]
 *
 * "The user selected this region of the source as the subject of the response.
 *  The meaning survives the format change."
 *
 * The arithmetic that makes the second sentence true. An annotation is placed
 * on the SOURCE — a circle round a road on a map — and every export shows that
 * map somewhere different: filling a wide frame, in the top third of a tall
 * one, cropped to the circle itself when the frame is narrow. The circle has
 * to go with it.
 *
 * The blur case is the one that decides whether this is cosmetic. A blur hides
 * a face, an address, a document; a blur that stays in the middle of the frame
 * while the thing it hides moves to the top of it is not a smaller feature,
 * it is a disclosure.
 */
import { describe, expect, it } from 'vitest';

import {
  type Placement, markScale, projectPoint, projectRect,
} from '../../src/domain/marks.js';

/** A 16:9 source filling a 16:9 canvas: the case marks were authored on. */
const FILLS: Placement = {
  panel: { x: 0, y: 0, w: 1, h: 1 },
  fit: 'cover',
  sourceAspect: 16 / 9,
  canvasAspect: 16 / 9,
};

/** The same source in the top third of a 9:16 canvas. */
const STACKED: Placement = {
  panel: { x: 0, y: 0.08, w: 1, h: 0.30 },
  fit: 'contain',
  sourceAspect: 16 / 9,
  canvasAspect: 9 / 16,
};

const near = (value: number, expected: number, tolerance = 0.005) =>
  expect(Math.abs(value - expected)).toBeLessThan(tolerance);

describe('a mark on the canvas it was authored for', () => {
  it('is where it was put', () => {
    const at = projectPoint({ x: 0.5, y: 0.5 }, FILLS)!;
    near(at.x, 0.5);
    near(at.y, 0.5);
  });

  it('including at the corners', () => {
    const at = projectPoint({ x: 0.25, y: 0.75 }, FILLS)!;
    near(at.x, 0.25);
    near(at.y, 0.75);
  });
});

describe('a mark on a reframed canvas', () => {
  /*
   * The source is a strip across the top. A mark in the middle of the source
   * belongs in the middle of THAT STRIP — and drawn at the middle of the
   * canvas it would land on the performer's face instead.
   */
  it('lands inside the panel the source occupies, not the middle of the frame', () => {
    const at = projectPoint({ x: 0.5, y: 0.5 }, STACKED)!;
    near(at.x, 0.5);
    expect(at.y).toBeGreaterThan(0.08);
    expect(at.y).toBeLessThan(0.38);
    // And nowhere near where it would have been left.
    expect(Math.abs(at.y - 0.5)).toBeGreaterThan(0.1);
  });

  /*
   * A 16:9 picture in a panel of almost the same shape is barely letterboxed;
   * a 4:3 picture in the same panel is letterboxed a lot, and a mark at its
   * left edge must move inwards with it rather than stay at the panel's edge.
   */
  it('follows the letterboxing when the picture does not fill the panel', () => {
    const narrowSource: Placement = { ...STACKED, sourceAspect: 4 / 3 };
    const at = projectPoint({ x: 0, y: 0.5 }, narrowSource)!;
    expect(at.x).toBeGreaterThan(0.1);
  });

  it('and a mark keeps its place when the panel crops the picture (cover)', () => {
    const covered: Placement = { ...STACKED, fit: 'cover' };
    const centre = projectPoint({ x: 0.5, y: 0.5 }, covered)!;
    near(centre.x, 0.5);
    /*
     * This panel is WIDER than the source, so a cover fit crops the top and
     * bottom rather than the sides — and a mark up in the part that was cut
     * away is not on screen, and is not drawn at the panel's edge instead.
     * (Which way a cover fit crops is a fact about the two shapes, not an
     * intuition: the panel is 1 × 0.30 of a 9:16 canvas, which is wider than
     * 16:9.)
     */
    expect(projectPoint({ x: 0.5, y: 0.01 }, covered)).toBeNull();
  });
});

describe('a mark when the export crops to what was marked', () => {
  /*
   * THE CASE THE WHOLE FEATURE IS FOR. A vertical export crops the source to
   * the region the author's marks made, so the thing being discussed is worth
   * seeing. The marks must be cropped with it: the first version moved the
   * picture and left the marks behind, which put the circle around whatever
   * the crop happened to leave in that part of the frame.
   */
  const focused: Placement = {
    ...STACKED,
    focus: { x: 0.6, y: 0.1, w: 0.3, h: 0.5 },
  };

  it('a mark in the middle of the crop is in the middle of the panel', () => {
    const at = projectPoint({ x: 0.75, y: 0.35 }, focused)!;
    near(at.x, 0.5, 0.02);
    near(at.y, 0.08 + 0.30 / 2, 0.02);
  });

  it('and a mark outside the crop is not drawn at all', () => {
    expect(projectPoint({ x: 0.1, y: 0.5 }, focused)).toBeNull();
  });

  it('while the same mark on the master is exactly where it was put', () => {
    const at = projectPoint({ x: 0.75, y: 0.35 }, FILLS)!;
    near(at.x, 0.75);
    near(at.y, 0.35);
  });
});

describe('a rectangle, which is the privacy case', () => {
  it('keeps its corners through a reframe', () => {
    const box = projectRect({ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }, STACKED)!;
    expect(box[0].x).toBeLessThan(box[1].x);
    expect(box[0].y).toBeLessThan(box[1].y);
    expect(box[0].y).toBeGreaterThan(0.08);
    expect(box[1].y).toBeLessThan(0.38);
  });

  /*
   * A blur half outside the crop keeps covering the half that is inside it.
   * Dropping it would uncover a face; clamping the corner keeps the covered
   * part covered.
   */
  it('and a box half outside the crop still covers the half inside it', () => {
    const focused: Placement = { ...STACKED, focus: { x: 0.5, y: 0, w: 0.5, h: 1 } };
    const box = projectRect({ x: 0.4, y: 0.3 }, { x: 0.7, y: 0.6 }, focused);
    expect(box).not.toBeNull();
    expect(box![1].x).toBeGreaterThan(box![0].x);
  });

  it('but one entirely outside it is dropped, because nothing of it is shown', () => {
    const focused: Placement = { ...STACKED, focus: { x: 0.6, y: 0, w: 0.3, h: 1 } };
    expect(projectRect({ x: 0.05, y: 0.3 }, { x: 0.2, y: 0.6 }, focused)).toBeNull();
  });
});

describe('the stroke', () => {
  it('is full width on the canvas the mark was authored for', () => {
    expect(markScale(FILLS)).toBeCloseTo(1, 2);
  });

  /*
   * And thinner where the picture is smaller. A stroke that keeps its
   * fraction of the canvas while the picture shrinks into a panel is a line
   * that swallows the thing it points at.
   */
  it('and shrinks with the picture when it is reframed into a panel', () => {
    expect(markScale(STACKED)).toBeLessThan(0.5);
    expect(markScale(STACKED)).toBeGreaterThan(0.1);
  });
});
