/**
 * Standing in the room, rather than in front of a picture of it.
 * [Doctrine STUDIO-TWO §4, S-6; D-19, U-16]
 *
 * THE MATTE WAS NEVER THE PROBLEM. It is differenced against the room's own
 * measured noise, eroded, dilated twice and feathered, and the edge it
 * produces is clean. A clean edge is exactly what makes a composite look
 * wrong, because nothing in a real room has one.
 *
 * Two things were missing and both are about light: a person in a room is
 * LIT BY THAT ROOM, so its colour lands on the edge of their shoulder; and
 * a person in a room STANDS ON SOMETHING, so there is a shadow. With
 * neither, the eye reads "pasted" long before it can say why.
 *
 * NEITHER IS A NEW CONTROL, which is the part worth testing. The room
 * already declares where its light is and how strong; everything here is
 * derived from that, so choosing Concert Stage gets a concert stage's wrap
 * without anybody being asked a question about compositing.
 */
import { describe, expect, it } from 'vitest';

import {
  SPACE_LOOKS, type SpaceLook, bandIsFloor, brightnessOf, darken,
  defocusFor, floorOf, groundingFor, mix,
} from '../../src/domain/environment.js';

const look = (over: Partial<SpaceLook>): SpaceLook => ({
  id: 'x', label: 'X', top: '0x808080', bottom: '0x808080',
  glow: { x: 0.5, y: 0.3, colour: '0xffffff', strength: 0.5 },
  vignette: 1, grain: 10, depth: 0.5, ...over,
});

describe('brightness of a wash', () => {
  it('reads black, white and grey', () => {
    expect(brightnessOf('0x000000')).toBe(0);
    expect(brightnessOf('0xffffff')).toBeCloseTo(1, 5);
    expect(brightnessOf('0x808080')).toBeCloseTo(0.502, 2);
  });

  it('weights green above red above blue, as an eye does', () => {
    expect(brightnessOf('0x00ff00')).toBeGreaterThan(brightnessOf('0xff0000'));
    expect(brightnessOf('0xff0000')).toBeGreaterThan(brightnessOf('0x0000ff'));
  });

  it('answers something usable for a string that is not a colour', () => {
    /* A space with a typo in its wash must not take the whole render
       down over a number nobody can see. */
    expect(brightnessOf('nonsense')).toBe(0.5);
  });
});

describe('how a room lands on the person in it (§4)', () => {
  it('wraps more light from a bright room than a dark one', () => {
    const bright = groundingFor(look({ top: '0xffffff', bottom: '0xffffff' }));
    const dark = groundingFor(look({ top: '0x000000', bottom: '0x000000' }));
    expect(bright.wrap).toBeGreaterThan(dark.wrap);
  });

  it('throws a deeper shadow from a stronger light', () => {
    const hard = groundingFor(look({
      glow: { x: 0.5, y: 0.3, colour: '0xffffff', strength: 1 } }));
    const soft = groundingFor(look({
      glow: { x: 0.5, y: 0.3, colour: '0xffffff', strength: 0 } }));
    expect(hard.shadow).toBeGreaterThan(soft.shadow);
  });

  it('falls away from the light, never towards it', () => {
    /* The room already says where its light pool is. A shadow that
       ignored that would contradict the backdrop it is drawn on. */
    const fromLeft = groundingFor(look({
      glow: { x: 0.1, y: 0.3, colour: '0xffffff', strength: 0.5 } }));
    const fromRight = groundingFor(look({
      glow: { x: 0.9, y: 0.3, colour: '0xffffff', strength: 0.5 } }));
    expect(fromLeft.shadowX).toBeGreaterThan(0);
    expect(fromRight.shadowX).toBeLessThan(0);
  });

  it('puts the shadow under a high light and behind a low one', () => {
    const high = groundingFor(look({
      glow: { x: 0.5, y: 0.05, colour: '0xffffff', strength: 0.5 } }));
    const low = groundingFor(look({
      glow: { x: 0.5, y: 0.9, colour: '0xffffff', strength: 0.5 } }));
    expect(low.shadowY).toBeGreaterThan(high.shadowY);
  });

  it('is always downward, whatever the light is doing', () => {
    for (const y of [0, 0.25, 0.5, 0.75, 1]) {
      expect(groundingFor(look({
        glow: { x: 0.5, y, colour: '0xffffff', strength: 0.5 } }))
        .shadowY).toBeGreaterThan(0);
    }
  });

  it('keeps a ceiling on both, because this is a correction not an effect', () => {
    /* Wrap past about a third eats the performer's own edge, and a
       shadow past about half is a second person on the floor. */
    for (const one of Object.values(SPACE_LOOKS)) {
      const g = groundingFor(one);
      expect(g.wrap, `${one.id} wrap`).toBeGreaterThan(0);
      expect(g.wrap, `${one.id} wrap`).toBeLessThanOrEqual(0.34);
      expect(g.shadow, `${one.id} shadow`).toBeGreaterThan(0);
      expect(g.shadow, `${one.id} shadow`).toBeLessThanOrEqual(0.48);
    }
  });

  it('holds even for a space whose numbers are at their limits', () => {
    /* A space added tomorrow is grounded correctly by existing, so the
       clamps have to survive the extremes rather than the middle. */
    const wild = groundingFor(look({
      top: '0xffffff', bottom: '0xffffff',
      glow: { x: 0, y: 1, colour: '0xffffff', strength: 1 } }));
    expect(wild.wrap).toBeLessThanOrEqual(0.34);
    expect(wild.shadow).toBeLessThanOrEqual(0.48);
    expect(Math.abs(wild.shadowX)).toBeLessThan(0.1);
  });

  it('gives the same answer twice, so the shot cache means what it says', () => {
    /* Derived rather than stored, and derived deterministically: U-16
       caches a shot by its plan, and a backdrop that drifted between
       renders would make that cache a liar. */
    for (const one of Object.values(SPACE_LOOKS)) {
      expect(groundingFor(one)).toEqual(groundingFor(one));
    }
  });

  it('grounds every space this product ships', () => {
    expect(Object.keys(SPACE_LOOKS).length).toBeGreaterThan(5);
    for (const one of Object.values(SPACE_LOOKS)) {
      expect(Number.isFinite(groundingFor(one).wrap), one.id).toBe(true);
    }
  });
});

