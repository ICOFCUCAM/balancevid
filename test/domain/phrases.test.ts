/**
 * Where somebody is singing.  [MASTER-EDIT §16, C-L1; L3]
 *
 * Tested against signals written down here rather than against a song,
 * which is the difference between a rule the product can defend and one
 * that happened to work on the track it was written against.
 */

import { describe, expect, it } from 'vitest';

import {
  ABOVE_FLOOR, BREATH_MS, SHORTEST_MS, WINDOW_MS,
  floorOf, levelsOf, phrasesIn,
} from '../../src/domain/phrases.js';

const RATE = 48000;

/** A signal built out of loud and quiet stretches, in milliseconds. */
function signal(parts: { ms: number; loud: boolean }[]): Float32Array {
  const total = parts.reduce((sum, one) => sum + Math.round(RATE * one.ms / 1000), 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    const width = Math.round(RATE * part.ms / 1000);
    for (let i = 0; i < width; i += 1) {
      /* An alternating sign, so the RMS is the amplitude rather than
         a DC offset that a filter would remove. */
      out[at + i] = (part.loud ? 0.5 : 0.02) * (i % 2 === 0 ? 1 : -1);
    }
    at += width;
  }
  return out;
}

const ms = (samples: number) => Math.round((samples / RATE) * 1000);

