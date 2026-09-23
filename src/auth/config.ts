/**
 * Who is allowed in.  [Doctrine D-03, D-06]
 *
 * "Unpublished is private by default." (D-03) "One user reaching another's
 * unpublished recordings is the worst incident this product can have." (D-06)
 *
 * This instance has one owner. That is not tenancy — tenancy is a data-layer
 * concern D-06 is explicit about and this does not pretend to solve it — but
 * it is the difference between a private instance and a public one, and the
 * app is reachable on the open internet.
 *
 * FAIL CLOSED. With no password configured the application does not fall back
 * to open; it locks and says how to unlock it. An auth system whose
 * misconfiguration state is "everyone gets in" is not an auth system.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Deliberately expensive: this is the only thing standing in front of the app. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

export interface AuthConfig {
  /** Null when nothing is configured — the locked state, never an open one. */
  passwordHash: string | null;
  sessionHours: number;
}

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString('hex');
  const derived = scryptSync(password.normalize('NFKC'), s, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${s}$${derived.toString('hex')}`;
}

/**
 * Constant time, and tolerant of a malformed stored hash.
 *
 * A wrong password and a corrupt hash must take the same path: an attacker who
 * can tell them apart learns whether a password is configured at all.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, expected] = parts;
  try {
    const derived = scryptSync(password.normalize('NFKC'), salt!, SCRYPT.keylen, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    const want = Buffer.from(expected!, 'hex');
    return want.length === derived.length && timingSafeEqual(want, derived);
  } catch {
    return false;
  }
}

/**
 * Read the configuration once.
 *
 * BALANCEVID_PASSWORD_HASH is the one to deploy with — the plaintext variable
 * exists because a self-hoster setting this up at midnight will otherwise put
 * the password in the hash variable and be locked out with no way to tell why.
 */
export function loadAuthConfig(
  // Not NodeJS.ProcessEnv: this reads three keys and should be callable with
  // three keys, in a test, without conjuring a whole process environment.
  env: Record<string, string | undefined> = process.env,
): AuthConfig {
  const hash = env['BALANCEVID_PASSWORD_HASH']?.trim()
    || (env['BALANCEVID_PASSWORD']?.trim()
      ? hashPassword(env['BALANCEVID_PASSWORD']!.trim())
      : '');

  const sessionHours = Number(env['BALANCEVID_SESSION_HOURS'] ?? 24 * 14);

  // The signing key is derived from the hash in session.ts, so a password
  // change revokes every outstanding session. It is derived there, with Web
  // Crypto, because middleware runs where node:crypto does not exist.
  return {
    passwordHash: hash || null,
    sessionHours: Number.isFinite(sessionHours) && sessionHours > 0 ? sessionHours : 336,
  };
}

export const AUTH = loadAuthConfig();

/** True when nothing is configured: the app is locked, not open. */
export function isLocked(config: AuthConfig = AUTH): boolean {
  return config.passwordHash === null;
}
