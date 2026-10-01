/**
 * The floor, in the pixels of one frame.  [STUDIO-TWO §4, S-33, S-37, S-41]
 *
 * THREE RENDERERS DRAW THIS ROOM — an ffmpeg chain for an export, a
 * WebGL shader for a participant on the air, and a 2D canvas for the
 * studio the channel is broadcasting from — and they have to put the
 * horizon in the same place or the control room is showing something
 * the audience will not get. `groundPlan` is the one answer they all
 * read; these are the questions it has to get right.
 */

import { describe, expect, it } from 'vitest';

import {
  type SpaceLook, SPACE_LOOKS, floorOf, lookFor,
} from '../../src/domain/environment.js';
import { groundPlan, lampOf, reachOf, sceneOf } from '../../src/domain/scene.js';
import { backdropChain } from '../../src/render/matte.js';

/**
 * A room with the numbers chosen so a wrong answer looks wrong.
 *
 * `depth` of 0.25 puts the derived horizon at 0.83, and 0.83 of 721 is
 * 598.43 — so a plan that floors instead of rounding, or rounds the
 * fraction instead of the pixels, lands somewhere else. A fixture at
 * 0.5 of 720 would agree with every one of those.
 */
function room(over: Partial<SpaceLook> = {}): SpaceLook {
  return {
    id: 'probe', label: 'Probe',
    top: '0x30405a', bottom: '0x101820',
    glow: { x: 0.4, y: 0.3, colour: '0xffd7a0', strength: 0.5 },
    vignette: 0.3, grain: 6, depth: 0.25, ...over,
  };
}

describe('the ground, in pixels', () => {
  it('turns the floor into the strip a renderer fills', () => {
    const plan = groundPlan(sceneOf(room()), 1281, 721)!;
    expect(plan).not.toBeNull();
    /* 0.74 + 0.12 * 0.75 = 0.83, and 0.83 of 721 is 598.43. */
    expect(plan.top).toBe(598);
    /* The strip runs from there to the bottom edge and no further. */
    expect(plan.deep).toBe(721 - 598);
  });

  it('is never a strip of nothing', () => {
    /*
     * A FLOOR AT THE VERY BOTTOM EDGE, which `bandIsFloor` accepts —
     * it asks only that the band reach past 0.99 — and which rounds to
     * a strip zero pixels deep.
     *
     * THE FIXTURE HAD TO BE THAT EXACT, and a first version at 0.999
     * was not: it rounds to 719 and leaves one pixel, so the guard and
     * its absence agreed and a mutation removing it survived. A value
     * that merely looks like an edge case is not one.
     *
     * Worth guarding rather than leaving to the renderers, because
     * they disagree about it: the chain asks ffmpeg for a gradient of
     * `1280x0` and the render fails outright, while the shader skips a
     * floor of no depth and draws on. An export that stops and a
     * broadcast that quietly differs is the worst of both.
     */
    const flush = room({ band: { y: 1, height: 0, colour: '0x222222' } });
    const plan = groundPlan(sceneOf(flush), 1280, 720)!;
    expect(plan.top).toBe(720);
    expect(plan.deep).toBe(1);
  });

  it('has no ground where the room has no ground', () => {
    /* Beach's band is a SEA LINE — a rule across the picture at 0.62 for
       six hundredths of it, nowhere near the bottom — and a horizon is
       not a plane. Nothing to stand on, so nothing to draw. */
    const beach = lookFor('beach');
    expect(beach.band).toBeDefined();
    expect(floorOf(beach)).toBeNull();
    expect(groundPlan(sceneOf(beach), 1280, 720)).toBeNull();
  });

  it('puts the vanishing point on the horizon and across the frame', () => {
    /* Off-centre on purpose: a plan that ignored `vanishX` would agree
       with a centred fixture and disagree with this one. */
    const plan = groundPlan(sceneOf(room({ vanishX: 0.25 })), 1280, 720)!;
    expect(plan.vanish).not.toBeNull();
    expect(plan.vanish!.at.x).toBe(320);
    /* At the top of the strip, which is where the floor meets the wall. */
    expect(plan.vanish!.at.y).toBe(0);
    /* And the light has fallen off by the near corner — the one closest
       to the lens and furthest from the point. */
    expect(plan.vanish!.faded).toEqual({ x: 0, y: plan.deep });
  });

  it('reaches from the point to that corner', () => {
    const plan = groundPlan(sceneOf(room({ vanishX: 0.25 })), 1280, 720)!;
    const reach = reachOf(plan.vanish!);
    expect(reach).toBeCloseTo(Math.hypot(320, plan.deep), 6);
    /* Which is further than either side of that triangle alone: a
       renderer taking the width or the depth for the radius would draw
       the light out to the wrong distance. */
    expect(reach).toBeGreaterThan(320);
    expect(reach).toBeGreaterThan(plan.deep);
  });

  it('converges harder the deeper the room says it is', () => {
    const near = groundPlan(sceneOf(room({ depth: 0.1 })), 1280, 720)!;
    const far = groundPlan(sceneOf(room({ depth: 0.9 })), 1280, 720)!;
    expect(far.vanish!.converge).toBeGreaterThan(near.vanish!.converge);
    /* And a long room's floor meets the wall HIGHER, which is the other
       half of standing at the back of a nave rather than in a booth. */
    expect(far.top).toBeLessThan(near.top);
  });
});