/**
 * How deep the room is, which is the one thing colour cannot say.
 * [Doctrine STUDIO-TWO §4, S-6; D-06, D-19]
 *
 * Everything `groundingFor` needs is implied by the light and the walls.
 * Depth is not: a cathedral and a vocal booth can be the same colour and
 * the same brightness and be forty metres apart. Nothing already on the
 * record knows that, so the record has to say it — and `depth` is
 * required rather than optional so a space added tomorrow has to answer
 * the question rather than silently being a cupboard.
 */
describe('how far back the room goes', () => {
  it('is declared by every space this product ships', () => {
    for (const one of Object.values(SPACE_LOOKS)) {
      expect(typeof one.depth, one.id).toBe('number');
      expect(one.depth, one.id).toBeGreaterThanOrEqual(0);
      expect(one.depth, one.id).toBeLessThanOrEqual(1);
    }
  });

  it('puts the small rooms nearer than the big ones', () => {
    /* Not a number anybody has to defend to the decimal, but a vocal
       booth behind a cathedral would be a plain mistake. */
    expect(SPACE_LOOKS['recording_studio']!.depth)
      .toBeLessThan(SPACE_LOOKS['church']!.depth);
    expect(SPACE_LOOKS['modern_room']!.depth)
      .toBeLessThan(SPACE_LOOKS['concert_stage']!.depth);
    expect(SPACE_LOOKS['beach']!.depth).toBeGreaterThan(0.9);
  });

  it('softens the far wall more than the near one', () => {
    /* A camera focused on a performer does not also focus on the wall
       behind them, and the further back that wall is the less it does. */
    const far = defocusFor(look({ depth: 1 }), 1080);
    const near = defocusFor(look({ depth: 0 }), 1080);
    expect(far).toBeGreaterThan(near);
  });

  it('keeps it small, because this is a backdrop and not a portrait lens', () => {
    /* A cathedral blurred to a smear is a different error from a
       cathedral blurred not at all, and the second at least keeps the
       place recognisable. */
    expect(defocusFor(look({ depth: 1 }), 1080)).toBeLessThan(8);
    expect(defocusFor(look({ depth: 0 }), 1080)).toBeGreaterThanOrEqual(1);
  });

  it('means the same thing at any output size', () => {
    /* Expressed against the frame's smaller side, so the same room is
       the same room on a phone and on a master. [D-06] */
    const small = defocusFor(look({ depth: 1 }), 540);
    const large = defocusFor(look({ depth: 1 }), 1080);
    expect(large).toBeGreaterThan(small);
    expect(large / small).toBeGreaterThan(1.5);
  });
});

describe('a band is two different things', () => {
  it('calls one that reaches the bottom a floor', () => {
    expect(bandIsFloor({ y: 0.86, height: 0.14, colour: '0x000000' })).toBe(true);
    expect(bandIsFloor({ y: 0.82, height: 0.18, colour: '0x000000' })).toBe(true);
  });

  it('and one that does not a line', () => {
    /* Beach's runs from 0.62 for six hundredths of the frame: a sea
       line, a horizon, a rule across the picture — not the ground. */
    expect(bandIsFloor({ y: 0.62, height: 0.06, colour: '0x000000' })).toBe(false);
    expect(bandIsFloor(undefined)).toBe(false);
  });

  it('agrees with the spaces that actually have floors', () => {
    expect(bandIsFloor(SPACE_LOOKS['concert_stage']!.band)).toBe(true);
    expect(bandIsFloor(SPACE_LOOKS['modern_room']!.band)).toBe(true);
    expect(bandIsFloor(SPACE_LOOKS['beach']!.band)).toBe(false);
    expect(bandIsFloor(SPACE_LOOKS['church']!.band)).toBe(false);
  });
});

