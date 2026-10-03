/**
 * The station's own front door.  [CHANNEL §2, D-03, N-8]
 *
 * > *"The channel owner can eventually have a custom domain, but
 * > BalanceVid provides the canonical public channel identity."*
 *
 * Second, never instead. The slug is the identity; this is a door
 * the owner also owns.
 */

import { describe, expect, it } from 'vitest';

import type { Channel } from '../../src/domain/channel.js';
import {
  DOMAIN_LONGEST, LABEL_LONGEST, domainProblem, hostOf,
} from '../../src/domain/station.js';
import { newChannel, setStation, takenDomains } from '../../src/domain/channelEdit.js';
import { byDomain } from '../../src/domain/channelListing.js';

const WHEN = '2026-10-03T06:00:00.000Z';

function made(name: string, how: Partial<{
  slug: string; domain: string; published: boolean; listed: boolean;
  access: 'anyone' | 'members' | 'link' | 'invited';
}> = {}): Channel {
  const channel = newChannel(name, 'Europe/London', WHEN);
  setStation(channel, {
    ...(how.slug ? { slug: how.slug } : {}),
    ...(how.domain ? { domain: how.domain } : {}),
  });
  if (how.published !== false) {
    channel.publication = {
      publishedAt: WHEN,
      ...(how.listed === false ? { listed: false } : {}),
      ...(how.access ? { access: how.access } : {}),
    };
  }
  return channel;
}

describe('what may be a domain (N-8)', () => {
  it('accepts a host somebody would actually own', () => {
    for (const good of ['tv.redemption.example', 'redemption.tv',
      'tv.my-channel.com', 'a.bc', 'xn--caf-dma.example',
      'tv2.channel-247.co.uk']) {
      expect(domainProblem(good), good).toBe(null);
    }
  });

  /*
   * THE ORDER OF THE CLAUSES IS THE QUALITY OF THE MESSAGE.
   * Somebody pasting a URL out of their browser's address bar has
   * made one mistake, and "contains an illegal character" is true
   * and useless. Each of these asserts the message, not just the
   * refusal.
   */
  it('tells somebody who pasted a URL what they actually did', () => {
    expect(domainProblem('https://tv.example.com'))
      .toBe('just the host — no https:// in front');
    expect(domainProblem('tv.example.com/live'))
      .toBe('just the host — no path after it');
    expect(domainProblem('tv.example.com:8443'))
      .toBe('a domain carries no port');
    expect(domainProblem('ico@example.com'))
      .toBe('that is an address, not a domain');
  });

  it('refuses a space it would otherwise have to trim away', () => {
    expect(domainProblem(' tv.example.com'))
      .toBe('a domain cannot start or end with a space');
    expect(domainProblem('tv.example.com '))
      .toBe('a domain cannot start or end with a space');
  });

  it('refuses nothing at all', () => {
    expect(domainProblem('')).toBe('nothing to use as a domain');
  });

  it('needs a dot, because a single label is not a public name', () => {
    expect(domainProblem('localhost'))
      .toBe('needs at least one dot, like tv.example.com');
    expect(domainProblem('redemption'))
      .toBe('needs at least one dot, like tv.example.com');
  });

  it('refuses the trailing dot the DNS allows and a comparison does not', () => {
    expect(domainProblem('tv.example.com.'))
      .toBe('a domain does not end with a dot');
  });

  it('refuses two dots together', () => {
    expect(domainProblem('tv..example.com'))
      .toBe('two dots together is a typing mistake');
    expect(domainProblem('.tv.example.com'))
      .toBe('two dots together is a typing mistake');
  });

  /*
   * PUNYCODE OR NOTHING. `tv.café.example` is a real domain whose
   * wire form is `tv.xn--caf-dma.example`. Converting it here
   * would be the quiet repair this product refuses everywhere, and
   * storing the unicode form would be a value no incoming request
   * can ever equal.
   */
  it('refuses unicode and says what to send instead', () => {
    expect(domainProblem('tv.café.example'))
      .toMatch(/punycode/);
    expect(domainProblem('TV.Example.com')).toMatch(/lower case/);
    expect(domainProblem('tv.exa_mple.com')).toMatch(/lower case/);
  });

  it('refuses a hyphen at the edge of any part', () => {
    expect(domainProblem('-tv.example.com'))
      .toBe('no part of a domain starts or ends with a hyphen');
    expect(domainProblem('tv-.example.com'))
      .toBe('no part of a domain starts or ends with a hyphen');
    expect(domainProblem('tv.example-.com'))
      .toBe('no part of a domain starts or ends with a hyphen');
  });

  /*
   * AND THE LAST PART IS NOT A NUMBER, which is the whole of the
   * IP check: `1.2.3.4` passes every rule above. A station
   * reachable only at an address is a station nobody can be told
   * about.
   */
  it('refuses an IP address, which passes every other rule', () => {
    expect(domainProblem('1.2.3.4')).toBe('that is an IP address, not a domain');
    expect(domainProblem('192.168.0.1'))
      .toBe('that is an IP address, not a domain');
    /* A number is fine anywhere but the end. */
    expect(domainProblem('247.example.com')).toBe(null);
  });

  it('holds the lengths the DNS holds', () => {
    const label = 'a'.repeat(LABEL_LONGEST);
    expect(domainProblem(`${label}.com`)).toBe(null);
    expect(domainProblem(`${label}a.com`)).toMatch(/one part of it is too long/);
    const long = `${'a'.repeat(60)}.`.repeat(5);
    expect(long.length + 3).toBeGreaterThan(DOMAIN_LONGEST);
    expect(domainProblem(`${long}com`)).toMatch(/too long/);
  });
});