describe('the measurement reaches the pixels', () => {
  /*
   * S-37 MEASURED AN EYELINE AND NOTHING EVER DREW IT.
   *
   * `sceneOf` moves the room's horizon to where a performer's eyes
   * actually are, because a person whose eyes sit on the drawn horizon
   * is standing in that room and one whose eyes float above it is
   * standing in front of a picture of it. The chain then asked the
   * ROOM for its floor and drew it back where the room's own depth had
   * put it — so the measurement was taken, stored, planned with, and
   * thrown away one call from the pixels.
   */
  it('draws the floor where the eyeline says, not where the room does', () => {
    const stage = lookFor('concert_stage');
    const own = floorOf(stage)!.y;
    expect(own).toBeCloseTo(0.86, 3);

    const measured = groundPlan(sceneOf(stage, null, 0.4), 1280, 720)!;
    expect(measured.top).toBe(288);
    /* Not the room's own horizon, which is where this used to land. */
    expect(measured.top).not.toBe(Math.round(own * 720));
  });

  it('and the perspective follows the floor it was moved to', () => {
    /* Two horizons — the one the eyes sit on and the one the ground
       meets — is worse than either alone, because the eye believes the
       ground. */
    const plan = groundPlan(sceneOf(lookFor('church'), null, 0.4), 1280, 720)!;
    expect(plan.vanish!.faded.y).toBe(plan.deep);
    expect(plan.top).toBe(288);
  });

  it('puts the same number into the filter graph', () => {
    const stage = lookFor('concert_stage');
    const at = (eyeline: number | null) => {
      const row = backdropChain(sceneOf(stage, null, eyeline), 1280, 720, 30, '1', 'o')
        .find((one) => one.includes('overlay='));
      return Number(/overlay=0:(\d+)/.exec(row ?? '')?.[1]);
    };
    expect(at(null)).toBe(Math.round(floorOf(stage)!.y * 720));
    expect(at(0.4)).toBe(288);
  });

  it('leaves every unmeasured room exactly where it was', () => {
    /*
     * THE OTHER HALF OF THE CHANGE, AND THE ONE THAT COULD HAVE GONE
     * WRONG QUIETLY. Reading the floor through the scene must not move
     * a single room that nobody measured — eleven spaces, drawn the
     * same today as yesterday.
     */
    for (const [id, look] of Object.entries(SPACE_LOOKS)) {
      const ground = floorOf(look);
      const plan = groundPlan(sceneOf(look), 1280, 720);
      if (!ground) { expect(plan, id).toBeNull(); continue; }
      expect(plan!.top, id).toBe(Math.round(ground.y * 720));
      expect(plan!.from, id).toBe(ground.from);
      expect(plan!.to, id).toBe(ground.to);
    }
    /* And the loop above is worth something only if it saw both kinds. */
    const grounded = Object.values(SPACE_LOOKS).filter((one) => floorOf(one));
    expect(grounded.length).toBeGreaterThan(0);
    expect(grounded.length).toBeLessThan(Object.keys(SPACE_LOOKS).length);
  });
});

