/**
 * Finding a channel.  [CHANNEL §2, D-04, N-4]
 *
 * What counts as a hit is a judgement, not a filter written inline
 * on a page: `faith` means the shelf, `RDTV` means the callsign,
 * `redemption` means the name.
 */

import { describe, expect, it } from 'vitest';

import type { Listing } from '../../src/domain/channelListing.js';
import {
  SHOWING_AHEAD_MS, matching, scoreOf, showings,
} from '../../src/domain/channelSearch.js';
import { listingFor } from '../../src/domain/channelListing.js';
import { newChannel, setStation } from '../../src/domain/channelEdit.js';

const row = (over: Partial<Listing> & { name: string; slug: string }): Listing =>
  ({ says: '', ...over });

const RDTV = row({ name: 'Redemption TV', slug: 'redemption-tv',
  callsign: 'RDTV', genre: 'faith', country: 'JP',
  description: 'Worship and teaching.' });
const MUSIC = row({ name: 'Music House', slug: 'music-house',
  callsign: 'MUSH', genre: 'music' });
const AKTV = row({ name: 'Afrin Kong TV', slug: 'afrin-kong-tv',
  callsign: 'AKTV', genre: 'culture', country: 'JP' });
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
    expect(matching(ALL, 'jp').map((r) => r.name).sort())
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

/* ------------------------------------------------------------------ *
 *  Searching what is ON, rather than what is CARRIED.  [N-4, D-04]
 *
 *  The design this page was built against offers CHANNELS,
 *  PROGRAMS and CATEGORIES. Two of the three existed; the middle
 *  one was the question this network could not answer at all,
 *  although every piece of the answer was already here.
 * ------------------------------------------------------------------ */

const MIN = 60_000;
const WHEN = Date.parse('2026-10-02T20:00:00.000Z');

function station(name: string, slug: string, titles: string[], each = 30) {
  const channel = newChannel(name, 'Europe/London', new Date(WHEN).toISOString());
  setStation(channel, { slug });
  channel.rotation = titles.map((title, at) => ({
    id: `r${at}`, title, durationMs: each * MIN,
    source: { kind: 'media', assetId: `a${at}`, form: 'video' },
  })) as never;
  return { channel, listing: listingFor(channel)! };
}

describe('finding what is on (N-4)', () => {
  it('finds a programme by its name across every channel', () => {
    const found = showings([
      station('Redemption TV', 'redemption-tv', ['Morning Worship', 'Teaching']),
      station('Music House', 'music-house', ['Breakfast Mix', 'The Chart']),
    ], 'worship', WHEN, 60 * MIN);
    expect(found.map((one) => [one.channel.name, one.title]))
      .toEqual([['Redemption TV', 'Morning Worship']]);
  });

  /*
   * SOONEST FIRST, NOT BEST FIRST, which is the opposite of the
   * channel search and deliberately so: a list of programmes is a
   * list of times. [D-04]
   */
  it('is ordered by when it is on, not by how well it matched', () => {
    /* Loops long enough not to come round again inside the window:
       two turns of the same loop are two slots, which is the
       guide's own rule and not something to hide here. */
    const found = showings([
      station('A', 'a-tv', ['Nothing', 'Worship Hour'], 45),
      station('B', 'b-tv', ['Worship'], 90),
    ], 'worship', WHEN, 90 * MIN);
    expect(found.map((one) => one.fromMs - WHEN)).toEqual([0, 45 * MIN]);
    expect(found[0]!.channel.name).toBe('B');
  });

  it('breaks a tie on the clock by channel name', () => {
    const found = showings([
      station('Zebra TV', 'zebra-tv', ['Worship']),
      station('Apple TV', 'apple-tv', ['Worship']),
    ], 'worship', WHEN, 30 * MIN);
    expect(found.map((one) => one.channel.name)).toEqual(['Apple TV', 'Zebra TV']);
  });

  it('says which one is on the air at this very moment', () => {
    const found = showings(
      [station('A', 'a-tv', ['Worship', 'More Worship'])],
      'worship', WHEN, 60 * MIN);
    expect(found.map((one) => one.now)).toEqual([true, false]);
  });

  /*
   * NOT *OFF AIR*, EVER. A channel showing nothing is drawn as
   * dead air by a title this product wrote, and a viewer searching
   * for `air` would otherwise be handed every silent channel on
   * the network as though it were a programme. [D-21]
   */
  it('never offers dead air as something to watch', () => {
    const silent = station('Quiet TV', 'quiet-tv', []);
    expect(showings([silent], 'air', WHEN, 60 * MIN)).toEqual([]);
    expect(showings([silent], 'off', WHEN, 60 * MIN)).toEqual([]);
  });

  /*
   * A BOOKED LIVE SLOT IS FINDABLE, which is the point of
   * announcing it: somebody searching for the debate on Monday is
   * exactly who booking Friday was for. [§6]
   */
  it('finds a booked live slot and says it is not on yet', () => {
    const one = station('Talk TV', 'talk-tv', ['Filler']);
    one.channel.programmes = [{
      id: 'prog_1',
      startsAt: new Date(WHEN + 30 * MIN).toISOString(),
      durationMs: 30 * MIN,
      source: { kind: 'live_event' },
      title: 'Evening Discussion',
    }] as never;
    const found = showings([one], 'discussion', WHEN, 90 * MIN);
    expect(found).toHaveLength(1);
    expect(found[0]!.booked).toBe(true);
    expect(found[0]!.now).toBe(false);
  });

  it('does not care how the query was typed', () => {
    const rows = [station('A', 'a-tv', ['Morning Worship'], 60)];
    expect(showings(rows, '  WORSHIP ', WHEN, 60 * MIN)).toHaveLength(1);
  });

  it('answers nothing at all to an empty query', () => {
    expect(showings([station('A', 'a-tv', ['Worship'])], '   ', WHEN))
      .toEqual([]);
  });

  /*
   * A HORIZON, BECAUSE A SCHEDULE HAS NO END. A search across the
   * whole of it would answer `worship` with every Sunday until the
   * heat death of the universe.
   */
  it('looks ahead a fixed distance and no further', () => {
    const rows = [station('A', 'a-tv', ['Worship'], 30)];
    const found = showings(rows, 'worship', WHEN);
    expect(found.length).toBeGreaterThan(0);
    for (const one of found) {
      expect(one.fromMs).toBeGreaterThanOrEqual(WHEN);
      expect(one.toMs).toBeLessThanOrEqual(WHEN + SHOWING_AHEAD_MS);
    }
  });

  /*
   * THE CHANNEL'S OWN GENRE IS NOT A PROGRAMME'S NAME. Folding it
   * into the match would make every programme on a faith channel
   * a hit for `faith`, which is what the CHANNELS tab is for.
   */
  it('matches the programme and not the channel around it', () => {
    const one = station('Faith Channel', 'faith-channel', ['Morning Show']);
    setStation(one.channel, { genre: 'faith' });
    const listing = listingFor(one.channel)!;
    expect(showings([{ channel: one.channel, listing }], 'faith', WHEN, 60 * MIN))
      .toEqual([]);
  });
});

