/**
 * One code, for the downloads.  [Doctrine D-21, D-03; TAKE-PLATFORM P6]
 *
 * > *"all should have activation code for now so that we can use one
 * > master code to open them."*
 *
 * ONE CODE AND NOT ONE PER DOWNLOAD, because that is what was asked
 * for and because the alternative is a table of codes to keep — and
 * a table of codes is an accounts system wearing a hat. When there
 * is a reason to tell two downloaders apart there will be a reason
 * to know who they are, and that is a different decision. [D-19]
 *
 * NOT CONFIGURED MEANS CLOSED, said out loud rather than discovered.
 * The alternative — no variable, no gate — is a deployment that
 * forgot one line and published its binaries to the internet
 * without anybody deciding to. A refusal is visible on the first
 * attempt; an open door is visible only to whoever walks through
 * it. So the page says "this installation has not been given an
 * activation code yet" and the route refuses, and one environment
 * variable turns it on. [D-21]
 *
 * THE CODE IS NEVER PUT IN A URL. It is posted once and exchanged
 * for a cookie, because a code in a query string is a code in the
 * browser's history, in the proxy's log and in whatever the person
 * pastes the link into.
 *
 * AND THE COOKIE IS KEYED TO THE CODE ITSELF, so changing the code
 * invalidates every pass issued under the old one without anything
 * having to remember them. The same property `sessionKey` gets from
 * the password hash. [session.ts]
 */

import { timingSafeEqual } from 'node:crypto';

const DOMAIN_SEPARATOR = 'balancevid.activation.v1';
const VERSION = 'a1';

export const ACTIVATION_COOKIE = 'balancevid_activation';

/** A pass lasts a day: long enough for one sitting, short enough to matter. */
export const ACTIVATION_HOURS = 24;

export function activationCode(): string | null {
  const given = (process.env['BALANCEVID_ACTIVATION'] ?? '').trim();
  return given.length > 0 ? given : null;
}

/** What the page says when nobody has configured one. */
export const NOT_CONFIGURED =
  'This installation has not been given an activation code yet, so its '
  + 'downloads are closed. Set BALANCEVID_ACTIVATION and they open to '
  + 'anybody who has the code.';

export const WRONG_CODE = 'that code is not this installation’s';

/**
 * Is this the code?
 *
 * CONSTANT TIME, AND ON A DIGEST rather than on the strings. Two
 * codes of different lengths cannot be compared by
 * `timingSafeEqual` at all — it throws — and catching that throw
 * would leak the length through the control flow instead of
 * through the clock. Hashing first makes every comparison the same
 * thirty-two bytes. [session.ts]
 */
export async function activationMatches(given: string): Promise<boolean> {
  const code = activationCode();
  if (code === null) return false;
  const digest = async (of: string) => new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(of)));
  const [a, b] = await Promise.all([digest(given), digest(code)]);
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ *
 *  The pass, so the code is typed once.
 * ------------------------------------------------------------------ */

const encoder = new TextEncoder();
let keyFor: { code: string; key: Promise<CryptoKey> } | null = null;

/**
 * The signing key, derived from the code and cached for one code.
 *
 * KEYED TO THE CODE ITSELF, so changing `BALANCEVID_ACTIVATION`
 * invalidates every pass issued under the old one without anything
 * having to remember that it did. The property `sessionKey` gets from
 * the password hash, for the same reason. [session.ts]
 */
function passKey(code: string): Promise<CryptoKey> {
  if (keyFor?.code === code) return keyFor.key;
  const derived = (async () => {
    const outer = await crypto.subtle.importKey(
      'raw', encoder.encode(code), { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign'],
    );
    const material = await crypto.subtle.sign(
      'HMAC', outer, encoder.encode(DOMAIN_SEPARATOR));
    return crypto.subtle.importKey(
      'raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
  })();
  keyFor = { code, key: derived };
  return derived;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A pass, good until it expires or the installation's code changes. */
export async function issuePass(
  now = Date.now(),
): Promise<{ token: string; expiresAt: number } | null> {
  const code = activationCode();
  if (code === null) return null;
  const expiresAt = now + ACTIVATION_HOURS * 3600_000;
  const payload = `${VERSION}.${expiresAt}`;
  const signature = await crypto.subtle.sign(
    'HMAC', await passKey(code), encoder.encode(payload));
  return { token: `${payload}.${base64url(new Uint8Array(signature))}`, expiresAt };
}

/**
 * Is this pass this installation's, and still good?
 *
 * THE SIGNATURE IS CHECKED BEFORE THE EXPIRY, as it is in `session.ts`:
 * checking the cheap thing first tells an attacker the shape of a valid
 * token from the response time alone.
 */
export async function passHolds(
  token: string | undefined | null, now = Date.now(),
): Promise<boolean> {
  const code = activationCode();
  if (code === null || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const [, expiry, given] = parts;
  const expected = await crypto.subtle.sign(
    'HMAC', await passKey(code), encoder.encode(`${VERSION}.${expiry}`));
  const mine = base64url(new Uint8Array(expected));
  if (mine.length !== given!.length) return false;
  if (!timingSafeEqual(encoder.encode(mine), encoder.encode(given!))) return false;
  const until = Number(expiry);
  return Number.isFinite(until) && until > now;
}

/** The cookie that carries it. `Secure` only where the request was. */
export function passCookie(
  token: string, expiresAt: number, secure: boolean,
): string {
  const age = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  return `${ACTIVATION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; `
    + `Max-Age=${age}${secure ? '; Secure' : ''}`;
}
