/**
 * One person, composited.  [CHANNEL §26, §27, C-14; STUDIO-TWO §4]
 *
 * The parameters both compositors read — the live canvas and ffmpeg — so
 * a background chosen in the control room and the same background in an
 * export cannot be two different pictures. The assertions that matter are
 * the ones about what is POSSIBLE: a space behind somebody nothing
 * separates from their room is the composite that looks like a mistake,
 * and the product's answer is to say so rather than to draw it.
 */

import { describe, expect, it } from 'vitest';

import {
  type Composition,
  BLUR_SIGMA, CENTRED, CHROMA_DEFAULTS, NO_COMPOSITION, SPACE_SHELVES,
  boxFor, drawable, keyFor, spaceOf, whyNoBackdrop,
} from '../../src/domain/composition.js';
import {
  type RoomPlate,
  MATTE_USABLE_QUALITY, SPACE_LOOKS, matteFeather, matteThreshold,
} from '../../src/domain/environment.js';

const plate = (over: Partial<RoomPlate> = {}): RoomPlate => ({
  assetId: 'asset_x' as RoomPlate['assetId'],
  noise: 0.02, quality: 0.85, width: 1920, height: 1080,
  capturedAt: '2026-09-30T10:00:00.000Z',
  ...over,
});

describe('the background library is an order over one table', () => {
  it('shelves every space, and shelves none twice', () => {
    const shelved = SPACE_SHELVES.flatMap((shelf) => shelf.spaceIds);
    expect([...shelved].sort()).toEqual(Object.keys(SPACE_LOOKS).sort());
    expect(new Set(shelved).size).toBe(shelved.length);
  });

  it('shelves nothing this product cannot light', () => {
    /* A shelf naming a space `SPACE_LOOKS` does not have is a swatch the
       renderer would throw on. */
    for (const shelf of SPACE_SHELVES) {
      for (const id of shelf.spaceIds) expect(SPACE_LOOKS[id]).toBeDefined();
    }
  });

  it('is the three shelves the brief drew', () => {
    expect(SPACE_SHELVES.map((one) => one.id))
      .toEqual(['studio', 'performance', 'places']);
    expect(SPACE_SHELVES.every((one) => one.says.length > 0)).toBe(true);
  });
});

describe('which key a person can have', () => {
  it('prefers a green screen, which the brief ranks higher', () => {
    const key = keyFor({ greenScreen: true, plate: plate() });
    expect(key.kind).toBe('chroma');
    if (key.kind === 'chroma') {
      expect(key.similarity).toBe(CHROMA_DEFAULTS.similarity);
      expect(key.colour).toBe(CHROMA_DEFAULTS.colour);
    }
  });

  it('measures the plate rather than choosing numbers', () => {
    const room = plate({ noise: 0.05, quality: 0.6 });
    const key = keyFor({ plate: room });
    expect(key.kind).toBe('plate');
    if (key.kind === 'plate') {
      /* The same two functions the ffmpeg path uses, so the live key and
         the exported key are the same key. */
      expect(key.threshold).toBe(matteThreshold(room));
      expect(key.feather).toBe(matteFeather(room));
    }
  });

  it('gives a noisy room a forgiving key and a clean one a tight key', () => {
    const noisy = keyFor({ plate: plate({ noise: 0.08 }) });
    const clean = keyFor({ plate: plate({ noise: 0.01 }) });
    if (noisy.kind === 'plate' && clean.kind === 'plate') {
      expect(noisy.threshold).toBeGreaterThan(clean.threshold);
    } else { expect.unreachable(); }
  });

  it('softens the edge further when the plate will not hold up', () => {
    const poor = keyFor({ plate: plate({ quality: MATTE_USABLE_QUALITY - 0.1 }) });
    const good = keyFor({ plate: plate({ quality: 0.9 }) });
    if (poor.kind === 'plate' && good.kind === 'plate') {
      expect(poor.feather).toBeGreaterThan(good.feather);
    } else { expect.unreachable(); }
  });

  it('has no key when there is neither', () => {
    expect(keyFor({}).kind).toBe('none');
  });
});

describe('what the studio says when it cannot', () => {
  it('says nothing when there is a key', () => {
    expect(whyNoBackdrop(keyFor({ plate: plate() }))).toBeNull();
    expect(whyNoBackdrop(keyFor({ greenScreen: true }))).toBeNull();
  });

  it('names both of the two things to do', () => {
    const said = whyNoBackdrop({ kind: 'none' });
    expect(said).toContain('plate');
    expect(said).toContain('green screen');
  });
});