describe('the host a request arrived on (N-8)', () => {
  /*
   * ONE FUNCTION BECAUSE THERE ARE TWO READERS. The middleware
   * decides whether a host is the installation's own, the page
   * decides which station answers on it, and a port kept in one
   * and stripped in the other is a custom domain that routes and
   * then 404s.
   */
  it('strips the port a browser sends and a document never holds', () => {
    expect(hostOf('tv.example.com:443')).toBe('tv.example.com');
    expect(hostOf('127.0.0.1:3100')).toBe('127.0.0.1');
  });

  it('lower cases, because a host is case-insensitive and a string is not', () => {
    expect(hostOf('TV.Example.COM')).toBe('tv.example.com');
  });

  it('takes the first where a proxy chain left several', () => {
    expect(hostOf('tv.example.com, internal:3000')).toBe('tv.example.com');
    expect(hostOf(' tv.example.com , other.example ')).toBe('tv.example.com');
  });

  it('answers nothing for nothing', () => {
    expect(hostOf(null)).toBe(null);
    expect(hostOf(undefined)).toBe(null);
    expect(hostOf('')).toBe(null);
    expect(hostOf(':443')).toBe(null);
  });

  /* A header carrying a path is not a host, and must not become one. */
  it('answers nothing for a value that is not a host', () => {
    expect(hostOf('tv.example.com/live')).toBe(null);
  });
});

describe('setting a domain (N-8)', () => {
  it('stores it lower case and trimmed', () => {
    const one = made('A', { slug: 'aa' });
    setStation(one, { domain: '  TV.Example.COM ' });
    expect(one.station!.domain).toBe('tv.example.com');
  });

  it('refuses one the rules refuse, with the reason attached', () => {
    const one = made('A', { slug: 'aa' });
    expect(() => setStation(one, { domain: 'https://tv.example.com' }))
      .toThrow(/that domain will not do: just the host/);
    expect(one.station!.domain).toBeUndefined();
  });

  /*
   * CLEARED BY AN EMPTY STRING, the way the callsign is. A field
   * the owner can empty needs a way to say so; `undefined` is what
   * a patch says when it is not mentioning the field at all.
   */
  it('is cleared by an empty string and untouched by silence', () => {
    const one = made('A', { slug: 'aa', domain: 'tv.example.com' });
    setStation(one, { callsign: 'AA' });
    expect(one.station!.domain).toBe('tv.example.com');
    setStation(one, { domain: '' });
    expect(one.station!.domain).toBeUndefined();
    expect(one.station!.callsign).toBe('AA');
  });

  /*
   * AND UNIQUE, for the reason the slug is: two stations on one
   * host is a request that resolves to whichever document the walk
   * reached first, which is not a decision anybody made.
   */
  it('refuses a host another channel already answers on', () => {
    const first = made('A', { slug: 'aa', domain: 'tv.example.com' });
    const second = made('B', { slug: 'bb' });
    expect(() => setStation(second, { domain: 'tv.example.com' }, [first]))
      .toThrow(/another channel already answers on that domain/);
  });

  it('lets a channel keep its own domain through an unrelated edit', () => {
    const one = made('A', { slug: 'aa', domain: 'tv.example.com' });
    expect(() => setStation(one, { callsign: 'AA' }, [one])).not.toThrow();
    expect(one.station!.domain).toBe('tv.example.com');
  });

  /*
   * THE DOCUMENT ON DISK IS NOT A TYPE. A hand-edited file holding
   * `TV.Example.com` must still block the claim, or the same host
   * is taken twice in different cases. [N-3]
   */
  it('matches a taken domain whatever case the file holds it in', () => {
    const first = made('A', { slug: 'aa' });
    first.station!.domain = 'TV.Example.com';
    expect(takenDomains([first])).toEqual(new Set(['tv.example.com']));
    const second = made('B', { slug: 'bb' });
    expect(() => setStation(second, { domain: 'tv.example.com' }, [first]))
      .toThrow(/already answers/);
  });

  it('does not count the channel being edited as taking its own domain', () => {
    const one = made('A', { slug: 'aa', domain: 'tv.example.com' });
    expect(takenDomains([one], one.id).size).toBe(0);
  });
});

