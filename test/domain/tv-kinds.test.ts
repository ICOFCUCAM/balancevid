/**
 * The marks a category is drawn with.  [N-4, D-19, D-21]
 *
 * A lookup table keyed on a list in another file drifts from it
 * silently: this one held `sports`, `kids` and `film`, none of
 * which is a genre this product has, while `general`, `children`
 * and `talk`, which it does, fell through to the fallback. It
 * looked complete and was not.
 */

import { describe, expect, it } from 'vitest';

import { GENRES } from '../../src/domain/station.js';
import { GENRE_MARKS, asWord, markFor } from '../../app/tv/kinds.js';
import { identityFor, shelfFor } from '../../app/tv/art.js';

describe('a mark per kind (N-4)', () => {
  it('has one for every genre this product offers', () => {
    for (const genre of GENRES) {
      expect(GENRE_MARKS[genre], genre).toBeTruthy();
    }
  });

  /* The reverse, which is the half that drifted: three keys
     nothing could ever look up. */
  it('has none for a kind that is not a genre', () => {
    for (const key of Object.keys(GENRE_MARKS)) {
      expect(GENRES as readonly string[], key).toContain(key);
    }
  });

  /*
   * THE FALLBACK STAYS. A document on disk predates any list this
   * file knows about, and a row of icons with a hole in it reads
   * as a loading failure. [U-19]
   */
  it('still answers for a kind it has never heard of', () => {
    expect(markFor('documentary')).toBeTruthy();
    expect(markFor('MUSIC')).toBe(GENRE_MARKS.music);
  });
});

describe('a kind as a word (N-4)', () => {
  it('is a word and not a key', () => {
    expect(asWord('faith')).toBe('Faith');
    expect(asWord('entertainment')).toBe('Entertainment');
  });

  it('says nothing about nothing', () => {
    expect(asWord('')).toBe('');
  });
});

/*
 * A THING THAT CHANGES COLOUR BETWEEN TWO PAGES READS AS TWO
 * THINGS, which is why both grounds are hashes over a name and
 * not randoms.
 */
describe('the grounds (N-4, U-19)', () => {
  it('gives the same name the same colour every time', () => {
    expect(shelfFor('music')).toEqual(shelfFor('music'));
    expect(identityFor('music-house')).toEqual(identityFor('music-house'));
  });

  it('gives two names two colours', () => {
    expect(shelfFor('music')).not.toEqual(shelfFor('news'));
  });

  /*
   * A LOGO GROUND SITS BEHIND SOMEBODY ELSE'S MARK AND A
   * CATEGORY TILE HAS NOTHING IN FRONT OF IT. The muted ramp
   * borrowed straight across made twelve tiles look like twelve
   * switched-off screens.
   */
  it('draws a tile with more life in it than a logo well', () => {
    expect(shelfFor('music')).not.toEqual(identityFor('music'));
    expect(String(shelfFor('music').background)).toContain('64%');
    expect(String(identityFor('music').background)).toContain('42%');
  });
});