describe('the lamp, in pixels', () => {
  /*
   * THE NUMBER THREE RENDERERS HAD NEVER AGREED ON.
   *
   * The chain named the frame's CORNER as the far end of its radial
   * gradient — `x1=width:y1=height`, which is one past the last pixel
   * in both axes — and `gradients` handed a coordinate off the end
   * returns a radius with no relation to the geometry. The same rule
   * measured 393 pixels for a lamp at the middle of the frame, 84 for
   * Modern Room's and 584 for City's.
   *
   * So the circle is stated here, as a centre and a point on its edge,
   * because one renderer draws it from two points and two draw it from
   * a radius. Same shape as `groundPlan`, same reason.
   */
  it('is the room’s own glow, in whole pixels', () => {
    const lamp = lampOf(sceneOf(room({ glow: {
      x: 0.28, y: 0.3, colour: '0xffd7a0', strength: 0.55,
    } })), 1281, 721);
    expect(lamp.at).toEqual({ x: Math.round(0.28 * 1281), y: Math.round(0.3 * 721) });
    /* Whole, because a filter graph coordinate is an integer and a
       fraction in one is a fraction the other two would not have. */
    expect(Number.isInteger(lamp.at.x)).toBe(true);
    expect(Number.isInteger(lamp.at.y)).toBe(true);
    expect(lamp.colour).toBe('0xffd7a0');
    expect(lamp.strength).toBe(0.55);
  });

  it('reaches three tenths of the LONGER side', () => {
    /* Longer, not smaller and not the width: on 1280×720 those are
       three different numbers, which is what makes this fixture able
       to tell them apart. */
    expect(lampOf(sceneOf(room()), 1280, 720).reach).toBe(384);
    expect(lampOf(sceneOf(room()), 608, 1080).reach).toBe(324);
  });

  it('puts its edge exactly that far away', () => {
    for (const [w, h] of [[1280, 720], [608, 1080], [1080, 1080]]) {
      const lamp = lampOf(sceneOf(room({ glow: {
        x: 0.4, y: 0.3, colour: '0xffffff', strength: 1,
      } })), w!, h!);
      expect(Math.hypot(lamp.edge.x - lamp.at.x, lamp.edge.y - lamp.at.y))
        .toBeCloseTo(lamp.reach, 6);
    }
  });

  it('and puts it somewhere that exists, wherever the lamp is', () => {
    /*
     * THE CORNERS ARE THE FIXTURE. A lamp in the middle has room on
     * both sides and would agree with a rule that always went one way;
     * a lamp at 0 or 1 has room on exactly one, and that is the case
     * the old corner coordinate got wrong.
     */
    let hugged = 0;
    for (const [w, h] of [[1280, 720], [608, 1080], [1080, 1080]]) {
      for (const x of [0, 0.5, 1]) {
        for (const y of [0, 0.5, 1]) {
          const lamp = lampOf(sceneOf(room({ glow: {
            x, y, colour: '0xffffff', strength: 1,
          } })), w!, h!);
          const where = `${w}x${h} at ${x},${y}`;
          expect(lamp.edge.x, where).toBeGreaterThanOrEqual(0);
          expect(lamp.edge.x, where).toBeLessThan(w!);
          expect(lamp.edge.y, where).toBeGreaterThanOrEqual(0);
          expect(lamp.edge.y, where).toBeLessThan(h!);
          if (x === 0 || x === 1 || y === 0 || y === 1) hugged += 1;
        }
      }
    }
    /* And the loop is worth something only because it tried them. */
    expect(hugged).toBe(24);
  });

  it('steps along the longer axis', () => {
    /* Across a landscape frame and down a portrait one, because that
       is the axis with room to spare: half of it less a pixel beats
       three tenths of it for any frame wider than three. */
    const wide = lampOf(sceneOf(room()), 1280, 720);
    expect(wide.edge.y).toBe(wide.at.y);
    expect(wide.edge.x).not.toBe(wide.at.x);
    const tall = lampOf(sceneOf(room()), 608, 1080);
    expect(tall.edge.x).toBe(tall.at.x);
    expect(tall.edge.y).not.toBe(tall.at.y);
  });

  it('and away from the edge it is nearest', () => {
    const left = lampOf(sceneOf(room({ glow: {
      x: 0.1, y: 0.5, colour: '0xffffff', strength: 1,
    } })), 1280, 720);
    expect(left.edge.x).toBeGreaterThan(left.at.x);
    const right = lampOf(sceneOf(room({ glow: {
      x: 0.9, y: 0.5, colour: '0xffffff', strength: 1,
    } })), 1280, 720);
    expect(right.edge.x).toBeLessThan(right.at.x);
  });

  it('is the lamp the filter graph is given', () => {
    const look = lookFor('modern_room');
    const lamp = lampOf(sceneOf(look), 1280, 720);
    const row = backdropChain(sceneOf(look), 1280, 720, 30, '1', 'o')
      .find((one) => one.includes('type=radial') && one.includes('x1='))!;
    expect(row).toContain(`:x0=${lamp.at.x}:y0=${lamp.at.y}`);
    expect(row).toContain(`:x1=${lamp.edge.x}:y1=${lamp.edge.y}`);
    /* And never the frame's corner again, which is the coordinate that
       is one past the last pixel and started all this. */
    expect(row).not.toContain(':x1=1280:y1=720');
  });
});
