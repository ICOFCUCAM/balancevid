/**
 * Where a performer's eyes are, measured once.
 * [Doctrine STUDIO-TWO §4, S-6, S-35; D-06]
 *
 * THE HORIZON IN ANY PHOTOGRAPH SITS AT THE HEIGHT OF THE LENS, which is
 * why a scene's eyeline is simply its horizon and why matching the two is
 * the whole trick: a person whose eyes sit on the drawn horizon is a
 * person standing in that room, and one whose eyes float above it is a
 * person standing in front of a picture of it.
 *
 * THE FIXTURES ARE SILHOUETTES WRITTEN DOWN. A row profile is how many
 * pixels of that row differ from the empty room, so a person is a narrow
 * run of rows on top of a wide run of rows, and a test can draw one in a
 * line of code. No renderer is needed to ask whether the arithmetic is
 * right, which is the same split `measurePlate` uses.
 */
import { describe, expect, it } from 'vitest';

import {
  EYES_DOWN_THE_HEAD, ROW_FLOOR, SHOULDER_HOLDS, SHOULDER_JUMP, eyelineFrom,
} from '../../src/domain/eyeline.js';

const W = 100;

/** `head` rows of `headWide`, then `body` rows of `bodyWide`, in a frame. */
function figure({ sky = 10, head = 10, headWide = 10, body = 40,
  bodyWide = 40, floor = 10 }): number[] {
  return [
    ...Array<number>(sky).fill(0),
    ...Array<number>(head).fill(headWide),
    ...Array<number>(body).fill(bodyWide),
    ...Array<number>(floor).fill(0),
  ];
}

describe('finding the eyes in a silhouette', () => {
  it('puts them halfway down the head', () => {
    /* Crown at row 10, shoulders at row 20, so the eyes are row 15 of a
       70-row frame. The oldest proportion in drawing a face. */
    const found = eyelineFrom(figure({}), W)!;
    expect(found.crown).toBeCloseTo(10 / 70, 5);
    expect(found.chin).toBeCloseTo(20 / 70, 5);
    expect(found.at).toBeCloseTo(15 / 70, 5);
  });

  it('follows the head up and down the frame', () => {
    const high = eyelineFrom(figure({ sky: 2 }), W)!;
    const low = eyelineFrom(figure({ sky: 30 }), W)!;
    expect(high.at).toBeLessThan(low.at);
  });

  it('finds the shoulders by the step, not by the row above', () => {
    /*
     * Hair and a collar both make a single row jump and neither is a
     * shoulder, so the comparison is against the widest row seen so
     * far. A head that widens gently must not be read as shoulders.
     */
    const hair = [
      ...Array<number>(10).fill(0),
      8, 9, 11, 12, 13, 14, 15, 16, 17, 18,
      ...Array<number>(40).fill(60),
      ...Array<number>(10).fill(0),
    ];
    const found = eyelineFrom(hair, W)!;
    expect(found.chin).toBeCloseTo(20 / 70, 5);
  });

  it('says nothing at all for an empty frame', () => {
    /* A real answer: an empty frame has no eyeline, and inventing one
       would put a room's horizon through thin air. */
    expect(eyelineFrom(Array<number>(70).fill(0), W)).toBeNull();
    expect(eyelineFrom([], W)).toBeNull();
    expect(eyelineFrom(figure({}), 0)).toBeNull();
  });

  it('ignores the stray pixels the matte would erode away', () => {
    /* One pixel in a hundred, in a row of sky. Above zero and below the
       floor, which is the whole point: the first version of this test
       put a ZERO there, so a mutation that dropped the floor entirely
       changed nothing and survived. */
    const speckled = figure({});
    speckled[2] = 1;
    expect(1).toBeLessThan(W * ROW_FLOOR);
    const found = eyelineFrom(speckled, W)!;
    expect(found.crown).toBeCloseTo(10 / 70, 5);
  });

  it('does not mistake a collar for a pair of shoulders', () => {
    /*
     * THE CASE THAT TOOK A MUTATION TO FIND. A head of ten with one row
     * of nineteen in it — a collar, a headset band, a hand raised past
     * the face. Both the rule this used and the rule a mutation swapped
     * it for called that row the shoulders and missed the real ones
     * eight rows below. Shoulders are wide and STAY wide.
     */
    const collar = [
      ...Array<number>(10).fill(0),
      10, 10, 10, 10, 19, 10, 10, 10,
      ...Array<number>(20).fill(40),
      ...Array<number>(10).fill(0),
    ];
    const found = eyelineFrom(collar, W)!;
    /* 10 sky + 8 head + 20 shoulders + 10 floor = 48 rows. */
    expect(found.chin).toBeCloseTo(18 / 48, 5);
  });

  it('and does not need the step to last for ever', () => {
    /* Three rows is a pair of shoulders; the figure may end soon after,
       and a take cropped at the chest is still a take. */
    const cropped = [
      ...Array<number>(10).fill(0),
      ...Array<number>(8).fill(10),
      ...Array<number>(4).fill(40),
    ];
    expect(eyelineFrom(cropped, W)!.chin).toBeCloseTo(18 / 22, 5);
  });

  it('measures a figure with no step in it rather than refusing', () => {
    /*
     * A head-and-shoulders cropped above the shoulders, or somebody
     * facing away. There is still a head and its top is still known, so
     * the head is a seventh of the figure rather than no answer.
     */
    const column = [
      ...Array<number>(10).fill(0),
      ...Array<number>(56).fill(30),
      ...Array<number>(4).fill(0),
    ];
    const found = eyelineFrom(column, W)!;
    expect(found.at).toBeGreaterThan(found.crown);
    expect(found.chin).toBeCloseTo((10 + 56 / 7) / 70, 5);
  });

  it('reports how much of the frame they fill', () => {
    const wide = eyelineFrom(figure({ bodyWide: 90 }), W)!;
    const narrow = eyelineFrom(figure({ bodyWide: 20 }), W)!;
    expect(wide.covers).toBeGreaterThan(narrow.covers);
    expect(wide.covers).toBeLessThanOrEqual(1);
    expect(narrow.covers).toBeGreaterThan(0);
  });

  it('keeps every answer inside the frame', () => {
    for (const sky of [0, 5, 30, 60]) {
      const found = eyelineFrom(figure({ sky, floor: 0 }), W);
      if (!found) continue;
      for (const v of [found.at, found.crown, found.chin]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('holds the proportions it is built on where a reader can see them', () => {
    /* Three numbers decide this measurement, and a reader comparing it
       against a drawing manual should not have to grep for them. */
    expect(EYES_DOWN_THE_HEAD).toBe(0.5);
    expect(SHOULDER_JUMP).toBeGreaterThan(1);
    expect(SHOULDER_HOLDS).toBeGreaterThan(1);
    expect(ROW_FLOOR).toBeGreaterThan(0);
    expect(ROW_FLOOR).toBeLessThan(0.1);
  });
});