describe('the quiet of a track', () => {
  it('is the tenth percentile, not the minimum', () => {
    /* A digital silence of one sample makes the minimum zero, and every
       multiple of zero is zero. */
    const levels = [0, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    expect(floorOf(levels)).toBe(5);
  });

  it('is nothing for nothing', () => {
    expect(floorOf([])).toBe(0);
  });

  it('does not mutate what it was given', () => {
    const levels = [9, 1, 5];
    floorOf(levels);
    expect(levels).toEqual([9, 1, 5]);
  });
});

describe('the loudness of a stretch', () => {
  it('is the root mean square, per window', () => {
    const flat = new Float32Array(RATE).fill(0.5);
    const levels = levelsOf(flat, RATE);
    expect(levels).toHaveLength(Math.floor(1000 / WINDOW_MS));
    for (const level of levels) expect(level).toBeCloseTo(0.5, 5);
  });

  it('ignores a tail too short to fill a window', () => {
    const short = new Float32Array(Math.round(RATE * WINDOW_MS / 1000) - 1);
    expect(levelsOf(short, RATE)).toEqual([]);
  });
});

describe('finding the phrases', () => {
  it('finds one sung stretch between two quiet ones', () => {
    const found = phrasesIn(signal([
      { ms: 1000, loud: false },
      { ms: 2000, loud: true },
      { ms: 1000, loud: false },
    ]), RATE);
    expect(found).toHaveLength(1);
    expect(ms(found[0]!.fromSample)).toBeGreaterThanOrEqual(960);
    expect(ms(found[0]!.fromSample)).toBeLessThanOrEqual(1040);
    expect(ms(found[0]!.toSample)).toBeGreaterThanOrEqual(2960);
    expect(ms(found[0]!.toSample)).toBeLessThanOrEqual(3080);
  });

  it('finds two, separated by a rest', () => {
    const found = phrasesIn(signal([
      { ms: 500, loud: false },
      { ms: 1500, loud: true },
      { ms: 1200, loud: false },
      { ms: 1500, loud: true },
      { ms: 500, loud: false },
    ]), RATE);
    expect(found).toHaveLength(2);
    expect(found[1]!.fromSample).toBeGreaterThan(found[0]!.toSample);
  });

  it('keeps a breath inside its phrase', () => {
    /* A breath between lines is 150–350ms and a rest between phrases is
       longer. Splitting on a breath puts a caption mid-sentence. */
    const found = phrasesIn(signal([
      { ms: 500, loud: false },
      { ms: 1000, loud: true },
      { ms: BREATH_MS - 150, loud: false },
      { ms: 1000, loud: true },
      { ms: 500, loud: false },
    ]), RATE);
    expect(found).toHaveLength(1);
  });

  it('splits on a rest longer than a breath', () => {
    const found = phrasesIn(signal([
      { ms: 500, loud: false },
      { ms: 1000, loud: true },
      { ms: BREATH_MS + 400, loud: false },
      { ms: 1000, loud: true },
      { ms: 500, loud: false },
    ]), RATE);
    expect(found).toHaveLength(2);
  });

  it('throws away a click too short to be a phrase', () => {
    const found = phrasesIn(signal([
      { ms: 1000, loud: false },
      { ms: SHORTEST_MS - 150, loud: true },
      { ms: 1000, loud: false },
      { ms: 1500, loud: true },
      { ms: 500, loud: false },
    ]), RATE);
    expect(found).toHaveLength(1);
    expect(ms(found[0]!.toSample - found[0]!.fromSample)).toBeGreaterThan(1000);
  });

  it('closes an open phrase at the end of the track', () => {
    /* A song that ends on the last note has no quiet after it. */
    const samples = signal([{ ms: 500, loud: false }, { ms: 2000, loud: true }]);
    const found = phrasesIn(samples, RATE);
    expect(found).toHaveLength(1);
    expect(found[0]!.toSample).toBeGreaterThan(samples.length * 0.9);
  });
});

describe('a track with no phrases in it', () => {
  it('finds none in silence', () => {
    expect(phrasesIn(new Float32Array(RATE * 4), RATE)).toEqual([]);
  });

  it('finds none in a track with no dynamics at all', () => {
    /* A sine tone, or a master limited flat. Saying nothing is better
       than cutting it at an arbitrary point — and `alignLyrics` refuses
       with a sentence naming the two ways out. */
    const flat = new Float32Array(RATE * 4);
    for (let i = 0; i < flat.length; i += 1) flat[i] = i % 2 === 0 ? 0.4 : -0.4;
    expect(phrasesIn(flat, RATE)).toEqual([]);
  });

  it('finds none in nothing at all', () => {
    expect(phrasesIn(new Float32Array(0), RATE)).toEqual([]);
  });

  it('refuses a rate of zero rather than returning nonsense', () => {
    /* Every window would be one sample wide and every phrase would run
       from sample zero to sample zero — output that looks like an
       answer. Checked with a real signal, because a zero-filled array
       returns nothing whatever the rate is. */
    const real = signal([
      { ms: 500, loud: false }, { ms: 1500, loud: true },
      { ms: 500, loud: false },
    ]);
    expect(phrasesIn(real, RATE)).toHaveLength(1);
    expect(phrasesIn(real, 0)).toEqual([]);
    expect(phrasesIn(real, -48000)).toEqual([]);
  });
});

describe('the threshold is relative, not absolute', () => {
  it('finds the same phrases in a quiet master and a loud one', () => {
    /* A song mastered quietly and the same song mastered loud have the
       same phrases; a fixed level would find them in one and not the
       other. */
    const parts = [
      { ms: 500, loud: false }, { ms: 1500, loud: true },
      { ms: 1200, loud: false }, { ms: 1500, loud: true },
    ];
    const loud = phrasesIn(signal(parts), RATE);
    const quiet = signal(parts).map((one) => one * 0.05) as unknown as Float32Array;
    const soft = phrasesIn(Float32Array.from(quiet), RATE);
    expect(soft).toHaveLength(loud.length);
    expect(ms(soft[0]!.fromSample)).toBeCloseTo(ms(loud[0]!.fromSample), -2);
  });

  it('uses the multiple it says it uses', () => {
    /* Raising the bar above the signal finds nothing, which proves the
       threshold is the thing deciding. */
    const parts = [
      { ms: 500, loud: false }, { ms: 1500, loud: true },
      { ms: 500, loud: false },
    ];
    expect(phrasesIn(signal(parts), RATE, { aboveFloor: ABOVE_FLOOR }))
      .toHaveLength(1);
    expect(phrasesIn(signal(parts), RATE, { aboveFloor: 1000 })).toEqual([]);
  });
});
