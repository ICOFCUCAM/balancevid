/**
 * The channels this viewer keeps.  [CHANNEL §2, D-03, D-04, N-9]
 *
 *     HOME · LIVE · GUIDE · CHANNELS · SEARCH · FAVORITES
 *
 * The one entry in the brief's own navigation that `/tv` did not
 * have. Per device, because `/tv` is served before any sign-in
 * and most of the people who will ever see it have no account.
 */

import { describe, expect, it } from 'vitest';

import {
  FAVORITES_KEY, MOST_FAVORITES, favoritesAmong, isFavorite,
  readFavorites, withFavorite, withoutFavorite,
} from '../../src/domain/favorites.js';
import { dialOrder } from '../../src/domain/registry.js';

const of = (...slugs: string[]) => JSON.stringify(slugs);

describe('reading what is actually in storage (N-9)', () => {
  it('reads a list a browser wrote', () => {
    expect(readFavorites(of('apple', 'mango'))).toEqual(['apple', 'mango']);
  });

  it('reads nothing from nothing', () => {
    expect(readFavorites(null)).toEqual([]);
    expect(readFavorites(undefined)).toEqual([]);
    expect(readFavorites('')).toEqual([]);
  });

  /*
   * NEVER A THROW, for the reason `readLineup` never throws: this
   * is on the path of every public television page, and a
   * directory that breaks because a stored value was truncated is
   * worse than a directory with no stars on it. [D-21]
   */
  it('reads nothing from rubbish rather than throwing', () => {
    expect(readFavorites('{')).toEqual([]);
    expect(readFavorites('not json at all')).toEqual([]);
    expect(readFavorites('"a string"')).toEqual([]);
    expect(readFavorites('{"apple":true}')).toEqual([]);
    expect(readFavorites('42')).toEqual([]);
  });

  it('drops an entry that is not a slug', () => {
    expect(readFavorites('["apple",7,null,{"x":1},"mango",""]'))
      .toEqual(['apple', 'mango']);
  });

  it('normalises and de-duplicates, so the count counts channels', () => {
    expect(readFavorites(of(' Apple ', 'apple', 'APPLE', 'mango')))
      .toEqual(['apple', 'mango']);
  });

  /*
   * A BOUND ON A VALUE THAT COMES OUT OF STORAGE, where another
   * tab's bug or a hand-edited entry can put anything. This list
   * is read on every page, and an unbounded one is a page that
   * stops responding.
   */
  it('stops at the cap, whatever the stored value says', () => {
    const many = Array.from({ length: MOST_FAVORITES + 50 }, (_, at) => `ch${at}`);
    expect(readFavorites(JSON.stringify(many)).length).toBe(MOST_FAVORITES);
  });

  it('has a key, so two readers cannot disagree about where it is', () => {
    expect(FAVORITES_KEY).toContain('favorites');
  });
});

