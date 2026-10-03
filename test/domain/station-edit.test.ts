/**
 * Giving a channel its public identity.  [§2, §3, N-1]
 *
 * The slug is the only field that can collide, and an address two
 * channels answer to is an address neither of them owns.
 */

import { describe, expect, it } from 'vitest';

import type { Channel } from '../../src/domain/channel.js';
import { newChannel, setStation, takenSlugs } from '../../src/domain/channelEdit.js';

const AT = '2026-10-02T20:00:00.000Z';
const make = (name = 'Redemption TV'): Channel =>
  newChannel(name, 'Europe/London', AT);

describe('a channel takes an address (N-1)', () => {
  it('suggests one from the name when it has none', () => {
    const channel = make();
    setStation(channel, {});
    expect(channel.station?.slug).toBe('redemption-tv');
  });

  it('keeps what the owner typed', () => {
    const channel = make();
    setStation(channel, { slug: 'rdtv' });
    expect(channel.station?.slug).toBe('rdtv');
  });

  /* Refused rather than repaired: an address somebody will print. */
  it('refuses an address that is not one, with the reason', () => {
    const channel = make();
    expect(() => setStation(channel, { slug: 'Not An Address' }))
      .toThrow(/web address/);
    expect(channel.station).toBeUndefined();
  });

  it('refuses a word the directory owns', () => {
    expect(() => setStation(make(), { slug: 'guide' })).toThrow(/directory/);
  });

  /*
   * AN ADDRESS TWO CHANNELS ANSWER TO IS AN ADDRESS NEITHER OWNS.
   * Checked against the rest of the lineup, which the caller passes
   * because this module does not read the filesystem.
   */
  it('refuses an address another channel already has', () => {
    const mine = make();
    const theirs = make('Other');
    setStation(theirs, { slug: 'rdtv' });
    expect(() => setStation(mine, { slug: 'rdtv' }, [theirs]))
      .toThrow(/already answers/);
  });

  it('lets a channel keep its own address', () => {
    const channel = make();
    setStation(channel, { slug: 'rdtv' });
    expect(() => setStation(channel, { callsign: 'RDTV' }, [channel]))
      .not.toThrow();
    expect(channel.station?.slug).toBe('rdtv');
  });

  it('suggests around the addresses already taken', () => {
    const theirs = make();
    setStation(theirs, {});
    const mine = make();
    setStation(mine, {}, [theirs]);
    expect(mine.station?.slug).toBe('redemption-tv-2');
  });
});

describe('the rest of the record (N-1)', () => {
  it('shouts a callsign and refuses a second name', () => {
    const channel = make();
    setStation(channel, { callsign: 'rdtv' });
    expect(channel.station?.callsign).toBe('RDTV');
    expect(() => setStation(channel, { callsign: 'REDEMPTION' })).toThrow();
  });

  /*
   * EVERY EMPTY FIELD IS REMOVED RATHER THAN STORED BLANK. A record
   * holding `country: ''` claims a country nothing can look up, and
   * the listing line would draw a separator with nothing either
   * side of it.
   */
  it('removes a field rather than storing it empty', () => {
    const channel = make();
    setStation(channel, { callsign: 'RDTV', country: 'CM', description: 'x' });
    setStation(channel, { callsign: '  ', country: '', description: ' ' });
    expect(channel.station).not.toHaveProperty('callsign');
    expect(channel.station).not.toHaveProperty('country');
    expect(channel.station).not.toHaveProperty('description');
  });

  it('wants a country as its code, not as somebody’s spelling', () => {
    const channel = make();
    setStation(channel, { country: 'cm' });
    expect(channel.station?.country).toBe('CM');
    expect(() => setStation(channel, { country: 'Cameroun' })).toThrow(/two-letter/);
  });

  it('wants a language as a tag', () => {
    const channel = make();
    setStation(channel, { language: 'EN' });
    expect(channel.station?.language).toBe('en');
    expect(() => setStation(channel, { language: 'English' })).toThrow(/tag/);
  });

  it('refuses a shelf the directory does not have', () => {
    expect(() => setStation(make(), { genre: 'cooking' as never }))
      .toThrow(/kinds of channel/);
  });

  it('holds a description to a length', () => {
    const channel = make();
    setStation(channel, { description: 'y'.repeat(900) });
    expect(channel.station!.description!.length).toBe(400);
  });
});

describe('which addresses are spoken for (N-1)', () => {
  it('collects them, and skips the channel asking', () => {
    const a = make('A'); const b = make('B');
    setStation(a, { slug: 'a-tv' });
    setStation(b, { slug: 'b-tv' });
    expect([...takenSlugs([a, b])].sort()).toEqual(['a-tv', 'b-tv']);
    expect([...takenSlugs([a, b], a.id)]).toEqual(['b-tv']);
  });

  it('ignores a channel that has no address yet', () => {
    expect(takenSlugs([make()]).size).toBe(0);
  });
});