/*
 * COUNTRIES AND LANGUAGES, which the brief names beside Search as
 * the two things that make a network of thousands navigable.
 *
 * > *"Search, Countries, Languages. This is how hundreds or
 * > thousands of user-created channels become navigable."*
 */
describe('finding a channel by where it is from (N-4)', () => {
  it('matches the country by its name as well as by its code', () => {
    expect(scoreOf(RDTV, 'japan')).toBeGreaterThan(0);
    expect(scoreOf(RDTV, 'JP')).toBeGreaterThan(0);
    expect(scoreOf(RDTV, 'france')).toBe(0);
  });

  it('matches the language, which nothing read before', () => {
    const row = { ...RDTV, language: 'en' };
    expect(scoreOf(row, 'english')).toBeGreaterThan(0);
    expect(scoreOf(row, 'en')).toBeGreaterThan(0);
    expect(scoreOf(row, 'french')).toBe(0);
  });

  /*
   * WHOLE AND NOT PARTIAL, like the callsign and for the same
   * reason: `e` against every English channel is noise.
   */
  it('wants the whole word, not the start of one', () => {
    const row = { ...RDTV, language: 'en' };
    expect(scoreOf(row, 'eng')).toBe(0);
    expect(scoreOf(row, 'jap')).toBe(0);
  });

  it('says nothing about a station that named neither', () => {
    const bare = row({ name: 'Bare TV', slug: 'bare-tv' });
    expect(scoreOf(bare, 'japan')).toBe(0);
    expect(scoreOf(bare, 'english')).toBe(0);
  });

  /* A name beats a shelf beats a place, which is the order a
     reader means them in. [D-04] */
  it('puts a channel named for a country above one merely in it', () => {
    const named = row({ name: 'Japan Live', slug: 'japan-live' });
    const from = row({ name: 'Other TV', slug: 'other-tv', country: 'JP' });
    expect(matching([from, named], 'japan').map((one) => one.slug))
      .toEqual(['japan-live', 'other-tv']);
  });
});

/*
 * THE WALK STARTS AT NOW, so the only slot that can contain the
 * instant is the one that begins on it — the reason the second
 * half of the `now` test was deleted.
 */
describe('what the showing relies on (N-4)', () => {
  it('never hands back a slot that has already finished', () => {
    const found = showings(
      [station('A', 'a-tv', ['Worship', 'More Worship'], 45)],
      'worship', WHEN, 180 * MIN);
    expect(found.length).toBeGreaterThan(1);
    for (const one of found) expect(one.toMs).toBeGreaterThan(WHEN);
    expect(found.filter((one) => one.now)).toHaveLength(1);
  });
});
