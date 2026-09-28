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
 *
 * THE TOKEN NAMES WHO IT IS FOR.  [U-24]
 *
 *   v2.<account>.<expiry>.<signature>
 *
 * The account id is INSIDE the signature, not beside it, for the reason a
 * guest's conversation id is (`guest.ts`): a subject a holder can edit is not
 * a claim, it is a suggestion. Changing the account in a v2 token invalidates
 * it.
 *
 * WHAT IS DELIBERATELY NOT HERE. The key is still derived from ONE secret —
 * the instance's password hash — and not from the named account's own. It
 * cannot be: this is verified in middleware, which runs on the edge runtime
 * with no filesystem, so a per-account secret on disk is unreachable at the
 * gate. Making it reachable would mean either weakening middleware to a
 * cookie-shaped-object check or moving it to the Node runtime, and neither
 * is needed while one account exists. Per-account credentials arrive with
 * sign-up, verified in a route that can read disk.
 *
 * So what this step buys is exactly one thing: a request can say WHICH
 * account it belongs to, provably. Who may do what is unchanged.
 *
 * V1 TOKENS ARE STILL ACCEPTED, and that is not laziness. A deploy that
 * signed out everybody holding a valid session — for a change that alters
 * nothing they can see — would be a self-inflicted outage. An unnamed token
 * is the owner's, because on an instance with one account there is nobody
 * else it could be. They expire on their own within the session window and
 * the acceptance can go with them.
 */

import { OWNER_ACCOUNT_ID } from '../domain/account.js';

export const SESSION_COOKIE = 'balancevid_session';
const DOMAIN_SEPARATOR = 'balancevid.session.v1';
/**
 * What is issued now.
 *
 *   v3.<account>.<issued>.<expiry>.<signature>
 *
 * The ISSUE TIME is the addition, and it exists so an account can say "every
 * session older than this is void" without a session table to keep. A token
 * that does not record when it was made cannot be placed on either side of
 * that line. [account.ts]
 */
const VERSION = 'v3';
/**
 * Still honoured, so a deploy signs nobody out. Each aged out within the
 * session window and the acceptance can go when the last one has.
 *
 *   v2.<account>.<expiry>.<signature>    named, no issue time
 *   v1.<expiry>.<signature>              the owner's, no issue time
 */
const NAMED_NO_ISSUE = 'v2';
const LEGACY_VERSION = 'v1';

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
  account: string = OWNER_ACCOUNT_ID,
): Promise<{ token: string; expiresAt: number }> {
  /*
   * An id with a dot in it would split into the wrong parts and a token that
   * parsed as something else is the worst kind of bug to have in a gate.
   * `safe()` already refuses these everywhere a path is built; this is the
   * same alphabet, checked where the same assumption is made.
   */
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(account)) {
    throw new Error(`unsafe account id: ${JSON.stringify(account)}`);
  }
  const expiresAt = now + hours * 3600_000;
  const payload = `${VERSION}.${account}.${now}.${expiresAt}`;
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
  return (await readSession(token, passwordHash, now)) !== null;
}

/**
 * The same check, but it hands back WHO rather than merely yes.
 *
 * Middleware wants the yes — it decides whether a request may proceed, not
 * what it may see. A route wants the subject, because that is the thing it
 * will read and write on behalf of. One verification, two questions.
 */
export interface SessionClaim {
  account: string;
  expiresAt: number;
  /**
   * When it was issued, for the revocation line. Absent on the older
   * formats, which did not record it — and absent is treated as revoked
   * once a line exists, because it cannot be shown to be after one.
   */
  issuedAt?: number;
}

export async function readSession(
  token: string | undefined | null, passwordHash: string, now = Date.now(),
): Promise<SessionClaim | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 3 || parts.length > 5) return null;

  /*
   * Each version is matched on its name AND its exact shape. A body of one
   * version wearing another's label must not parse, or the verifier and the
   * signer would disagree about which fields were covered.
   */
  const version = parts[0]!;
  const signature = parts[parts.length - 1]!;
  let account: string;
  let expiry: string;
  let issued: string | undefined;
  if (version === VERSION && parts.length === 5) {
    account = parts[1]!;
    issued = parts[2]!;
    expiry = parts[3]!;
  } else if (version === NAMED_NO_ISSUE && parts.length === 4) {
    account = parts[1]!;
    expiry = parts[2]!;
  } else if (version === LEGACY_VERSION && parts.length === 3) {
    account = OWNER_ACCOUNT_ID;
    expiry = parts[1]!;
  } else {
    return null;
  }

  const key = await sessionKey(passwordHash);
  const signed = parts.slice(0, -1).join('.');
  const expected = base64url(new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(signed)),
  ));
  if (!timingSafeStringEqual(signature, expected)) return null;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const issuedAt = issued === undefined ? undefined : Number(issued);
  if (issuedAt !== undefined && !Number.isFinite(issuedAt)) return null;
  return { account, expiresAt, ...(issuedAt === undefined ? {} : { issuedAt }) };
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
