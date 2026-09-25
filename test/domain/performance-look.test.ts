/**
 * What identifies a take, and what is done to its picture.
 * [STUDIO-TWO §2, §4, §5, §7, U-18, U-20]
 *
 * The benchmark threads ONE COLOUR per take through four places at once: the
 * dot in the rail, the badge on the stage, the row in the timeline and every
 * block on the master video. A label alone means reading four words to find
 * out which strip is the beach.
 *
 * And it separates two things the model had as one: what is BEHIND the
 * performer, and what is done TO the picture.
 */
import { describe, expect, it } from 'vitest';

import { EFFECT_LOOKS, effectFor } from '../../src/domain/environment.js';
import { TAKE_ACCENTS, addTake, removeTake } from '../../src/domain/performanceEdit.js';
import { newPerformance } from '../../src/domain/performanceEdit.js';
import { LAYOUTS } from '../../src/domain/presentation.js';
import { HOUSE_SAMPLE_RATE } from '../../src/domain/time.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';

const SONG = HOUSE_SAMPLE_RATE * 120;

const master = (): MasterTrack => ({
  assetId: 'asset_song' as never, title: 'A song', class: 'own', durationSamples: SONG,
});

const take = (n: number, over: Partial<PerformanceTake> = {}): PerformanceTake => ({
  id: `take_${n}` as never,
  assetId: `asset_${n}` as never,
  label: `Take ${n}`,
  environment: { kind: 'original' },
  alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
  durationSamples: SONG,
  createdAt: `2026-01-0${n}T00:00:00.000Z`,
  ...over,
});

const performance = (): Performance =>
  newPerformance('A Performance', master(), '2026-01-01T00:00:00.000Z');

describe('the colour a take is known by (§2, §7)', () => {
  it('is given when the take is added, so nothing has to name it later', () => {
    const p = performance();
    addTake(p, take(1));
    expect(p.takes[0]!.accent).toBe(TAKE_ACCENTS[0]);
  });

  it('and every take gets a different one, in order', () => {
    const p = performance();
    for (let n = 1; n <= 4; n += 1) addTake(p, take(n));
    expect(p.takes.map((t) => t.accent))
      .toEqual(TAKE_ACCENTS.slice(0, 4));
    expect(new Set(p.takes.map((t) => t.accent)).size).toBe(4);
  });

  /*
   * A take that changed colour because another was deleted would relabel the
   * whole timeline underneath somebody mid-edit — the rail, the badges and
   * every block on the master video all at once.
   */
  it('and keeps it when another take is deleted', () => {
    const p = performance();
    for (let n = 1; n <= 3; n += 1) addTake(p, take(n));
    const third = p.takes[2]!.accent;
    removeTake(p, p.takes[0]!.id);
    expect(p.takes.find((t) => t.id === 'take_3')!.accent).toBe(third);
  });

  it('and a take that brought its own keeps that', () => {
    const p = performance();
    addTake(p, take(1, { accent: '#123456' }));
    expect(p.takes[0]!.accent).toBe('#123456');
  });

  /*
   * A room's colours separate PEOPLE; a performance's separate TAKES OF ONE
   * PERSON. One table would eventually put Sarah and Take 3 in the same
   * colour in a product that shows both.
   */
  it('from its own palette, not the room\'s', async () => {
    const { PARTICIPANT_ACCENTS } = await import('../../src/domain/roomEdit.js');
    expect(TAKE_ACCENTS).not.toEqual(PARTICIPANT_ACCENTS);
    expect(TAKE_ACCENTS[0]).not.toBe(PARTICIPANT_ACCENTS[0]);
  });
});

describe('the arrangements (§5, §6)', () => {
  it('has all four the benchmark offers', () => {
    expect(LAYOUTS['performance_full']).toBeDefined();
    expect(LAYOUTS['performance_half']).toBeDefined();
    expect(LAYOUTS['performance_quad']).toBeDefined();
    expect(LAYOUTS['performance_pip']).toBeDefined();
  });

  it('and picture-in-picture is one large and ONE small', () => {
    const pip = LAYOUTS['performance_pip']!;
    expect(pip.layers).toHaveLength(2);
    const [big, small] = pip.layers;
    expect(big!.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(small!.rect.w).toBeLessThan(0.4);
    // Above the fold of a vertical frame, where an app's own buttons are not.
    expect(small!.rect.y + small!.rect.h).toBeLessThan(0.5);
  });

  it('which is not the same thing as one large and two small', () => {
    expect(LAYOUTS['performance_focus']!.layers).toHaveLength(3);
  });
});

describe('effects, and what they are not (§4)', () => {
  it('offers four treatments, which is five tiles with None', () => {
    expect(Object.keys(EFFECT_LOOKS).sort())
      .toEqual(['colour', 'lighting', 'monochrome', 'spotlight']);
  });

  /*
   * Monochrome is the one treatment that is a decision about the whole
   * picture rather than a correction to it, and it is still an effect: it
   * happens over the composed panel, after the matte, like the other three.
   */
  it('and monochrome takes the colour out without flattening the picture', () => {
    const look = EFFECT_LOOKS['monochrome']!;
    expect(look.saturation).toBe(0);
    expect(look.contrast).toBeGreaterThan(1);
  });

  /*
   * Blur is NOT here, and that is the distinction. What is behind the
   * performer is the environment — their own room, a drawn space, their own
   * picture — and blurring it is a statement about the room. An effect is a
   * treatment over the composed panel.
   */
  it('and blur is an environment rather than an effect', async () => {
    expect(EFFECT_LOOKS['blur']).toBeUndefined();
    const { SPACES_ARE_DRAWN } = await import('../../src/domain/environment.js');
    expect(SPACES_ARE_DRAWN).toBeDefined();
  });

  it('no effect at all is the default, and costs nothing', () => {
    expect(effectFor(undefined)).toBeUndefined();
  });

  /*
   * A performance made against a look that was later removed renders
   * ungraded rather than refusing: the take is the work and the grade is a
   * decision about it.
   */
  it('and a look this build does not have renders ungraded, not broken', () => {
    expect(effectFor('kaleidoscope')).toBeUndefined();
  });

  it('each says what it is for, in the author\'s language', () => {
    for (const look of Object.values(EFFECT_LOOKS)) {
      expect(look.hint.length).toBeGreaterThan(10);
      expect(look.hint).not.toMatch(/§|U-\d|vignette=|eq=|ffmpeg/i);
    }
  });

  /*
   * Checked looks, not sliders — the same position the caption styles take. A
   * brightness control and a saturation control are a way to produce a
   * performance nobody can see, offered by the product that composited it.
   */
  it('and none of them can be turned up until the picture is gone', () => {
    for (const look of Object.values(EFFECT_LOOKS)) {
      if (look.brightness !== undefined) {
        expect(look.brightness).toBeGreaterThan(0.85);
        expect(look.brightness).toBeLessThan(1.25);
      }
      if (look.saturation !== undefined) expect(look.saturation).toBeLessThan(1.6);
      if (look.contrast !== undefined) expect(look.contrast).toBeLessThan(1.5);
    }
  });
});
