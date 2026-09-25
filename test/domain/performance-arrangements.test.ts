/**
 * The arrangements a performance can be cut into.
 * [Doctrine STUDIO-TWO §5, §6, U-18, U-22, benchmark]
 *
 * "You could have multiple synchronized takes visible simultaneously... you
 *  choose which one is visible at each moment."
 *
 * Eight of them, which is what fills the picker's four columns and two rows.
 * What is proved here is what a mockup cannot check: that each one is a real
 * layout, that the ones which tile a frame tile it exactly, that nothing
 * lands outside the frame, and that an arrangement which would become slivers
 * in a tall frame says what it becomes instead.
 */
import { describe, expect, it } from 'vitest';

import { LAYOUTS, takeSlots } from '../../src/domain/presentation.js';

/** The eight the picker offers, plus the ninth a master's picture adds. */
const OFFERED = [
  'performance_full', 'performance_half', 'performance_thirds',
  'performance_quad', 'performance_six', 'performance_pip',
  'performance_focus', 'performance_lead',
];

describe('eight arrangements, and one more with a master picture (§5, §6)', () => {
  it('every one the picker offers is a layout that exists', () => {
    expect(OFFERED).toHaveLength(8);
    for (const id of OFFERED) expect(LAYOUTS[id], id).toBeDefined();
    expect(LAYOUTS['performance_beside_master']).toBeDefined();
  });

  it('and each holds at least one take, so a scene can fill it', () => {
    for (const id of OFFERED) {
      expect(takeSlots(LAYOUTS[id]!), id).toBeGreaterThan(0);
    }
  });

  /*
   * A layout is data, and a slot is a position the scene fills in order. A
   * layout whose slots skipped a number would silently drop whichever take
   * landed on the gap.
   */
  it('their take slots are numbered from zero with nothing missing', () => {
    for (const id of OFFERED) {
      const slots = LAYOUTS[id]!.layers
        .filter((layer) => layer.source === 'take')
        .map((layer) => layer.slot)
        .sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(slots, id).toEqual(slots.map((_unused, index) => index));
    }
  });

  it('nothing is placed outside the frame', () => {
    for (const id of Object.keys(LAYOUTS)) {
      for (const layer of LAYOUTS[id]!.layers) {
        const { x, y, w, h } = layer.rect;
        expect(x, `${id} x`).toBeGreaterThanOrEqual(0);
        expect(y, `${id} y`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${id} right`).toBeLessThanOrEqual(1.0001);
        expect(y + h, `${id} bottom`).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});

describe('the ones that tile, tile exactly (§6, INV-02)', () => {
  /*
   * A grid whose panels sum to less than the frame leaves a seam of backdrop
   * the author did not ask for; one that sums to more has a panel covering
   * its neighbour. Both are invisible in a mockup and obvious in an export.
   */
  const TILING = [
    'performance_quad', 'performance_six', 'performance_six_tall',
    'performance_thirds_stacked', 'performance_lead',
  ];

  it('their panels add up to the whole frame', () => {
    for (const id of TILING) {
      const area = LAYOUTS[id]!.layers
        .reduce((total, layer) => total + layer.rect.w * layer.rect.h, 0);
      expect(area, id).toBeCloseTo(1, 3);
    }
  });

  it('and no two of them overlap', () => {
    for (const id of TILING) {
      const rects = LAYOUTS[id]!.layers.map((layer) => layer.rect);
      for (let a = 0; a < rects.length; a += 1) {
        for (let b = a + 1; b < rects.length; b += 1) {
          const one = rects[a]!;
          const two = rects[b]!;
          const across = Math.min(one.x + one.w, two.x + two.w) - Math.max(one.x, two.x);
          const down = Math.min(one.y + one.h, two.y + two.h) - Math.max(one.y, two.y);
          expect(Math.max(0, across) * Math.max(0, down), `${id} ${a}/${b}`)
            .toBeLessThan(0.0001);
        }
      }
    }
  });
});

describe('what a wide arrangement becomes in a tall frame (U-22)', () => {
  /*
   * Three panels side by side in a 9:16 frame are three slivers. A layout
   * that would do that has to name what it becomes — and the thing it names
   * has to exist, which is the half of this rule a mockup never checks.
   */
  it('three across and six ways both name a reframe, and it exists', () => {
    for (const id of ['performance_thirds', 'performance_six']) {
      const reframe = LAYOUTS[id]!.reframe;
      expect(reframe, id).toBeDefined();
      for (const target of Object.values(reframe!)) {
        expect(LAYOUTS[target], `${id} -> ${target}`).toBeDefined();
      }
    }
  });

  it('and every reframe in the whole table points at a layout that exists', () => {
    for (const id of Object.keys(LAYOUTS)) {
      for (const target of Object.values(LAYOUTS[id]!.reframe ?? {})) {
        expect(LAYOUTS[target], `${id} -> ${target}`).toBeDefined();
      }
    }
  });

  /*
   * The reframe has to be able to hold what the wide one held. A three-panel
   * arrangement that reframed to a two-panel one would drop a performer when
   * the export went vertical.
   */
  it('and a reframe holds at least as many takes as the arrangement it replaces', () => {
    for (const id of Object.keys(LAYOUTS)) {
      const slots = takeSlots(LAYOUTS[id]!);
      for (const target of Object.values(LAYOUTS[id]!.reframe ?? {})) {
        expect(takeSlots(LAYOUTS[target]!), `${id} -> ${target}`)
          .toBeGreaterThanOrEqual(slots);
      }
    }
  });

  /*
   * Two by two is the one arrangement that needs no reframe at all: four
   * equal panels are four equal panels whatever the shape of the frame.
   */
  it('the quad needs none, which is why it survives being posted vertically', () => {
    expect(LAYOUTS['performance_quad']!.reframe).toBeUndefined();
  });
});