describe('which station answers on a host (N-8)', () => {
  it('finds the station that claimed it', () => {
    const one = made('A', { slug: 'aa', domain: 'tv.example.com' });
    const other = made('B', { slug: 'bb', domain: 'tv.other.example' });
    expect(byDomain([one, other], 'tv.example.com')?.id).toBe(one.id);
    expect(byDomain([one, other], 'tv.other.example')?.id).toBe(other.id);
  });

  it('finds it through the port and the case a browser sends', () => {
    const one = made('A', { slug: 'aa', domain: 'tv.example.com' });
    expect(byDomain([one], 'TV.Example.com:443')?.id).toBe(one.id);
  });

  /*
   * AND THROUGH THE CASE A FILE HOLDS. `setStation` lowers what it
   * stores, so only a hand-edited document says `TV.Example.com` —
   * and a document on disk is not a type. [N-3] Without the lower
   * on the stored side, that station is one nothing can ever reach
   * and nobody can see why.
   */
  it('finds it whatever case the document on disk holds', () => {
    const one = made('A', { slug: 'aa' });
    one.station!.domain = 'TV.Example.com';
    expect(byDomain([one], 'tv.example.com')?.id).toBe(one.id);
  });

  /*
   * AN UNLISTED STATION ANSWERS, because the brief says in as many
   * words what unlisted means: "works through direct link/domain
   * but doesn't appear in the directory." A domain is that direct
   * link with the station's own name on it.
   */
  it('answers for an unlisted station, which is what unlisted means', () => {
    const one = made('A', { slug: 'aa', domain: 'tv.example.com', listed: false });
    expect(byDomain([one], 'tv.example.com')?.id).toBe(one.id);
  });

  /*
   * AND NOT FOR A PRIVATE OR OFFLINE ONE, which answer the way a
   * host nobody holds answers. A custom domain is a second door to
   * one station, not a second set of rules about who may come in.
   */
  it('answers nothing for a private or offline station', () => {
    expect(byDomain([made('A', { slug: 'aa', domain: 'tv.example.com',
      access: 'invited' })], 'tv.example.com')).toBeUndefined();
    expect(byDomain([made('A', { slug: 'aa', domain: 'tv.example.com',
      published: false })], 'tv.example.com')).toBeUndefined();
  });

  it('answers nothing for a host nobody claimed', () => {
    const one = made('A', { slug: 'aa', domain: 'tv.example.com' });
    expect(byDomain([one], 'tv.nobody.example')).toBeUndefined();
    expect(byDomain([one], '')).toBeUndefined();
    expect(byDomain([one], null)).toBeUndefined();
  });

  /*
   * AND NOT FOR A STATION WITH NO DOMAIN AT ALL — the one way a
   * bad comparison hands a stranger the first channel in the walk.
   *
   * THIS ASSERTION CANNOT BE KILLED BY MUTATION, AND THAT IS NOT A
   * FAULT IN IT. Rewriting the comparison to coalesce both sides
   * to `''` is an EQUIVALENT mutant: `hostOf` answers null for
   * every empty host and the early return above sends those away,
   * so `wanted` is never `''` by the time the walk starts, and
   * the two forms cannot be told apart. A survivor is usually a
   * missing fixture or a dead guard; this is the third thing, and
   * the assertion stays because it states the contract the early
   * return is holding.
   */
  it('never matches a station that claimed nothing', () => {
    const plain = made('A', { slug: 'aa' });
    expect(byDomain([plain], 'tv.example.com')).toBeUndefined();
    expect(byDomain([plain], '')).toBeUndefined();
    expect(byDomain([plain], undefined)).toBeUndefined();
  });
});
