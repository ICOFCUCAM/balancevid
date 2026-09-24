/**
 * Reframing, and the region that survives it.  [Doctrine U-18, U-22 §3]
 *
 * The product's claim is that one composition publishes in four shapes and
 * still means the same thing. Two ways that can quietly stop being true:
 *
 *   The reframe is declared and never read. Every layout carried a
 *   `verticalLayoutId` for months and nothing consulted it, so a 9:16 clip was
 *   rendered with the 16:9 arrangement — two postage stamps in a band of blur.
 *
 *   The reframe happens and throws away the point. A wide frame contained in
 *   a narrow panel is a strip in which the thing being discussed is a few
 *   pixels across. The author already said where to look.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORT_PROFILES, LAYOUTS, aspectFamily, layoutForProfile,
} from '../../src/domain/presentation.js';
import { FOCUS_PADDING, MIN_FOCUS_SPAN, focusRegion } from '../../src/domain/focus.js';
import type { Annotation, Intervention } from '../../src/domain/document.js';

const withMarks = (marks: Partial<Annotation>[]): Intervention => ({
  id: 'ivn_x' as never,
  anchor: { tSourceFrame: 100 },
  type: 'critique',
  takes: [],
  selectedTakeId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  annotations: marks.map((m, i) => ({
    id: `ann_${i}` as never, kind: 'point', points: [{ x: 0.5, y: 0.5 }],
    style: {}, z: i, ...m,
  })) as Annotation[],
} as Intervention);

describe('aspect families', () => {
  it('sorts the four publication formats into the shapes layouts care about', () => {
    expect(aspectFamily(EXPORT_PROFILES['youtube_16x9']!)).toBe('landscape');
    expect(aspectFamily(EXPORT_PROFILES['square_1x1']!)).toBe('square');
    expect(aspectFamily(EXPORT_PROFILES['portrait_4x5']!)).toBe('portrait');
    expect(aspectFamily(EXPORT_PROFILES['vertical_9x16']!)).toBe('tall');
  });
});

describe('reframing (U-18, U-22 §3)', () => {
  it('leaves a wide canvas alone — it is what the author composed on', () => {
    const wide = EXPORT_PROFILES['youtube_16x9']!;
    expect(layoutForProfile('critique', 'side_by_side', wide).id).toBe('side_by_side');
    expect(layoutForProfile('critique', 'triptych', wide).id).toBe('triptych');
  });

  it('turns beside into above on a tall canvas, rather than shrinking it', () => {
    const tall = EXPORT_PROFILES['vertical_9x16']!;
    const reframed = layoutForProfile('critique', 'side_by_side', tall);
    expect(reframed.id).toBe('vertical_stack');

    // The two panels are stacked, not side by side: neither shares a row.
    const source = reframed.layers.find((l) => l.source === 'source')!;
    const user = reframed.layers.find((l) => l.source === 'user')!;
    expect(source.rect.y + source.rect.h).toBeLessThanOrEqual(user.rect.y);
    // And each one spans the width, rather than being half of it.
    expect(source.rect.w).toBeGreaterThan(0.9);
    expect(user.rect.w).toBeGreaterThan(0.9);
  });

  it('gives 4:5 and 1:1 their own proportions, not the 9:16 one', () => {
    const portrait = layoutForProfile(
      'critique', 'side_by_side', EXPORT_PROFILES['portrait_4x5']!);
    const square = layoutForProfile(
      'critique', 'side_by_side', EXPORT_PROFILES['square_1x1']!);
    expect(portrait.id).toBe('stacked_portrait');
    expect(square.id).toBe('stacked_square');
    // Less tall a canvas, more of it each panel gets.
    const tallSource = LAYOUTS['vertical_stack']!.layers.find((l) => l.source === 'source')!;
    const squareSource = square.layers.find((l) => l.source === 'source')!;
    expect(squareSource.rect.h).toBeGreaterThan(tallSource.rect.h);
  });

  it('honours the author\'s choice of arrangement, in the new shape', () => {
    // Choosing "you speaking, source alongside" is choosing who has the room.
    // Its tall form keeps that, rather than falling back to a generic stack.
    const tall = EXPORT_PROFILES['vertical_9x16']!;
    const reframed = layoutForProfile('explain', 'presenter_focus', tall);
    expect(reframed.id).toBe('presenter_tall');
    const user = reframed.layers.find((l) => l.source === 'user')!;
    const source = reframed.layers.find((l) => l.source === 'source')!;
    expect(user.rect.h).toBeGreaterThan(source.rect.h);
  });

  it('every reframe names a layout that exists', () => {
    for (const layout of Object.values(LAYOUTS)) {
      for (const [family, id] of Object.entries(layout.reframe ?? {})) {
        expect(LAYOUTS[id], `${layout.id} → ${family} → ${id}`).toBeDefined();
      }
    }
  });

  it('a reframed layout follows the marks; a wide one shows everything', () => {
    const tall = EXPORT_PROFILES['vertical_9x16']!;
    const wide = EXPORT_PROFILES['youtube_16x9']!;
    expect(layoutForProfile('critique', 'side_by_side', tall).layers
      .some((l) => l.followFocus)).toBe(true);
    expect(layoutForProfile('critique', 'side_by_side', wide).layers
      .some((l) => l.followFocus)).toBe(false);
  });
});

describe('the region the response is about (U-12, U-22 §3)', () => {
  it('is nothing when the author marked nothing', () => {
    expect(focusRegion(withMarks([]))).toBeUndefined();
  });

  it('is the thing they pointed at, with air around it', () => {
    const region = focusRegion(withMarks([{ kind: 'point', points: [{ x: 0.7, y: 0.3 }] }]))!;
    expect(region).toBeDefined();
    expect(region.x).toBeLessThan(0.7);
    expect(region.x + region.w).toBeGreaterThan(0.7);
    expect(region.y).toBeLessThan(0.3);
    expect(region.y + region.h).toBeGreaterThan(0.3);
  });

  it('never crops so tightly that the subject loses its context', () => {
    const region = focusRegion(withMarks([{ kind: 'point', points: [{ x: 0.5, y: 0.5 }] }]))!;
    expect(region.w).toBeGreaterThanOrEqual(MIN_FOCUS_SPAN);
    expect(region.h).toBeGreaterThanOrEqual(MIN_FOCUS_SPAN);
  });

  it('covers every mark when there are several', () => {
    const region = focusRegion(withMarks([
      { kind: 'point', points: [{ x: 0.2, y: 0.2 }] },
      { kind: 'ellipse', points: [{ x: 0.6, y: 0.5 }, { x: 0.8, y: 0.7 }] },
    ]))!;
    expect(region.x).toBeLessThanOrEqual(0.2);
    expect(region.x + region.w).toBeGreaterThanOrEqual(0.8);
    expect(region.y + region.h).toBeGreaterThanOrEqual(0.7);
  });

  it('follows an arrow to its head, not to wherever it started', () => {
    // The tail is placed wherever there was room for a shaft; only the head
    // names the subject.
    const region = focusRegion(withMarks([
      { kind: 'arrow', points: [{ x: 0.05, y: 0.05 }, { x: 0.8, y: 0.8 }] },
    ]))!;
    expect(region.x).toBeGreaterThan(0.3);
    expect(region.y).toBeGreaterThan(0.3);
  });

  it('ignores a blur, because a blur says do not look here', () => {
    expect(focusRegion(withMarks([
      { kind: 'blur', points: [{ x: 0.0, y: 0.0 }, { x: 0.2, y: 0.2 }] },
    ]))).toBeUndefined();

    // And a blur alongside a real mark does not drag the region towards it.
    const region = focusRegion(withMarks([
      { kind: 'blur', points: [{ x: 0.0, y: 0.0 }, { x: 0.1, y: 0.1 }] },
      { kind: 'point', points: [{ x: 0.85, y: 0.85 }] },
    ]))!;
    expect(region.x).toBeGreaterThan(0.5);
  });

  it('stays inside the frame by sliding, not by shrinking', () => {
    const region = focusRegion(withMarks([{ kind: 'point', points: [{ x: 0.01, y: 0.99 }] }]))!;
    expect(region.x).toBeGreaterThanOrEqual(0);
    expect(region.y).toBeGreaterThanOrEqual(0);
    expect(region.x + region.w).toBeLessThanOrEqual(1.0001);
    expect(region.y + region.h).toBeLessThanOrEqual(1.0001);
    expect(region.w).toBeGreaterThanOrEqual(MIN_FOCUS_SPAN);
    expect(region.h).toBeGreaterThanOrEqual(MIN_FOCUS_SPAN);
  });

  it('is nothing when the marks cover the whole frame — that is not a focus', () => {
    expect(focusRegion(withMarks([
      { kind: 'box', points: [{ x: 0.01, y: 0.01 }, { x: 0.99, y: 0.99 }] },
    ]))).toBeUndefined();
  });

  it('pads by the declared amount', () => {
    const region = focusRegion(withMarks([
      { kind: 'box', points: [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }] },
    ]))!;
    expect(region.x).toBeCloseTo(0.3 - FOCUS_PADDING, 5);
    expect(region.w).toBeCloseTo(0.4 + FOCUS_PADDING * 2, 5);
  });
});
