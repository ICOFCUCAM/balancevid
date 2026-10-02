/**
 * Finding a channel.  [CHANNEL §2, D-04, N-4]
 *
 * What counts as a hit is a judgement, not a filter written inline
 * on a page: `faith` means the shelf, `RDTV` means the callsign,
 * `redemption` means the name.
 */

import { describe, expect, it } from 'vitest';

import type { Listing } from '../../src/domain/channelListing.js';
import { matching, scoreOf } from '../../src/domain/channelSearch.js';

const row = (over: Partial<Listing> & { name: string; slug: string }): Listing =>
  ({ says: '', ...over });

const RDTV = row({ name: 'Redemption TV', slug: 'redemption-tv',
  callsign: 'RDTV', genre: 'faith', country: 'CM',
  description: 'Worship and teaching.' });
const MUSIC = row({ name: 'Music House', slug: 'music-house',
  callsign: 'MUSH', genre: 'music' });
const AKTV = row({ name: 'Afrin Kong TV', slug: 'afrin-kong-tv',
  callsign: 'AKTV', genre: 'culture', country: 'CM' });
const ALL = [RDTV, MUSIC, AKTV];

describe('what counts as a hit (N-4)', () => {
  it('finds a channel by its name', () => {
    expect(matching(ALL, 'redemption')).toEqual([RDTV]);
  });

  it('finds one by its callsign', () => {
    expect(matching(ALL, 'AKTV')).toEqual([AKTV]);
  });

  it('finds one by its address', () => {
    expect(matching(ALL, 'music-house')).toEqual([MUSIC]);
  });

  it('finds a shelf', () => {
    expect(matching(ALL, 'faith')).toEqual([RDTV]);
  });

  it('finds a country', () => {
    expect(matching(ALL, 'cm').map((r) => r.name).sort())
      .toEqual(['Afrin Kong TV', 'Redemption TV']);
  });

  it('finds words in a description', () => {
    expect(matching(ALL, 'worship')).toEqual([RDTV]);
  });

  /* A viewer types ` Redemption ` and means redemption. */
  it('does not care about case or surrounding space', () => {
    expect(matching(ALL, '  REDEMPTION  ')).toEqual([RDTV]);
  });

  it('finds nothing for nothing', () => {
    expect(matching(ALL, '')).toEqual([]);
    expect(matching(ALL, '   ')).toEqual([]);
    expect(matching(ALL, 'zzzz')).toEqual([]);
  });
});

describe('the order (N-4)', () => {
  /*
   * A NAME BEATS A SHELF. Somebody typing `music` with Music House
   * in mind must not be shown eleven music channels first.
   */
  it('puts a name above a shelf', () => {
    const other = row({ name: 'Zion Sound', slug: 'zion', genre: 'music' });
    const found = matching([other, MUSIC], 'music');
    expect(found[0]).toBe(MUSIC);
    expect(found).toHaveLength(2);
  });

  it('puts an exact address above everything', () => {
    const decoy = row({ name: 'Music House Two', slug: 'mh2', genre: 'music' });
    expect(matching([decoy, MUSIC], 'music-house')[0]).toBe(MUSIC);
  });

  it('puts a name that starts with the query above one that contains it', () => {
    const starts = row({ name: 'Kong Radio', slug: 'kong-radio' });
    const holds = row({ name: 'Afrin Kong TV', slug: 'akt' });
    expect(matching([holds, starts], 'kong')[0]).toBe(starts);
  });

  /*
   * TIES BREAK BY NAME, so a search run twice is the same search.
   * A directory that reshuffles equal results is one a viewer
   * cannot come back to. [D-04]
   */
  it('is the same search twice', () => {
    const a = row({ name: 'Beta', slug: 'beta', genre: 'music' });
    const b = row({ name: 'Alpha', slug: 'alpha', genre: 'music' });
    expect(matching([a, b], 'music').map((r) => r.name)).toEqual(['Alpha', 'Beta']);
    expect(matching([b, a], 'music').map((r) => r.name)).toEqual(['Alpha', 'Beta']);
  });
});

describe('scoring (N-4)', () => {
  it('gives nothing to a row that does not match', () => {
    expect(scoreOf(MUSIC, 'redemption')).toBe(0);
  });

  it('adds up every way a row matches', () => {
    /* RDTV matches its own callsign exactly and holds it too. */
    expect(scoreOf(RDTV, 'rdtv')).toBeGreaterThan(scoreOf(AKTV, 'tv'));
  });
});

describe('a callsign matches whole or not at all (N-4)', () => {
  /*
   * A PARTIAL CLAUSE STOOD HERE AND SURVIVED EVERY MUTATION. Every
   * realistic query hitting part of a callsign already hits the
   * name, and what it reliably added was noise: a two-letter `tv`
   * scoring every station whose four letters end in TV.
   */
  it('finds a channel by its whole callsign', () => {
    expect(matching(ALL, 'rdtv')).toEqual([RDTV]);
  });

  it('does not score a fragment of one', () => {
    expect(scoreOf(MUSIC, 'ush')).toBe(0);
  });

  /* And `tv` finds the channels whose NAME says TV, which is the
     answer a person typing it wants. */
  it('answers tv from the names, not from the callsigns', () => {
    const found = matching(ALL, 'tv').map((r) => r.name);
    expect(found).toContain('Redemption TV');
    expect(found).toContain('Afrin Kong TV');
    expect(found).not.toContain('Music House');
  });
});
