/**
 * Is the camera any good?  [CHANNEL §23, §26, D-04, D-21, C-28, C-45]
 *
 * THE BRIEF'S POINT 8, the one it says no graphics fix: *"quite
 * soft, heavily compressed, poorly framed, subject very close to the
 * bottom edge, large empty wall area… even if you add a perfect
 * lower third, it will still look like a home webcam feed."*
 *
 * It is right, and the product said nothing. The Live Studio's
 * camera panel reports the device, the preset and the feed's
 * bitrate — everything about the transport and nothing about the
 * picture.
 *
 * The fixtures are built pixel by pixel rather than captured,
 * because a test that needed a camera would be a test nobody runs.
 */

import { describe, expect, it } from 'vitest';

import {
  type Frame, BOTTOM_HEAVY, TOO_BRIGHT, TOO_DARK, TOO_FLAT,
  lookOf, shotProblems, shotSays,
} from '../../src/domain/shot.js';

const W = 64;
const H = 36;

/** A frame whose pixel is decided by a function of x and y. */
function frameOf(value: (x: number, y: number) => number): Frame {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const at = (y * W + x) * 4;
      const level = Math.max(0, Math.min(255, Math.round(value(x, y) * 255)));
      rgba[at] = level; rgba[at + 1] = level; rgba[at + 2] = level;
      rgba[at + 3] = 255;
    }
  }
  return { rgba, width: W, height: H };
}

const flat = (level: number) => frameOf(() => level);
/** Dark above, detailed below: the brief's own shot. */
const bottomHeavy = frameOf((x, y) => (y < H / 2 ? 0.5 : (x % 2 ? 0.2 : 0.8)));

describe('what a frame says about itself (C-45)', () => {
  it('reads the brightness', () => {
    expect(lookOf(flat(0.5)).luma).toBeCloseTo(0.5, 2);
    expect(lookOf(flat(0.05)).luma).toBeCloseTo(0.05, 2);
  });

  /*
   * THE SPREAD IS A PERCENTILE RANGE, NOT A MIN AND A MAX. One blown
   * highlight off a window and one black doorway would make every
   * picture read as full-range, which is the opposite of what the
   * number is for.
   */
  it('ignores one blown highlight and one black corner', () => {
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i += 1) {
      const level = 128;
      rgba[i * 4] = level; rgba[i * 4 + 1] = level; rgba[i * 4 + 2] = level;
      rgba[i * 4 + 3] = 255;
    }
    /* One pixel at each extreme, which a min/max would believe. */
    rgba[0] = 0; rgba[1] = 0; rgba[2] = 0;
    rgba[4] = 255; rgba[5] = 255; rgba[6] = 255;
    const look = lookOf({ rgba, width: W, height: H });
    expect(look.spread).toBeLessThan(0.05);
  });

  it('finds where the detail sits', () => {
    expect(lookOf(bottomHeavy).weight).toBeGreaterThan(BOTTOM_HEAVY);
    /* A frame with detail everywhere is even. */
    expect(lookOf(frameOf((x) => (x % 2 ? 0.2 : 0.8))).weight)
      .toBeCloseTo(0.5, 1);
  });

  /* A frame with no edges at all is even, not top-heavy. */
  it('calls a frame with no detail anywhere even', () => {
    expect(lookOf(flat(0.5)).weight).toBe(0.5);
  });

  it('says nothing about nothing', () => {
    expect(lookOf({ rgba: new Uint8ClampedArray(0), width: 0, height: 0 }))
      .toEqual({ luma: 0, spread: 0, weight: 0.5 });
  });
});

describe('what to tell the operator (C-45)', () => {
  /* Each sentence names a thing to DO in the minute before air. */
  it('says what to do about a dark picture', () => {
    const says = shotSays(shotProblems(
      { luma: TOO_DARK - 0.01, spread: 0.5, weight: 0.5 }));
    expect(says).toContain('dark');
    expect(says).toContain('light');
  });

  it('says what to do about a washed-out one', () => {
    const [one] = shotProblems(
      { luma: TOO_BRIGHT + 0.01, spread: 0.5, weight: 0.5 });
    expect(one?.code).toBe('bright');
    expect(one?.says).toContain('window');
  });

  /* "Lighting is relatively flat", in numbers. */
  it('names flat light and what fixes it', () => {
    const [one] = shotProblems(
      { luma: 0.5, spread: TOO_FLAT - 0.01, weight: 0.5 });
    expect(one?.code).toBe('flat');
    expect(one?.says).toContain('to the side');
  });

  /*
   * AND THE FRAMING ONE SUGGESTS RATHER THAN COMPLAINS. A wide shot
   * of a desk is a real shot, so this is not a fault.
   */
  it('suggests raising the camera without calling it wrong', () => {
    const [one] = shotProblems(
      { luma: 0.5, spread: 0.5, weight: BOTTOM_HEAVY + 0.01 });
    expect(one?.code).toBe('low');
    expect(one?.says).toContain('Raising the camera');
    expect(one?.says).not.toMatch(/wrong|bad|fault/i);
  });

  /*
   * NEVER MORE THAN TWO. A camera panel listing four complaints is a
   * panel somebody stops reading — the brief's own point 10 pointed
   * at the control room instead of at the picture.
   */
  it('stops at two however bad it is', () => {
    expect(shotProblems({ luma: 0.02, spread: 0.01, weight: 0.99 }))
      .toHaveLength(2);
  });

  /*
   * DARK AND BRIGHT ARE ONE QUESTION, AND WHAT MAKES THAT TRUE IS
   * THE CONSTANTS. An `else` was written between them and survived
   * every mutation — no number is both, so the keyword could never
   * have fired twice and was doing nothing. The thresholds are the
   * real invariant, so they are what is asserted. [C-45]
   */
  it('cannot call one picture both too dark and too bright', () => {
    expect(TOO_DARK).toBeLessThan(TOO_BRIGHT);
    for (const luma of [0, 0.1, 0.5, 0.9, 1]) {
      const codes = shotProblems({ luma, spread: 0.5, weight: 0.5 })
        .map((one) => one.code);
      expect(codes.includes('dark') && codes.includes('bright')).toBe(false);
    }
  });

  it('says nothing about a shot that is fine', () => {
    expect(shotProblems({ luma: 0.45, spread: 0.6, weight: 0.5 })).toEqual([]);
    expect(shotSays([])).toBe(null);
  });
});
