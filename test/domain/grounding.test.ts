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
  SPACE_LOOKS, type SpaceLook, brightnessOf, groundingFor,
} from '../../src/domain/environment.js';

const look = (over: Partial<SpaceLook>): SpaceLook => ({
  id: 'x', label: 'X', top: '0x808080', bottom: '0x808080',
  glow: { x: 0.5, y: 0.3, colour: '0xffffff', strength: 0.5 },
  vignette: 1, grain: 10, ...over,
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