describe('starring and unstarring (N-9)', () => {
  it('adds one and knows it is there', () => {
    const list = withFavorite([], 'apple');
    expect(list).toEqual(['apple']);
    expect(isFavorite(list, 'apple')).toBe(true);
    expect(isFavorite(list, 'mango')).toBe(false);
  });

  it('normalises what it is given, both ways', () => {
    const list = withFavorite([], '  Apple ');
    expect(list).toEqual(['apple']);
    expect(isFavorite(list, 'APPLE')).toBe(true);
    expect(withoutFavorite(list, ' APPLE ')).toEqual([]);
  });

  it('adds nothing twice', () => {
    expect(withFavorite(['apple'], 'apple')).toEqual(['apple']);
    expect(withFavorite(['apple'], 'APPLE')).toEqual(['apple']);
  });

  it('adds nothing at all for an empty slug', () => {
    expect(withFavorite(['apple'], '   ')).toEqual(['apple']);
  });

  /* Never in place: the caller holds React state. */
  it('answers a new list and leaves the old one alone', () => {
    const was = ['apple'];
    expect(withFavorite(was, 'mango')).not.toBe(was);
    expect(was).toEqual(['apple']);
    expect(withoutFavorite(was, 'apple')).not.toBe(was);
    expect(was).toEqual(['apple']);
  });

  it('removes one that is not there without complaint', () => {
    expect(withoutFavorite(['apple'], 'mango')).toEqual(['apple']);
  });

  /*
   * APPENDED, so starring a channel does not rewrite every other
   * entry. The order shown is `favoritesAmong`'s, not this one's.
   */
  it('appends, keeping the stored order stable', () => {
    expect(withFavorite(['apple', 'mango'], 'zebra'))
      .toEqual(['apple', 'mango', 'zebra']);
  });

  /* The oldest goes when it is full: the thing just chosen is the
     thing the viewer wants. */
  it('drops the oldest when the list is full', () => {
    const full = Array.from({ length: MOST_FAVORITES }, (_, at) => `ch${at}`);
    const next = withFavorite(full, 'new-one');
    expect(next.length).toBe(MOST_FAVORITES);
    expect(next[next.length - 1]).toBe('new-one');
    expect(next).not.toContain('ch0');
    expect(next).toContain('ch1');
  });
});

describe('the favourites a viewer actually has (N-9)', () => {
  const all = [
    { slug: 'zebra', name: 'Zebra', number: 100 },
    { slug: 'apple', name: 'Apple', number: 102 },
    { slug: 'mango', name: 'Mango', number: 101 },
  ];

  /*
   * DOWN THE DIAL, by the same comparator the M3U uses: a
   * favourites list is a personal lineup, and a lineup is read in
   * the order the numbers go. The directory is alphabetical
   * because browsing is reading names; this is not browsing.
   */
  it('runs down the numbers, not down the stored order', () => {
    expect(favoritesAmong(all, ['apple', 'zebra', 'mango'])
      .map((one) => one.slug)).toEqual(['zebra', 'mango', 'apple']);
  });

  /*
   * A SLUG NOBODY ANSWERS TO IS DROPPED, NOT SHOWN AS A GAP. A
   * station can be unpublished or made private after somebody
   * stars it, and a page listing a channel that 404s looks broken
   * when the truth is the channel went away.
   */
  it('drops a favourite that is no longer in the directory', () => {
    expect(favoritesAmong(all, ['apple', 'gone-away'])
      .map((one) => one.slug)).toEqual(['apple']);
  });

  it('answers nothing for a viewer who has starred nothing', () => {
    expect(favoritesAmong(all, [])).toEqual([]);
  });

  it('leaves the channels it was given alone', () => {
    const was = [...all];
    favoritesAmong(all, ['apple', 'zebra']);
    expect(all).toEqual(was);
  });

  /* A channel the lineup never numbered still appears, at the end. */
  it('keeps an unnumbered favourite, below the numbered ones', () => {
    const plus = [...all, { slug: 'new', name: 'New Channel' }];
    expect(favoritesAmong(plus, ['new', 'apple'])
      .map((one) => one.slug)).toEqual(['apple', 'new']);
  });
});

describe('one order for both lineups (N-9)', () => {
  /*
   * `dialOrder` IS SHARED WITH THE M3U rather than copied. Two
   * comparators would be two answers to what order a dial is in.
   */
  it('puts a channel with no number last, from either side', () => {
    expect(dialOrder({ number: 0, name: 'A' }, { number: 100, name: 'Z' }))
      .toBeGreaterThan(0);
    expect(dialOrder({ number: 100, name: 'Z' }, { number: 0, name: 'A' }))
      .toBeLessThan(0);
  });

  it('runs up the numbers and breaks a tie by name', () => {
    expect(dialOrder({ number: 100, name: 'Z' }, { number: 101, name: 'A' }))
      .toBeLessThan(0);
    expect(dialOrder({ number: 100, name: 'Apple' }, { number: 100, name: 'Zebra' }))
      .toBeLessThan(0);
  });
});
