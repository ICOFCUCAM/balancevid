import { isSignedIn } from '../../../../src/domain/account.js';
import { whoIs } from '../../../../src/auth/request.js';
import { revokeSessions } from '../../../../src/store/accounts.js';
import { clearedCookie, isSecureRequest } from '../../../../src/auth/session.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sign out.  [Doctrine D-06, U-24]
 *
 * TWO DIFFERENT THINGS, and the difference is the whole point:
 *
 *   {}                       clear this cookie. This browser, nothing else.
 *   { everywhere: true }     void every session this account has issued.
 *
 * The plain form is unchanged and stays the default, because it is what the
 * button in the corner means: I am done on this machine. Ending every other
 * session as well would be a surprise, and a nasty one on a shared show.
 *
 * WHAT `everywhere` FIXES. This route used to say, accurately: "the token is
 * self-contained and stateless, so this clears the cookie rather than
 * revoking anything. A token that has genuinely leaked is revoked by
 * changing the password." True, and a poor answer to a laptop left on a
 * train — the remedy for one lost session was to change the instance
 * password and end every session everywhere, including the ones you still
 * wanted. A date on the account record draws the line instead, and the
 * token stays stateless: no session table, nothing to keep, and a restart
 * still signs nobody out.
 *
 * IT REVOKES THIS SESSION TOO, deliberately. "Everywhere" that quietly meant
 * "everywhere except here" would be a button that does not do what it says,
 * and the machine you are on is as likely to be the compromised one as any
 * other.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { everywhere?: unknown };
  const cookie = clearedCookie(isSecureRequest(request));

  if (body.everywhere !== true) {
    return json({ ok: true }, { headers: { 'set-cookie': cookie } });
  }

  /*
   * Revoking needs to know whose sessions, so it needs a caller. A stranger
   * asking gets 401 rather than a way to sign the owner out of everything
   * by POSTing at a URL.
   */
  const principal = await whoIs(request);
  if (!isSignedIn(principal)) return fail(401, 'not signed in');

  const at = await revokeSessions(principal.account);
  /* The cookie goes as well: this session is one of the ones just voided. */
  return json({ ok: true, revokedBefore: at }, { headers: { 'set-cookie': cookie } });
}
