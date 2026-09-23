/**
 * The owner's session.  [Doctrine D-06]
 *
 * A signed, expiring token in an HttpOnly cookie. No session store: the token
 * carries its own expiry and its signature is the proof, so a restart does not
 * sign everyone out and there is no table to keep.
 *
 * WEB CRYPTO ONLY, deliberately. This is verified in Next.js middleware, which
 * runs where `node:crypto` does not exist. One implementation that works in
 * both places beats two that must agree and eventually will not.
 *
 * The signing key is derived from the password hash, so changing the password
 * invalidates every outstanding session — which is the main thing a password
 * change is for.
 */

export const SESSION_COOKIE = 'balancevid_session';
const DOMAIN_SEPARATOR = 'balancevid.session.v1';
const VERSION = 'v1';

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

async function hmacKey(secret: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
}

/**
 * The signing key for a given password hash.
 *
 * Cached: deriving it is cheap, but middleware runs on every request and this
 * is on that path.
 */
export function sessionKey(passwordHash: string): Promise<CryptoKey> {
  const cached = keyCache.get(passwordHash);
  if (cached) return cached;
  const derived = (async () => {
    const outer = await hmacKey(encoder.encode(passwordHash));
    const material = await crypto.subtle.sign('HMAC', outer, encoder.encode(DOMAIN_SEPARATOR));
    return hmacKey(new Uint8Array(material));
  })();
  keyCache.set(passwordHash, derived);
  return derived;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function issueSession(
  passwordHash: string, hours: number, now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + hours * 3600_000;
  const payload = `${VERSION}.${expiresAt}`;
  const key = await sessionKey(passwordHash);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return { token: `${payload}.${base64url(new Uint8Array(signature))}`, expiresAt };
}

/**
 * Verify a token. Any doubt is a no.
 *
 * The comparison is constant time on the signature, and the expiry is checked
 * only after the signature verifies — checking it first would let an attacker
 * learn the shape of a valid token from response timing alone.
 */
export async function verifySession(
  token: string | undefined | null, passwordHash: string, now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, expiry, signature] = parts as [string, string, string];
  if (version !== VERSION) return false;

  const key = await sessionKey(passwordHash);
  const expected = base64url(new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${version}.${expiry}`)),
  ));
  if (!timingSafeStringEqual(signature, expected)) return false;

  const expiresAt = Number(expiry);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/** Length-independent, comparison-time-independent. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * The cookie.  [D-06]
 *
 * HttpOnly so a script cannot read it, SameSite=Lax so a third-party form
 * cannot post with it while an ordinary link still works, and Secure whenever
 * the request arrived over HTTPS — which on a deployment behind a proxy means
 * reading the forwarded protocol, not the socket.
 */
export function sessionCookie(token: string, expiresAt: number, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function clearedCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

/** Behind a reverse proxy the socket is plain HTTP; the header is the truth. */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]!.trim() === 'https';
  return new URL(request.url).protocol === 'https:';
}
