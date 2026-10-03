/**
 * Where a request landed.  [CHANNEL §2, D-03, N-8]
 *
 * Two things are served on a custom host and no more: the station
 * at `/`, and the API the station page reads. Everything else
 * goes to the canonical host, which is the brief's own
 * instruction stated as routing.
 */

import { describe, expect, it } from 'vitest';

import { STATION_PATH, landingFor } from '../../src/web/hosting.js';

const OWN = 'balancevid.com';
const THEIRS = 'tv.redemption.example';

const at = (host: string | null | undefined, pathname: string, how: {
  ownHost?: string | null; search?: string; proto?: string | null;
} = {}) => landingFor({
  host,
  /* `in`, not `=== undefined`: passing an explicit `undefined`
     is exactly the case these tests are about, and a default
     that swallows it tests the default. */
  ownHost: 'ownHost' in how ? how.ownHost : OWN,
  pathname,
  ...(how.search === undefined ? {} : { search: how.search }),
  ...(how.proto === undefined ? {} : { proto: how.proto }),
});

describe('the feature is off until the installation is named (N-8)', () => {
  /*
   * NOTHING HERE CAN TELL A CUSTOMER'S HOST FROM ITS OWN WITHOUT
   * BEING TOLD, and guessing would turn the first request with an
   * odd `Host` header into a station lookup. With the name unset
   * every branch answers `own`, which is what the gate did before
   * this file existed — a deployment that does not want custom
   * domains cannot be broken by one.
   */
  it('leaves every request alone when nothing says what we are called', () => {
    for (const unset of [undefined, null, '', '   ']) {
      expect(at(THEIRS, '/', { ownHost: unset }).kind, String(unset)).toBe('own');
      expect(at(THEIRS, '/settings', { ownHost: unset }).kind).toBe('own');
      expect(at(THEIRS, '/t/chan_abc', { ownHost: unset }).kind).toBe('own');
    }
  });

  it('leaves a request with no host alone', () => {
    expect(at(null, '/').kind).toBe('own');
    expect(at('', '/settings').kind).toBe('own');
  });
});

describe('the installation own host is untouched (N-8)', () => {
  it('passes its own name through whatever the path', () => {
    for (const path of ['/', '/tv', '/settings', '/t/chan_abc', '/api/health']) {
      expect(at(OWN, path).kind, path).toBe('own');
    }
  });

  /*
   * AND RECOGNISES ITSELF THROUGH WHAT A BROWSER AND A PROXY ADD.
   * A port or a capital in either value would make the
   * installation foreign to itself, which is every page on the
   * product redirecting to its own address for ever.
   */
  it('recognises itself through a port, a case and a proxy chain', () => {
    expect(at('BalanceVid.com', '/settings').kind).toBe('own');
    expect(at('balancevid.com:443', '/settings').kind).toBe('own');
    expect(at('balancevid.com, internal:3000', '/settings').kind).toBe('own');
    expect(at(OWN, '/settings', { ownHost: 'BalanceVid.COM:443' }).kind).toBe('own');
  });
});

describe('a custom host serves one station and nothing else (N-8)', () => {
  it('sends the root to the page that looks the station up', () => {
    const landed = at(THEIRS, '/');
    expect(landed.kind).toBe('station');
    expect(landed.kind === 'station' && landed.to).toBe(STATION_PATH);
  });

  /*
   * THE PAGE'S OWN BUNDLE AND THE API IT CALLS GO THROUGH. A
   * station page redirected for its stylesheet is a station page
   * with no stylesheet; one redirected for its playlist is a
   * player that cannot play.
   */
  it('lets through the API and the assets the page needs', () => {
    for (const path of ['/api/channels/chan_abc/playlist',
      '/api/channels/chan_abc/stream/12', '/api/tv/channels/rtv/logo',
      '/_next/static/chunk.js', '/favicon.ico']) {
      expect(at(THEIRS, path).kind, path).toBe('through');
    }
  });

  /*
   * AND THE CONTROL ROOM IS NOT REACHABLE ON A CUSTOMER'S DOMAIN.
   * `/t/<id>`, `/settings` and the sign-in page are the product,
   * and the product answers at the product's address.
   */
  it('sends the product back to the product own address', () => {
    for (const path of ['/settings', '/t/chan_abc', '/signin', '/take']) {
      const landed = at(THEIRS, path);
      expect(landed.kind, path).toBe('canonical');
      expect(landed.kind === 'canonical' && landed.to).toBe(`https://${OWN}${path}`);
    }
  });

  /*
   * THE DIRECTORY TOO, which is the brief's own instruction: "I
   * would not make custom domains the primary discovery
   * mechanism... the BalanceVid directory/app is the discovery
   * layer. The domain is the station's own public identity."
   */
  it('sends the directory and the guide to the discovery layer', () => {
    expect(at(THEIRS, '/tv/guide').kind).toBe('canonical');
    expect(at(THEIRS, '/tv/channels').kind).toBe('canonical');
    expect(at(THEIRS, '/tv/channels/somebody-else').kind).toBe('canonical');
  });

  it('carries the query string across, so a link keeps its meaning', () => {
    const landed = at(THEIRS, '/tv/channels', { search: '?genre=faith' });
    expect(landed.kind === 'canonical' && landed.to)
      .toBe(`https://${OWN}/tv/channels?genre=faith`);
  });

  it('follows the proxy about the scheme, and assumes https', () => {
    const http = at(THEIRS, '/x', { proto: 'http' });
    expect(http.kind === 'canonical' && http.to).toBe(`http://${OWN}/x`);
    const none = at(THEIRS, '/x', { proto: null });
    expect(none.kind === 'canonical' && none.to).toBe(`https://${OWN}/x`);
    const odd = at(THEIRS, '/x', { proto: 'HTTPS' });
    expect(odd.kind === 'canonical' && odd.to).toBe(`https://${OWN}/x`);
  });
});

describe('the redirect cannot be aimed somewhere else (N-8)', () => {
  /*
   * ONE SUBSTITUTION IS THE WHOLE OF IT: the host comes from the
   * environment and nothing a request carries reaches the
   * authority. This is the assertion that fails if that ever
   * changes.
   */
  it('aims only at the host the installation was told it has', () => {
    const landed = at('evil.example', '/settings');
    expect(landed.kind === 'canonical' && new URL(landed.to).host).toBe(OWN);
  });

  /*
   * AND A PATH THAT LOOKS LIKE A HOST IS STILL A PATH. A collapse
   * of leading slashes was written here against `//evil.example`
   * as a protocol-relative URL, and the claim was wrong: the
   * authority is already closed by `https://<own>`, so every one
   * of these parses with our host. The guard was deleted; this
   * stays, as the measurement that said so.
   */
  it('keeps the origin whatever the path looks like', () => {
    for (const path of ['//evil.example', '///evil.example',
      '//evil.example/steal', '/\\evil.example',
      '/%2f%2fevil.example']) {
      const landed = at(THEIRS, path);
      expect(landed.kind).toBe('canonical');
      const to = landed.kind === 'canonical' ? landed.to : '';
      expect(new URL(to).host, to).toBe(OWN);
      expect(new URL(to).protocol, to).toBe('https:');
    }
  });
});