describe('what the compositor will actually draw', () => {
  const with_ = (over: Partial<Composition>): Composition =>
    ({ ...NO_COMPOSITION, ...over });

  it('draws their own room with no key at all', () => {
    expect(drawable(with_({ backdrop: { kind: 'none' } }))).toBe(true);
  });

  it('draws a blur with no key, which is the honest middle', () => {
    /* Softening one picture needs no decision about any pixel. */
    expect(drawable(with_({ backdrop: { kind: 'blur' } }))).toBe(true);
  });

  it('refuses a space with no key', () => {
    /* A concert stage behind somebody nothing separates from their
       bedroom is the composite that looks like a mistake. */
    expect(drawable(with_({ backdrop: { kind: 'space', spaceId: 'church' } })))
      .toBe(false);
  });

  it('draws a space once there is a key', () => {
    expect(drawable(with_({
      backdrop: { kind: 'space', spaceId: 'church' },
      key: keyFor({ plate: plate() }),
    }))).toBe(true);
    expect(drawable(with_({
      backdrop: { kind: 'space', spaceId: 'church' },
      key: keyFor({ greenScreen: true }),
    }))).toBe(true);
  });

  it('knows a space it can light from one it cannot', () => {
    expect(spaceOf({ kind: 'space', spaceId: 'church' })).toBe('church');
    expect(spaceOf({ kind: 'space', spaceId: 'atlantis' })).toBeNull();
    expect(spaceOf({ kind: 'blur' })).toBeNull();
    expect(spaceOf({ kind: 'none' })).toBeNull();
  });

  it('shares the render path’s own blur', () => {
    expect(BLUR_SIGMA).toBe(24);
  });
});

describe('where the person sits in it', () => {
  const panel = { w: 1280, h: 720 };
  const source = { w: 1280, h: 720 };

  it('covers the panel when nothing is asked of it', () => {
    const box = boxFor(CENTRED, panel, source);
    expect(box).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });

  it('letterboxes nothing for a taller source', () => {
    /* A person in a 3:4 phone camera fills the panel and is cropped, not
       pillarboxed into a strip in the middle of a virtual studio. */
    const box = boxFor(CENTRED, panel, { w: 720, h: 1280 });
    expect(box.w).toBeGreaterThanOrEqual(panel.w);
    expect(box.h).toBeGreaterThanOrEqual(panel.h);
  });

  it('moves them without resizing them', () => {
    const moved = boxFor({ ...CENTRED, x: 0.25 }, panel, source);
    const base = boxFor(CENTRED, panel, source);
    expect(moved.w).toBe(base.w);
    expect(moved.x).toBe(base.x - panel.w * 0.25);
  });

  it('scales about the point they were placed at', () => {
    const big = boxFor({ ...CENTRED, scale: 2 }, panel, source);
    expect(big.w).toBe(2560);
    /* Still centred: the centre is the anchor, not the top left. */
    expect(big.x + big.w / 2).toBeCloseTo(panel.w / 2);
    expect(big.y + big.h / 2).toBeCloseTo(panel.h / 2);
  });

  it('crops from the source and keeps the panel covered', () => {
    const cropped = boxFor({ ...CENTRED, crop: 0.25 }, panel, source);
    expect(cropped.h).toBeGreaterThanOrEqual(panel.h);
  });

  it('refuses to vanish or to explode', () => {
    /* A scale somebody dragged to zero is a black panel nobody can undo
       by looking at it. */
    expect(boxFor({ ...CENTRED, scale: 0 }, panel, source).w).toBeGreaterThan(0);
    expect(boxFor({ ...CENTRED, scale: 99 }, panel, source).w)
      .toBeLessThanOrEqual(panel.w * 4);
    expect(boxFor({ ...CENTRED, crop: 1 }, panel, source).h)
      .toBeGreaterThan(0);
    expect(Number.isFinite(
      boxFor({ ...CENTRED, crop: -5 }, panel, source).h)).toBe(true);
  });

  it('survives a source that has not loaded yet', () => {
    const box = boxFor(CENTRED, panel, { w: 0, h: 0 });
    expect(Number.isFinite(box.w)).toBe(true);
    expect(Number.isFinite(box.h)).toBe(true);
  });
});
