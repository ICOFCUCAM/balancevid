/**
 * Where a request landed, when a station has a door of its own.
 *   [Doctrine CHANNEL §2, D-03, TV-NETWORK N-8]
 *
 * > *"The channel owner can eventually have a custom domain, but
 * > BalanceVid provides the canonical public channel identity."*
 *
 *     tv.redemption.example/          ──► that station's page
 *     tv.redemption.example/api/…     ──► through, as normal
 *     tv.redemption.example/anything  ──► 308 to balancevid.com
 *     balancevid.com/anything         ──► untouched
 *
 * OFF UNTIL THE INSTALLATION SAYS WHAT IT IS CALLED. Nothing here
 * can tell a customer's host from its own without being told, and
 * guessing would make the first request with an odd `Host` header
 * into a station lookup. With `BALANCEVID_HOST` unset every
 * branch answers `own`, which is the behaviour that existed
 * before this file — a deployment that does not want custom
 * domains cannot be broken by one.
 *
 * TWO THINGS ARE SERVED ON A CUSTOM HOST AND NO MORE: the station
 * at `/`, and the API the station page reads. Everything else
 * goes to the canonical host, which is the brief's own
 * instruction stated as routing —
 *
 * > *"I would not make custom domains the primary discovery
 * > mechanism… The BalanceVid directory/app is the discovery
 * > layer. The domain is the station's own public identity."*
 *
 * — and it has a second effect worth naming: THE CONTROL ROOM IS
 * NOT REACHABLE ON A CUSTOMER'S DOMAIN. `/t/<id>`, `/settings`
 * and the sign-in page are the product, and the product answers
 * at the product's address.
 *
 * NOT A LOOKUP. This decides nothing about WHICH station; it says
 * only that the host is not the installation's own, so the page
 * must go and ask. Middleware has no business reading storage,
 * which is the rule `middleware.ts` has stated since it was
 * written.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import { hostOf } from '../domain/station.js';
import { isAssetPath } from '../auth/policy.js';

/** Where the rewrite sends a request that arrived on a custom host. */
export const STATION_PATH = '/tv/station';

export type Landing =
  /** The installation's own host, or no way to tell. Behave as before. */
  | { kind: 'own' }
  /** A custom host asking for the station that answers on it. */
  | { kind: 'station'; to: string }
  /** A custom host asking for something it is allowed to be asked. */
  | { kind: 'through' }
  /** A custom host asking for something only BalanceVid answers. */
  | { kind: 'canonical'; to: string };

export function landingFor(request: {
  host: string | null | undefined;
  ownHost: string | null | undefined;
  pathname: string;
  search?: string;
  proto?: string | null;
}): Landing {
  const own = hostOf(request.ownHost);
  const here = hostOf(request.host);
  if (!own || !here || here === own) return { kind: 'own' };

  /*
   * THE PAGE'S OWN BUNDLE AND THE API IT CALLS. A station page
   * redirected to the canonical host for its stylesheet is a
   * station page with no stylesheet, and one redirected for its
   * playlist is a player that cannot play. `isAssetPath` rather
   * than a second list of prefixes, so the day another asset
   * prefix is added it is added once. [D-19]
   */
  if (isAssetPath(request.pathname) || request.pathname.startsWith('/api/')) {
    return { kind: 'through' };
  }
  if (request.pathname === '/') return { kind: 'station', to: STATION_PATH };

  /*
   * THE TARGET HOST IS THE ENVIRONMENT'S, NEVER THE CALLER'S, and
   * that one substitution is the whole of what keeps this from
   * being an open redirect. `own` comes from `BALANCEVID_HOST`;
   * nothing a request carries reaches the authority.
   *
   * A COLLAPSE OF LEADING SLASHES WAS HERE and claimed to prevent
   * exactly that — `//evil.example` as a protocol-relative URL.
   * It survived mutation, and measuring it showed the claim was
   * simply wrong: the authority is already closed by
   * `https://<own>`, so `https://balancevid.com//evil.example`
   * parses with host `balancevid.com`, as do the backslash and
   * percent-encoded forms. Deleted rather than kept, because a
   * guard with a false reason attached teaches the next reader
   * something untrue. [the twenty-third]
   */
  const to = canonicalFor(
    `${request.pathname}${request.search ?? ''}`, request.ownHost, request.proto);
  /* Unreachable: `own` was checked above and `canonicalFor` asks
     the same question of the same value. Typed away rather than
     guarded, so there is nothing here a test cannot reach. */
  return to ? { kind: 'canonical', to } : { kind: 'own' };
}

/**
 * The one address this installation wants to be linked to.
 *
 * > *"BalanceVid provides the canonical public channel identity."*
 *
 * THE SAME RULE AS THE REDIRECT, BECAUSE IT IS THE SAME CLAIM.
 * The 308 says *the real address is over there* and the canonical
 * tag says it to a search engine; built twice they would
 * eventually disagree, and a station whose redirect and whose
 * canonical point at different hosts is one Google picks between.
 *
 * NOTHING WHERE THE INSTALLATION HAS NO NAME, and that absence
 * matters more than it looks. Next resolves a RELATIVE canonical
 * against `metadataBase`, which this product does not set — so a
 * relative one would have been emitted as
 * `http://localhost:3000/tv/channels/…` on a live station page,
 * which is worse than no canonical at all. No name, no tag.
 */
export function canonicalFor(
  path: string, ownHost: string | null | undefined, proto?: string | null,
): string | null {
  const own = hostOf(ownHost);
  if (!own) return null;
  return `${proto === 'http' ? 'http' : 'https'}://${own}${path}`;
}
