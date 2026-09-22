/**
 * Outbound fetch guard.  [Doctrine D-06]
 *
 * "Server-side URL fetching is SSRF-guarded -- evidence archiving and
 *  direct-URL sources fetch through an allowlisted egress proxy with private
 *  address ranges blocked."
 *
 * Evidence archiving takes a URL from a user and fetches it from inside the
 * network. Without this, "attach evidence" is a request forgery primitive
 * pointed at cloud metadata endpoints and internal services.
 *
 * The address classification is pure, so it is tested directly rather than by
 * hoping the network behaves.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** Hostnames that name the machine itself, whatever they resolve to. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal',
]);

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return true; // unparseable is not provably public
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true;                        // "this network"
  if (a === 10) return true;                       // private
  if (a === 127) return true;                      // loopback
  if (a === 169 && b === 254) return true;         // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true;         // private
  if (a === 192 && b === 0) return true;           // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true;                       // multicast and reserved
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0] ?? '';
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fe80')) return true;       // link-local
  if (/^f[cd]/.test(value)) return true;           // unique local
  if (value.startsWith('ff')) return true;         // multicast
  // IPv4-mapped (::ffff:a.b.c.d) inherits the IPv4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Resolve and check before anything opens a socket.
 *
 * This is not proof against a rebinding attack -- the name can resolve
 * differently when the browser fetches it -- which is why the egress proxy is
 * the other half of D-06 and this is the half we control.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('that is not a URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeUrlError(`only http and https can be archived, not ${url.protocol}`);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`refusing to fetch ${hostname}`);
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new UnsafeUrlError(`refusing to fetch a private address (${hostname})`);
  }
  if (!isIP(hostname)) {
    let addresses;
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new UnsafeUrlError(`could not resolve ${hostname}`);
    }
    if (addresses.length === 0) throw new UnsafeUrlError(`could not resolve ${hostname}`);
    for (const { address } of addresses) {
      if (isPrivateAddress(address)) {
        throw new UnsafeUrlError(`${hostname} resolves to a private address`);
      }
    }
  }
  return url;
}
