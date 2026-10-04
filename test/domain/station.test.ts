/**
 * A channel's public identity.  [CHANNEL §2, §3, D-04, D-18, N-1]
 *
 * > *"how does a viewer find their channel, distinguish it from
 * > every other BalanceVid channel, and tune into it like a real TV
 * > service?"*
 *
 * A channel had a name and an id, and the id is an address a
 * machine chose.
 */

import { describe, expect, it } from 'vitest';

import {
  CALLSIGN_LONGEST, GENRES, RESERVED_SLUGS, SLUG_LONGEST, SLUG_SHORTEST,
  callsignProblem, countrySays, languageSays, slugFor, slugProblem,
  stationSays,
} from '../../src/domain/station.js';

describe('the slug is an address (N-1)', () => {
  it('accepts what an address looks like', () => {
    for (const good of ['redemption-tv', 'rdtv', 'ch4', 'afrin-kong-tv', 'a1']) {
      expect(slugProblem(good), good).toBe(null);
    }
  });

  /*
   * REFUSED RATHER THAN REPAIRED. A slug is an address somebody will
   * print, and quietly turning what they typed into something else
   * is how a station ends up advertising a URL that is not theirs.
   */
  it('refuses what is not one, with a reason', () => {
    for (const bad of ['Redemption', 'rede mption', 'tv_1', '-tv', 'tv-',
      'a--b', 'é', 'x', ' rdtv', 'rdtv ']) {
      const said = slugProblem(bad);
      expect(said, bad).not.toBe(null);
      expect(said, bad).toBeTruthy();
    }
  });

  it('holds the length both ways', () => {
    expect(slugProblem('a'.repeat(SLUG_SHORTEST))).toBe(null);
    expect(slugProblem('a'.repeat(SLUG_SHORTEST - 1))).not.toBe(null);
    expect(slugProblem('a'.repeat(SLUG_LONGEST))).toBe(null);
    expect(slugProblem('a'.repeat(SLUG_LONGEST + 1))).not.toBe(null);
  });

  /* The directory owns some words, and refusing is free now. */
  it('keeps the directory’s own words', () => {
    for (const word of RESERVED_SLUGS) {
      expect(slugProblem(word), word).not.toBe(null);
    }
    expect(RESERVED_SLUGS).toContain('guide');
    expect(RESERVED_SLUGS).toContain('channels');
  });
});

describe('suggesting a slug (N-1)', () => {
  it('makes an address out of a station’s name', () => {
    expect(slugFor('Redemption TV')).toBe('redemption-tv');
    expect(slugFor('Afrin Kong TV')).toBe('afrin-kong-tv');
    expect(slugFor('Music House!!')).toBe('music-house');
  });

  /* Whatever it suggests must itself be allowed, always. */
  it('never suggests something it would refuse', () => {
    for (const name of ['Guide', 'TV', '!!!', 'é', 'a', '',
      'A'.repeat(200), '---', 'Channels', '24/7 News']) {
      const made = slugFor(name);
      expect(slugProblem(made), `${name} -> ${made}`).toBe(null);
    }
  });

  /*
   * TWO CHANNELS MAY SHARE A NAME AND MAY NOT SHARE AN ADDRESS,
   * which is what a directory of thousands guarantees will happen.
   */
  it('avoids a slug already taken', () => {
    expect(slugFor('Redemption TV', ['redemption-tv'])).toBe('redemption-tv-2');
    expect(slugFor('Redemption TV', ['redemption-tv', 'redemption-tv-2']))
      .toBe('redemption-tv-3');
  });

  it('stays inside the length even while avoiding', () => {
    const long = 'x'.repeat(SLUG_LONGEST);
    const made = slugFor(long, [long]);
    expect(made.length).toBeLessThanOrEqual(SLUG_LONGEST);
    expect(slugProblem(made)).toBe(null);
  });

  /* Accents are stripped, not guessed at: a wrong transliteration of
     somebody's name is worse than a shorter address. */
  it('strips accents rather than inventing a spelling', () => {
    expect(slugFor('Café Télé')).toBe('cafe-tele');
  });
});

