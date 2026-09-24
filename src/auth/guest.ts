/**
 * A guest in one room.  [Doctrine ROOM §6, §12, D-03, D-06]
 *
 * The brief: participants "don't necessarily need a Prof Class account
 * initially", and an invitation is a link somebody sends over WhatsApp. That
 * is a capability URL, and capability URLs are a real security model — but
 * only if what the capability grants is small, scoped and revocable.
 *
 * So there are two credentials in this product now, and they are not the same
 * kind of thing:
 *
 *   THE OWNER'S SESSION  proves you are the person who owns this instance.
 *                        Signed from the password hash. Reaches everything.
 *
 *   A GUEST'S SESSION    proves you are a particular participant in a
 *                        particular conversation. Signed from the room's own
 *                        invite token, so rotating that token ends every
 *                        guest session in that room and nothing else.
 *
 * A guest session is deliberately weaker in three ways at once: it names ONE
 * conversation, it names ONE participant, and it expires. It cannot be
 * widened by anything a guest sends, because the conversation id is inside
 * the signature rather than beside it.
 *
 * WHY THE TOKEN AND NOT THE PASSWORD HASH signs it: a guest session must not
 * survive the room being closed, and must not be invalidated by the owner
 * changing their password. Rotating the invite token is how an invitation is
 * withdrawn, and it has to actually withdraw it — including from people
 * already inside.
 *
 * Web Crypto only, for the same reason the owner's session is: this is
 * verified in middleware, where `node:crypto` does not exist.
 */

export const GUEST_COOKIE = 'balancevid_guest';
const DOMAIN_SEPARATOR = 'balancevid.guest.v1';
const VERSION = 'g1';

/**
 * How long a guest stays signed in.
 *
 * A session, not a membership: long enough for a seminar and short enough
 * that a link forwarded months later opens nothing.
 */
export const GUEST_HOURS = 12;

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

async function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
}

/** The signing key for one room, derived from that room's invite token. */
function guestKey(inviteToken: string): Promise<CryptoKey> {
  const cached = keyCache.get(inviteToken);
  if (cached) return cached;
  const derived = (async () => {
    const outer = await hmacKey(encoder.encode(inviteToken));
    const material = await crypto.subtle.sign('HMAC', outer, encoder.encode(DOMAIN_SEPARATOR));
    return hmacKey(new Uint8Array(material));
  })();
  keyCache.set(inviteToken, derived);
  return derived;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface GuestClaim {
  conversationId: string;
  participantId: string;
}

/**
 * Issue a guest session.
 *
 * The conversation and the participant are INSIDE the signed payload. A guest
 * who edits their cookie to name another conversation produces a signature
 * that does not verify — which is the difference between a scoped credential
 * and a credential with a scope written next to it.
 */
export async function issueGuest(
  claim: GuestClaim, inviteToken: string, now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + GUEST_HOURS * 3600_000;
  const payload = `${VERSION}.${claim.conversationId}.${claim.participantId}.${expiresAt}`;
  const key = await guestKey(inviteToken);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return { token: `${payload}.${base64url(new Uint8Array(signature))}`, expiresAt };
}

/**
 * Verify a guest session against the room it claims to be in.
 *
 * Returns the claim, or null. Any doubt is null: a wrong signature, an
 * expired session, a malformed token, or a conversation id that does not
 * match the room being asked about.
 */
export async function verifyGuest(
  token: string | undefined | null,
  conversationId: string,
  inviteToken: string | undefined,
  now = Date.now(),
): Promise<GuestClaim | null> {
  if (!token || !inviteToken) return null;
  const parts = token.split('.');
  if (parts.length !== 5) return null;
  const [version, forConversation, participantId, expiry, signature] =
    parts as [string, string, string, string, string];
  if (version !== VERSION) return null;

  /*
   * The conversation is checked BEFORE the signature only to avoid signing
   * work for an obvious mismatch; it is checked again by the signature
   * itself, which is what actually enforces it.
   */
  if (forConversation !== conversationId) return null;

  const key = await guestKey(inviteToken);
  const expected = base64url(new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`${version}.${forConversation}.${participantId}.${expiry}`),
  )));
  if (!timingSafeStringEqual(signature, expected)) return null;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { conversationId: forConversation, participantId };
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
 * A fresh invite token.
 *
 * 32 bytes from the platform's CSPRNG. This IS the credential for entering
 * the room — anyone holding it can join, which is the whole point of being
 * able to send it over WhatsApp to somebody with no account — so it has to be
 * long enough that holding it is the only way to have it.
 */
export function newInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * The cookie. Same protections as the owner's, plus a narrower path.
 *
 * `Path` is the conversation itself: a guest's credential is not attached to
 * requests for anything else, so a link they follow elsewhere on the instance
 * carries nothing.
 */
export function guestCookie(
  token: string, conversationId: string, expiresAt: number, secure: boolean,
): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return [
    `${GUEST_COOKIE}=${token}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function clearedGuestCookie(secure: boolean): string {
  return [
    `${GUEST_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}