describe('a colour further from the light', () => {
  it('keeps the colour and takes the light', () => {
    /* Mixing towards black rather than to another hue is what makes it
       the same floor further off, rather than a second surface. */
    expect(darken('0xffffff', 0.5)).toBe('0x808080');
    expect(darken('0x804020', 0)).toBe('0x804020');
    expect(darken('0x804020', 1)).toBe('0x000000');
  });

  it('keeps the ratios between the channels', () => {
    const was = { r: 0x80, g: 0x40, b: 0x20 };
    const now = darken('0x804020', 0.5);
    expect(now).toBe('0x402010');
    expect(was.r / was.g).toBeCloseTo(0x40 / 0x20, 5);
  });

  it('hands back a colour it cannot read rather than a broken one', () => {
    expect(darken('nonsense', 0.5)).toBe('nonsense');
  });
});

describe('the ground, and where it meets the wall', () => {
  it('gives a floor to the six spaces that had none', () => {
    /* Four declared a band reaching the bottom, one a sea line, and the
       other six were a wash, a light pool, a vignette and some grain. A
       cathedral rendered as a brown gradient is not a cathedral. */
    for (const id of ['recording_studio', 'university_hall', 'church',
      'theatre', 'forest', 'night_studio']) {
      expect(floorOf(SPACE_LOOKS[id]!), id).not.toBeNull();
    }
  });

  it('leaves a declared floor its own colour', () => {
    const stage = floorOf(SPACE_LOOKS['concert_stage']!)!;
    expect(stage.from).toBe(SPACE_LOOKS['concert_stage']!.band!.colour);
    expect(stage.y).toBe(SPACE_LOOKS['concert_stage']!.band!.y);
  });

  it('and gives a sea line no floor at all', () => {
    /* Beach's band is a horizon, not the ground, and the wash below it
       is already sand. */
    expect(floorOf(SPACE_LOOKS['beach']!)).toBeNull();
  });

  it('puts the line lower in a small room than a large one', () => {
    /*
     * GEOMETRY, NOT TASTE. Stand close to a wall and the line where it
     * meets the floor is LOW in the frame: a lot of wall, little
     * ground. Stand at the back of a nave and it rises.
     */
    const near = floorOf(look({ depth: 0.1 }))!;
    const far = floorOf(look({ depth: 1 }))!;
    expect(near.y).toBeGreaterThan(far.y);
  });

  it('lights the far edge and lets the near edge fall away', () => {
    /*
     * THE FIRST VERSION DARKENED BOTH ENDS, which is wrong in exactly
     * the rooms that needed it most: darkening a near-black hall by
     * half gives another near-black, and the floor was measurable and
     * invisible. A floor is lit from above.
     */
    const dark = floorOf(look({
      bottom: '0x05030a', depth: 0.8,
      glow: { x: 0.5, y: 0.2, colour: '0xffffff', strength: 0.9 },
    }))!;
    expect(brightnessOf(dark.from)).toBeGreaterThan(brightnessOf(dark.to));
  });

  it('takes the light’s colour, not white', () => {
    /* A purple stage gets a purple floor and a candle-lit nave a warm
       one. Mixing to white would give every room the same floor. */
    const purple = floorOf(look({
      bottom: '0x101010', depth: 0.8,
      glow: { x: 0.5, y: 0.2, colour: '0xff00ff', strength: 1 },
    }))!;
    const n = Number.parseInt(purple.from.replace('0x', ''), 16);
    expect((n >> 16) & 255).toBeGreaterThan((n >> 8) & 255);
    expect(n & 255).toBeGreaterThan((n >> 8) & 255);
  });
});

describe('two colours, part of the way between', () => {
  it('ends where it is told to', () => {
    expect(mix('0x000000', '0xffffff', 0)).toBe('0x000000');
    expect(mix('0x000000', '0xffffff', 1)).toBe('0xffffff');
    expect(mix('0x000000', '0xffffff', 0.5)).toBe('0x808080');
  });

  it('clamps rather than overshooting', () => {
    expect(mix('0x000000', '0xffffff', 2)).toBe('0xffffff');
    expect(mix('0x000000', '0xffffff', -1)).toBe('0x000000');
  });

  it('hands back the first colour when it cannot read the second', () => {
    expect(mix('0x102030', 'nonsense', 0.5)).toBe('0x102030');
  });
});
