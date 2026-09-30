/**
 * A virtual set is a scene, not a picture.  [CHANNEL §27, §28, C-14]
 *
 * *"Background and Virtual Set should not be the same thing."*
 *
 * What is tested is the thing that makes it a scene rather than a
 * swatch: it names an arrangement the rest of the product already
 * shares, it is described in fractions so one set works at any size, and
 * it cannot name a room this product does not know how to light.
 */

import { describe, expect, it } from 'vitest';

import {
  type VirtualSet, VIRTUAL_SETS,
  arrangementIn, holds, inFront, place, setById, unlightable,
} from '../../src/domain/virtualSet.js';
import { LAYOUTS } from '../../src/domain/presentation.js';
import { SPACE_LOOKS } from '../../src/domain/environment.js';

describe('the sets', () => {
  it('are there, and each says what it is for', () => {
    expect(VIRTUAL_SETS.length).toBeGreaterThanOrEqual(3);
    for (const set of VIRTUAL_SETS) {
      expect(set.label.length).toBeGreaterThan(0);
      expect(set.says.length).toBeGreaterThan(10);
    }
  });

  it('have distinct ids', () => {
    const ids = VIRTUAL_SETS.map((one) => one.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('name a room this product can light', () => {
    /* A set naming a space `SPACE_LOOKS` has not got would throw at the
       moment somebody put it on air. */
    expect(unlightable()).toEqual([]);
    for (const set of VIRTUAL_SETS) expect(SPACE_LOOKS[set.spaceId]).toBeDefined();
    /* And the rule bites: a set naming a room nobody drew is named. */
    expect(unlightable([{ ...VIRTUAL_SETS[0]!, id: 'x', spaceId: 'atlantis' }]))
      .toEqual(['x']);
  });

  it('name arrangements the composition engine actually has', () => {
    /* A set carrying its own geometry would be a second answer to
       "where does the second person go", and the two would differ in an
       export. [D-19] */
    for (const set of VIRTUAL_SETS) {
      for (const id of Object.values(set.positions)) {
        expect(LAYOUTS[id], `${set.id} names ${id}`).toBeDefined();
      }
    }
  });

  it('hold at least one person each, starting at one', () => {
    for (const set of VIRTUAL_SETS) {
      expect(set.positions[1]).toBeDefined();
      expect(holds(set)).toBe(
        Math.max(...Object.keys(set.positions).map(Number)));
    }
  });

  it('is found by id, and nothing is found by a wrong one', () => {
    expect(setById('news_desk')?.label).toBe('News Desk');
    expect(setById('atlantis')).toBeNull();
    expect(setById(undefined)).toBeNull();
  });
});

describe('everything is in fractions of the frame', () => {
  const inside = (r: { x: number; y: number; w: number; h: number }) =>
    r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0
    && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001;

  it('keeps every piece inside the frame', () => {
    for (const set of VIRTUAL_SETS) {
      for (const piece of set.furniture) {
        expect(inside(piece.rect), `${set.id} ${piece.kind}`).toBe(true);
      }
      expect(inside(set.logo), `${set.id} logo`).toBe(true);
      expect(inside(set.lowerThird), `${set.id} lower third`).toBe(true);
    }
  });

  it('places a fraction at any size, and the same place at both', () => {
    const rect = { x: 0.25, y: 0.5, w: 0.5, h: 0.25 };
    expect(place(rect, { w: 1280, h: 720 }))
      .toEqual({ x: 320, y: 360, w: 640, h: 180 });
    /* The same set, drawn for an export at twice the size, is the same
       composition rather than a scaled-up thumbnail of one. */
    const big = place(rect, { w: 2560, h: 1440 });
    expect(big.x / 2560).toBeCloseTo(rect.x);
    expect(big.w / 2560).toBeCloseTo(rect.w);
  });
});

describe('what is drawn in front of the people', () => {
  it('is the desk, and only the desk', () => {
    /* A desk in FRONT is what makes it a desk rather than a wall: the
       bottom of a person disappears behind it and they stop being a
       cutout standing on air. */
    expect(inFront({
      kind: 'desk', rect: { x: 0, y: 0, w: 1, h: 1 },
      face: '#000', top: '#111',
    })).toBe(true);
    expect(inFront({
      kind: 'riser', rect: { x: 0, y: 0, w: 1, h: 1 }, face: '#000',
    })).toBe(false);
    expect(inFront({
      kind: 'screen', rect: { x: 0, y: 0, w: 1, h: 1 },
      frame: '#000', glass: '#111',
    })).toBe(false);
  });

  it('puts a lower third clear of the desk it shares a set with', () => {
    /* `marksFor` places a lower third by CORNER, which is right for
       somebody's own room and wrong for a set with a desk in it — a
       name on the desk's front edge is a name nobody can read. */
    for (const set of VIRTUAL_SETS) {
      const desk = set.furniture.find((one) => one.kind === 'desk');
      if (!desk) continue;
      expect(set.lowerThird.y + set.lowerThird.h,
        `${set.id}'s lower third overlaps its desk`)
        .toBeLessThanOrEqual(desk.rect.y + 0.0001);
    }
  });
});

describe('a set that is asked for more people than it was drawn for', () => {
  const desk = VIRTUAL_SETS.find((one) => one.id === 'news_desk')!;

  it('gives each count its own arrangement where it has one', () => {
    expect(arrangementIn(desk, 1)).toBe('performance_full');
    expect(arrangementIn(desk, 2)).toBe('performance_half');
  });

  it('falls back rather than refusing', () => {
    /* A third guest arriving mid-programme must not black the picture
       out. A set that could only hold its own number is a set nobody
       dares switch to while on air. */
    expect(arrangementIn(desk, 3)).toBe('performance_half');
    expect(arrangementIn(desk, 9)).toBe('performance_half');
  });

  it('never returns nothing, for any count', () => {
    for (const set of VIRTUAL_SETS) {
      for (const count of [0, 1, 2, 3, 4, 5, 8]) {
        const id = arrangementIn(set, count);
        expect(LAYOUTS[id], `${set.id} at ${count}`).toBeDefined();
      }
    }
  });

  it('treats nobody, and a negative number, as one', () => {
    expect(arrangementIn(desk, 0)).toBe(arrangementIn(desk, 1));
    expect(arrangementIn(desk, -3)).toBe(arrangementIn(desk, 1));
  });
});

describe('a set is not a background', () => {
  it('carries what a background does not', () => {
    /* §27's list: background, presenter positions, desk/table, screens,
       logos, lower-third region, lighting, programme graphics. A
       `SpaceLook` has the first and none of the rest. */
    const set: VirtualSet = VIRTUAL_SETS[0]!;
    expect(set.spaceId).toBeTruthy();
    expect(Object.keys(set.positions).length).toBeGreaterThan(0);
    expect(set.furniture.length).toBeGreaterThan(0);
    expect(set.logo).toBeTruthy();
    expect(set.lowerThird).toBeTruthy();
    expect(typeof set.light).toBe('number');
  });

  it('lights the people for the room they are standing in', () => {
    const stage = setById('stage')!;
    const news = setById('news_desk')!;
    /* A stage is dark and a news studio is flat and bright: a face
       carried into one from the other has to move. */
    expect(stage.light).toBeLessThan(0);
    expect(news.light).toBeGreaterThan(0);
  });

  it('covers the furniture §27 names, across the catalogue', () => {
    /* *"The virtual set can contain: background, presenter positions,
       desk/table, screens, logos, lower-third region, lighting,
       programme graphics."* Not every set needs every piece — a stage
       has no desk — but a catalogue with no screen in it anywhere is a
       catalogue that has quietly lost one of the eight. */
    const kinds = new Set(VIRTUAL_SETS.flatMap(
      (set) => set.furniture.map((one) => one.kind)));
    expect([...kinds].sort()).toEqual(['band', 'desk', 'riser', 'screen']);
    for (const set of VIRTUAL_SETS) {
      expect(set.furniture.length, `${set.id} has no furniture`)
        .toBeGreaterThan(0);
    }
  });

  it('has at least one set with a desk and one without', () => {
    const hasDesk = (set: VirtualSet) =>
      set.furniture.some((one) => one.kind === 'desk');
    expect(VIRTUAL_SETS.some(hasDesk)).toBe(true);
    expect(VIRTUAL_SETS.some((one) => !hasDesk(one))).toBe(true);
  });
});
