/**
 * Where an element belongs, rather than where it was drawn.
 * [Doctrine STUDIO-TWO §4, S-38, S-40; CHANNEL §27]
 *
 * *"Describe where an element belongs in the scene, not where it
 * happened to be drawn in one frame."*
 *
 * S-38 rendered News Desk at four shapes and measured the performer
 * growing from a quarter of the width to four-fifths of it while the
 * screen stayed at `x = 0.56`. Nothing was broken: the rect was drawn
 * exactly where it said. The set element the viewer is meant to see was
 * simply behind the person, which is a statement about meaning rather
 * than about geometry.
 *
 * THE ANSWER IS NOT FOUR LAYOUTS. One relationship, resolved against
 * the frame in front of it.
 */
import { describe, expect, it } from 'vitest';

import {
  PERFORMER_OCCUPIES, SET_REFERENCE_ASPECT, occupiesAt, placedFor, sceneFor,
} from '../../src/domain/scene.js';
import { VIRTUAL_SETS } from '../../src/domain/virtualSet.js';

const scene = sceneFor({ setId: 'news_desk' })!;
const authored = scene.behind.find((one) => one.kind === 'screen')!;
const screenAt = (aspect: number) =>
  placedFor(scene, scene.behind, aspect).find((one) => one.kind === 'screen');

describe('how much of the frame a performer takes up', () => {
  it('is what the pixels measured, not an estimate of it', () => {
    /* S-38 read 25% off a rendered 16:9 frame. */
    expect(PERFORMER_OCCUPIES).toBe(0.25);
    expect(occupiesAt(scene.performer, SET_REFERENCE_ASPECT)).toBe(0.25);
  });

  it('matches every shape that was measured', () => {
    /*
     * The arithmetic was written to explain the measurement rather than
     * the measurement taken to confirm the arithmetic: S-38 read 25%,
     * 33%, 44% and 79% off four rendered frames.
     */
    const read: [number, number][] = [
      [1920 / 1080, 0.25], [1440 / 1080, 0.33],
      [1080 / 1080, 0.44], [608 / 1080, 0.79],
    ];
    for (const [aspect, measured] of read) {
      expect(occupiesAt(scene.performer, aspect), `${aspect}`)
        .toBeCloseTo(measured, 2);
    }
  });

  it('grows as the frame narrows, because cover crops the sides away', () => {
    expect(occupiesAt(scene.performer, 0.5))
      .toBeGreaterThan(occupiesAt(scene.performer, 1));
  });

  it('changes nothing in a wider frame, because cover crops the top', () => {
    /* There the performer keeps the share of the width they had. */
    expect(occupiesAt(scene.performer, 21 / 9)).toBe(PERFORMER_OCCUPIES);
    expect(occupiesAt(scene.performer, 4)).toBe(PERFORMER_OCCUPIES);
  });

  it('never claims more than the whole frame', () => {
    expect(occupiesAt(scene.performer, 0.05)).toBe(1);
  });

  it('answers something usable for a frame of no shape', () => {
    for (const bad of [0, -1, Number.NaN]) {
      expect(occupiesAt(scene.performer, bad)).toBe(PERFORMER_OCCUPIES);
    }
  });
});

describe('placing a piece for the frame in front of it', () => {
  it('leaves the frame the set was drawn for exactly as drawn', () => {
    /*
     * THE REGRESSION THIS EXISTS TO PREVENT. A first version pushed
     * every piece fully clear of the performer and moved this screen
     * from 0.56 to 0.65 at 16:9 — correcting the one frame the sets
     * were actually drawn for.
     */
    expect(screenAt(SET_REFERENCE_ASPECT)!.rect).toEqual(authored.rect);
  });

  it('keeps the gap it was drawn with as the frame changes', () => {
    /*
     * The screen sits sixty-five thousandths BEHIND the presenter's
     * shoulder, on purpose: a set element tucked slightly behind
     * somebody reads as a room, and one held at arm's length reads as
     * a diagram. That relationship travels.
     */
    const gap = (aspect: number) => {
      const edge = 0.5 + occupiesAt(scene.performer, aspect) / 2;
      return screenAt(aspect)!.rect.x - edge;
    };
    expect(gap(1440 / 1080)).toBeCloseTo(gap(SET_REFERENCE_ASPECT), 6);
    expect(gap(1080 / 1080)).toBeCloseTo(gap(SET_REFERENCE_ASPECT), 6);
  });

  it('shrinks into what is left rather than running off the frame', () => {
    for (const aspect of [1440 / 1080, 1080 / 1080, 608 / 1080]) {
      const s = screenAt(aspect);
      if (!s) continue;
      expect(s.rect.x + s.rect.w, `${aspect}`).toBeLessThanOrEqual(1.0001);
      expect(s.rect.w, `${aspect}`).toBeLessThanOrEqual(authored.rect.w);
    }
  });

  it('never leaves a piece overlapping the performer more than it was drawn to', () => {
    for (const aspect of [16 / 9, 4 / 3, 1, 0.5625]) {
      const s = screenAt(aspect);
      if (!s) continue;
      const edge = 0.5 + occupiesAt(scene.performer, aspect) / 2;
      expect(edge - s.rect.x, `${aspect}`).toBeLessThanOrEqual(0.0651);
    }
  });

  it('drops a piece there is no longer room for', () => {
    /* A set element squeezed to a stripe is not a smaller version of
       itself, it is a mark nobody can read. */
    expect(screenAt(0.2)).toBeUndefined();
  });

  it('returns a piece with no relationship exactly as authored', () => {
    /*
     * A band across the floor is a fact about the frame. Only an
     * element whose meaning is "beside the presenter" has anything to
     * resolve.
     *
     * CHECKED ACROSS EVERY SET, which a mutation made necessary.
     * Asserting it on News Desk's band alone proved nothing: that band
     * is authored at `x: 0`, so a mutation moving every unplaced piece
     * to zero changed it not at all and survived. Stage's riser sits
     * at 0.1, and that is the piece the claim needs.
     */
    let moveable = 0;
    for (const set of VIRTUAL_SETS) {
      const one = sceneFor({ setId: set.id })!;
      for (const aspect of [16 / 9, 1, 0.5625]) {
        const before = [...one.behind, ...one.foreground]
          .filter((piece) => !('placement' in piece && piece.placement));
        const after = [
          ...placedFor(one, one.behind, aspect),
          ...placedFor(one, one.foreground, aspect),
        ].filter((piece) => !('placement' in piece && piece.placement));
        expect(after, `${set.id} at ${aspect}`).toEqual(before);
        moveable += before.filter((piece) => piece.rect.x !== 0).length;
      }
    }
    /* And at least one of them was somewhere a move would show. */
    expect(moveable).toBeGreaterThan(0);
  });

  it('leaves the desk alone, which is every set that has one', () => {
    for (const aspect of [16 / 9, 1, 0.5625]) {
      expect(placedFor(scene, scene.foreground, aspect))
        .toEqual(scene.foreground);
    }
  });

  it('places a left-hand piece on the left', () => {
    const two = sceneFor({ setId: 'talk_show' });
    if (!two) return;
    const left = two.behind.find(
      (one) => 'placement' in one && one.placement?.side === 'left');
    if (!left) return;
    const out = placedFor(two, two.behind, 1)
      .find((one) => one.kind === 'screen' && one.rect.x < 0.5);
    expect(out).toBeDefined();
    expect(out!.rect.x).toBeLessThan(left.rect.x);
  });
});
