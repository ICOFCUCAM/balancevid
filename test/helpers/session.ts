/**
 * An owner's session, for a test that calls a route directly.
 *
 * Routes that used to have no authorisation of their own now have some — a
 * guest may record into a room, so "this request reached the handler" stopped
 * being the same statement as "this is the owner". A test that calls such a
 * handler has to say who it is, exactly as a browser does.
 *
 * The password hash must be in the environment BEFORE the auth config module
 * first loads, which is the same rule `BALANCEVID_VAR` follows.
 */
import { AUTH, hashPassword } from '../../src/auth/config.js';

const PASSWORD = 'test-owner-password';

/**
 * Give this instance a password.
 *
 * Set on the config OBJECT rather than through the environment, and that is
 * not a shortcut: `AUTH` is read once when the module loads, and the module
 * has already loaded by the time anything can call this — importing
 * `hashPassword` is what loads it. An env var set afterwards would be read by
 * nobody, and the test would fail for a reason that has nothing to do with
 * what it is testing.
 */
export function configureOwner(): string {
  const hash = hashPassword(PASSWORD);
  (AUTH as { passwordHash: string | null }).passwordHash = hash;
  return hash;
}

/** A cookie header carrying a valid owner session for that password. */
export async function ownerCookie(hash: string): Promise<string> {
  const { SESSION_COOKIE, issueSession } = await import('../../src/auth/session.js');
  const { token } = await issueSession(hash, 1);
  return `${SESSION_COOKIE}=${token}`;
}
