/**
 * One scene, told once.
 * [Doctrine STUDIO-TWO §4, S-34; CHANNEL §27; D-19]
 *
 * The brief drew eight fields and asked for a reusable scene system
 * rather than *"a collection of individually decorated pictures"*.
 * Measured, that diagram was not a specification for a new system: it
 * was a checklist against TWO that already existed. Seven of the eight
 * fields were there, and two of those seven — the performer zone and
 * the foreground elements — were reachable only from Online TV.
 *
 * So this tests a JOIN, not a new model. The sharpest thing it can
 * assert is that joining changed nothing about either side: the rooms
 * answer what they always answered, the sets answer what they always
 * answered, and Studio Two can now read the two fields it could not.
 */
import { describe, expect, it } from 'vitest';

import { SPACE_LOOKS, floorOf, perspectiveOf } from '../../src/domain/environment.js';
import { VIRTUAL_SETS, inFront, setById } from '../../src/domain/virtualSet.js';
import { horizonOf, sceneFor, sceneOf } from '../../src/domain/scene.js';

const room = SPACE_LOOKS['church']!;

describe('the horizon, whichever way the space said it', () => {
  it('is the band where a space declares one', () => {
    /* Both kinds: Concert Stage's reaches the bottom and is the ground,
       Beach's is a sea line. Both are the horizon. */
    expect(horizonOf(SPACE_LOOKS['concert_stage']!)).toBe(0.86);
    expect(horizonOf(SPACE_LOOKS['beach']!)).toBe(0.62);
  });

  it('is the derived floor where it does not', () => {
    expect(horizonOf(room)).toBe(floorOf(room)!.y);
  });

  it('exists for every space this product ships', () => {
    for (const one of Object.values(SPACE_LOOKS)) {
      expect(horizonOf(one), one.id).not.toBeNull();
    }
  });
});

describe('a plain drawn room', () => {
  const scene = sceneOf(room);

  it('keeps the six fields it always had', () => {
    expect(scene.background).toBe(room);
    expect(scene.depth).toBe(room.depth);
    expect(scene.lighting.glow).toBe(room.glow);
    expect(scene.floor).toEqual(floorOf(room));
    expect(scene.perspective).toEqual(perspectiveOf(room));
    expect(scene.horizon).toBe(horizonOf(room));
  });

  it('says where the ground under a person is, and it is not the horizon', () => {
    /* At the horizon they are pressed against the back wall. Halfway
       down the visible floor is where somebody stands in a room. */
    expect(scene.performer.standsAt).toBeGreaterThan(scene.horizon!);
    expect(scene.performer.standsAt).toBeLessThan(1);
  });

  it('puts the eyeline on the horizon, which is not a coincidence', () => {
    /*
     * The horizon in any photograph sits at the height of the lens, so
     * a person of roughly the camera operator's height has their eyes
     * ON it. The oldest rule in staging a shot, needing no new data,
     * and the reference the eyeline work will measure a take against.
     */
    expect(scene.performer.eyeline).toBe(scene.horizon);
  });

  it('has no opinion about how many people are standing in it', () => {
    /* A room has an opinion about its floor and none about a head
       count. That belongs to a set. */
    expect(scene.performer.positions).toEqual({});
  });

  it('and nothing in front of anybody', () => {
    expect(scene.foreground).toEqual([]);
    expect(scene.behind).toEqual([]);
  });
});

describe('a set standing in a room', () => {
  const set = setById('news_desk')!;
  const scene = sceneOf(SPACE_LOOKS[set.spaceId]!, set);

  it('is named for the set and lit by the room', () => {
    expect(scene.id).toBe('news_desk');
    expect(scene.label).toBe(set.label);
    expect(scene.background.id).toBe(set.spaceId);
  });

  it('brings the two fields Studio Two could not reach', () => {
    expect(scene.performer.positions).toEqual(set.positions);
    expect(scene.foreground.length + scene.behind.length)
      .toBe(set.furniture.length);
  });

  it('keeps the desk in front and everything else behind', () => {
    /* The single ordering that makes a composite read as a studio: the
       bottom of a presenter disappears behind the desk. */
    for (const one of scene.foreground) expect(inFront(one)).toBe(true);
    for (const one of scene.behind) expect(inFront(one)).toBe(false);
    expect(scene.foreground.some((one) => one.kind === 'desk')).toBe(true);
  });

  it('carries the set’s own lighting adjustment', () => {
    expect(scene.lighting.adjust).toBe(set.light);
  });

  it('still answers the room’s questions about the room', () => {
    /* A set is not a new space, and joining must not have made it one. */
    const bare = sceneOf(SPACE_LOOKS[set.spaceId]!);
    expect(scene.floor).toEqual(bare.floor);
    expect(scene.perspective).toEqual(bare.perspective);
    expect(scene.horizon).toBe(bare.horizon);
  });
});

describe('resolving from what a document stores', () => {
  it('finds a room by its id', () => {
    expect(sceneFor({ spaceId: 'church' })!.background.id).toBe('church');
  });

  it('lets a set name its own room, and the set wins', () => {
    const scene = sceneFor({ spaceId: 'beach', setId: 'news_desk' })!;
    expect(scene.id).toBe('news_desk');
    expect(scene.background.id).toBe(setById('news_desk')!.spaceId);
  });

  it('answers nothing for a room nobody drew', () => {
    expect(sceneFor({ spaceId: 'no_such_room' })).toBeNull();
    expect(sceneFor({})).toBeNull();
  });

  it('treats an unknown set as no set rather than an error', () => {
    /* `setIdentity` refuses to store one at the door; refusing a second
       time here would take a channel off the air over a word nobody can
       see. */
    expect(sceneFor({ spaceId: 'church', setId: 'no_such_set' })!.id)
      .toBe('church');
  });

  it('builds a scene for every set and every room that ships', () => {
    for (const one of Object.values(SPACE_LOOKS)) {
      expect(sceneFor({ spaceId: one.id }), one.id).not.toBeNull();
    }
    for (const one of VIRTUAL_SETS) {
      const scene = sceneFor({ setId: one.id });
      expect(scene, one.id).not.toBeNull();
      expect(scene!.horizon, one.id).not.toBeNull();
    }
  });
});
