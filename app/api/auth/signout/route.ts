import { clearedCookie, isSecureRequest } from '../../../../src/auth/session.js';
import { json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sign out.
 *
 * The token is self-contained and stateless, so this clears the cookie rather
 * than revoking anything. A token that has genuinely leaked is revoked by
 * changing the password, which re-derives the signing key and invalidates
 * every session at once.
 */
export async function POST(request: Request): Promise<Response> {
  return json({ ok: true }, {
    headers: { 'set-cookie': clearedCookie(isSecureRequest(request)) },
  });
}