describe('the callsign (N-1)', () => {
  it('is short and loud', () => {
    expect(callsignProblem('RDTV')).toBe(null);
    expect(callsignProblem('AKTV')).toBe(null);
    expect(callsignProblem('CH4')).toBe(null);
  });

  it('refuses a second name pretending to be a callsign', () => {
    expect(callsignProblem('REDEMPTION')).not.toBe(null);
    expect(callsignProblem('A'.repeat(CALLSIGN_LONGEST + 1))).not.toBe(null);
    expect(callsignProblem('A')).not.toBe(null);
    expect(callsignProblem('rdtv')).not.toBe(null);
    expect(callsignProblem('RD TV')).not.toBe(null);
    expect(callsignProblem(' RD')).not.toBe(null);
  });
});

describe('what a listing says (N-1)', () => {
  /* Only what is known. A channel that has set nothing gets nothing
     rather than a row of placeholders. */
  it('says nothing about a station that has said nothing', () => {
    expect(stationSays(undefined)).toBe('');
    expect(stationSays({ slug: 'x' })).toBe('');
  });

  it('joins only the parts that are there', () => {
    expect(stationSays({ slug: 'x', genre: 'faith' })).toBe('Faith');
    expect(stationSays({ slug: 'x', genre: 'faith', country: 'jp' }))
      .toBe('Faith · Japan');
  });

  it('names a language in words', () => {
    const said = stationSays({ slug: 'x', language: 'en' });
    expect(said).toBe('English');
    expect(said).not.toBe('en');
  });

  /*
   * THE PLATFORM'S TABLE, NOT A SECOND ONE. A hand-written list of
   * languages is a list that is wrong about somebody's language.
   */
  it('falls back to the tag for something it does not know', () => {
    expect(languageSays('zz-nonsense-tag')).toBeTruthy();
  });

  it('knows more than one language', () => {
    expect(languageSays('fr')).not.toBe(languageSays('sw'));
  });
});

describe('the shelves (N-1)', () => {
  it('has the genres the brief names', () => {
    for (const named of ['music', 'education', 'faith', 'news', 'culture',
      'entertainment', 'sport', 'children', 'health', 'business']) {
      expect(GENRES).toContain(named);
    }
  });

  it('has no duplicates and is all lower case', () => {
    expect(new Set(GENRES).size).toBe(GENRES.length);
    for (const genre of GENRES) expect(genre).toBe(genre.toLowerCase());
  });
});

describe('the suggester has no unreachable branch (N-1)', () => {
  /*
   * ONCE THE PREFIX IS `station-`, THE RESULT CANNOT FAIL, and a
   * third fallback for a case that cannot happen survived every
   * mutation. This is the property that makes it unreachable,
   * asserted directly so that a later change to `slugProblem`
   * which breaks it is caught here rather than by a station
   * called `!!!`.
   */
  it('always makes a usable address out of the station- prefix', () => {
    for (const base of ['', 'a', 'guide', 'channels', 'tv', 'x'.repeat(60),
      '9', 'news']) {
      const made = `station-${base}`.slice(0, 48).replace(/-+$/, '');
      expect(slugProblem(made), base).toBe(null);
    }
  });

  it('reserves no word beginning station-', () => {
    for (const word of RESERVED_SLUGS) {
      expect(word.startsWith('station-'), word).toBe(false);
    }
  });
});

/*
 * A WORLD SYSTEM, NOT A LIST OF COUNTRIES.
 *
 * > *"remember this is a world system not for only 54 countries"*
 *
 * The directory line read `Faith · English · CM`, which is a row
 * showing its database. `Intl.DisplayNames` is the platform's own
 * table, by the same argument `languageSays` already makes.
 */
describe('a country in words (N-4)', () => {
  it('names the country rather than printing its code', () => {
    /* Four continents, because this is a world network and a
       test that only ever names one is a test that reads like a
       regional product. */
    expect(countrySays('jp')).toBe('Japan');
    expect(countrySays('br')).toBe('Brazil');
    expect(countrySays('cm')).toBe('Cameroon');
    expect(countrySays('GB')).toBe('United Kingdom');
  });

  it('does not care how the code was typed', () => {
    expect(countrySays(' no ')).toBe(countrySays('NO'));
  });

  /* A code the table does not hold comes back as itself, because a
     reader can look up `QZ` and cannot look up a shrug. */
  it('falls back to the code and never to a shrug', () => {
    expect(countrySays('qz')).toBe('QZ');
  });

  it('says nothing about a station that named no country', () => {
    expect(countrySays('')).toBe('');
    expect(stationSays({ slug: 'x', genre: 'faith' })).toBe('Faith');
  });
});
