/**
 * The preview and the render fade at the same rate.
 * [MASTER-EDIT §3, §12 P1; Doctrine STUDIO-TWO §11, D-19, INV-02]
 *
 * The join preview cross-fades two video elements in a browser; the
 * renderer composites two pictures with a per-pixel ffmpeg expression.
 * Neither can be derived from the other — an expression string cannot be
 * called, and a function cannot be handed to a filter graph — so the ramp
 * is stated once as `mixAt` and written out once as `mixExpression`.
 *
 * TWO STATEMENTS OF ONE THING IS EXACTLY THE SHAPE D-19 WARNS ABOUT, and
 * the answer is not to pretend otherwise but to make them provably equal.
 * This file evaluates the expression the renderer will actually send to
 * ffmpeg, at every frame of every style, and compares it to the numbers
 * the monitor will actually set an opacity to.
 *
 * A preview that fades at a different rate from the render is worse than
 * no preview: it is a measurement the author trusts and should not.
 */
import { describe, expect, it } from 'vitest';

import {
  TRANSITIONS, type Transition, mixAt, mixExpression, overlapSplit,
} from '../../src/domain/transitions.js';

/**
 * Evaluate the renderer's own expression the way ffmpeg would.
 *
 * `A` and `B` are the two pictures' samples and `N` is the frame index.
 * Feeding (1, 0) recovers how much of the outgoing picture is left, and
 * (0, 1) how much of the incoming one has arrived — which is precisely the
 * pair `mixAt` returns.
 *
 * WRITTEN OUT RATHER THAN `eval`-ed AS ARBITRARY CODE. The expression is a
 * tiny arithmetic language — `max`, `*`, `+`, `-`, `/` and three names —
 * and `Function` over exactly those is the whole of it. If the expression
 * ever grows a construct this cannot read, this test fails loudly rather
 * than quietly agreeing.
 */
function evaluateExpression(
  expression: string, a: number, b: number, n: number,
): number {
  const body = `"use strict"; return (${expression});`;
  // eslint-disable-next-line no-new-func
  const run = new Function('A', 'B', 'N', 'max', body) as
    (A: number, B: number, N: number, max: typeof Math.max) => number;
  return run(a, b, n, Math.max);
}

const MIXING = Object.values(TRANSITIONS).filter((style) => style.frames > 0);

describe('one ramp, two consumers', () => {
  it('agrees at every frame of every style the table has', () => {
    expect(MIXING.length).toBeGreaterThan(1);
    for (const style of MIXING) {
      const expression = mixExpression(style, style.frames);
      for (let n = 0; n < style.frames; n += 1) {
        const want = mixAt(style, n, style.frames);
        expect(evaluateExpression(expression, 1, 0, n), `${style.id} A at ${n}`)
          .toBeCloseTo(want.a, 9);
        expect(evaluateExpression(expression, 0, 1, n), `${style.id} B at ${n}`)
          .toBeCloseTo(want.b, 9);
      }
    }
  });

  /*
   * AND AT LENGTHS THE TABLE DOES NOT HAVE, because an author sets those
   * now. An agreement that held only for ten and twenty-four frames would
   * be an agreement about two numbers.
   */
  it('agrees at every length an author can set', () => {
    for (const style of MIXING) {
      for (const frames of [1, 2, 3, 5, 9, 17, 31, 60]) {
        const expression = mixExpression(style, frames);
        for (let n = 0; n < frames; n += 1) {
          const want = mixAt(style, n, frames);
          expect(evaluateExpression(expression, 1, 0, n),
            `${style.id} ${frames}f A at ${n}`).toBeCloseTo(want.a, 9);
          expect(evaluateExpression(expression, 0, 1, n),
            `${style.id} ${frames}f B at ${n}`).toBeCloseTo(want.b, 9);
        }
      }
    }
  });

  /*
   * THE DISCRIMINATOR. If `evaluateExpression` silently returned the same
   * thing as `mixAt` — because it had been written from it, or because
   * both were zero — everything above would pass while proving nothing.
   * So: the two styles must DISAGREE with each other, and the evaluator
   * must track the expression rather than the function.
   */
  it('and the comparison can tell two ramps apart', () => {
    const dissolve = TRANSITIONS['dissolve']!;
    const fade = TRANSITIONS['fade']!;
    const middle = (style: Transition) =>
      mixAt(style, Math.floor(style.frames / 2), style.frames);
    /* Halfway through a dissolve both pictures are half there; halfway
       through a fade there is nothing on screen at all. */
    expect(middle(dissolve).a + middle(dissolve).b).toBeCloseTo(1, 1);
    expect(middle(fade).a + middle(fade).b).toBeCloseTo(0, 1);

    /* And the evaluator reads the string it is given, not a remembered one. */
    expect(evaluateExpression('A*0.25+B*0.75', 1, 0, 0)).toBeCloseTo(0.25, 9);
  });
});

describe('the ends of the overlap', () => {
  /*
   * FRAME ZERO IS ENTIRELY THE OUTGOING PICTURE AND THE LAST IS ENTIRELY
   * THE INCOMING ONE. `mixExpression` already says why it divides by
   * `frames - 1`: dividing by `frames` leaves the overlap one frame short
   * of finishing, which is a flicker back to the old shot at the join.
   */
  it('start on one picture and end on the other', () => {
    for (const style of MIXING) {
      const first = mixAt(style, 0, style.frames);
      const last = mixAt(style, style.frames - 1, style.frames);
      expect(first.a, `${style.id} first`).toBeCloseTo(1, 9);
      expect(first.b, `${style.id} first`).toBeCloseTo(0, 9);
      expect(last.a, `${style.id} last`).toBeCloseTo(0, 9);
      expect(last.b, `${style.id} last`).toBeCloseTo(1, 9);
    }
  });

  /*
   * A CUT IS NOT A LENGTH OF TIME, so it has no partway. Asked anyway —
   * which the preview does, because a control does not get to assume its
   * input — it answers with the picture that is actually on screen.
   */
  it('answer for a cut without pretending it has an overlap', () => {
    const cut = TRANSITIONS['cut']!;
    expect(mixAt(cut, 0, 0)).toEqual({ a: 1, b: 0 });
    expect(mixAt(cut, 1, 0)).toEqual({ a: 0, b: 1 });
    expect(overlapSplit(cut)).toEqual({ before: 0, after: 0 });
  });

  /* A one-frame mix is a cut drawn the long way, and must not divide by zero. */
  it('survive a one-frame mix', () => {
    for (const style of MIXING) {
      const only = mixAt(style, 0, 1);
      expect(Number.isFinite(only.a), style.id).toBe(true);
      expect(Number.isFinite(only.b), style.id).toBe(true);
    }
  });
});
