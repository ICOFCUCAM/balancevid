import { AUTH, isLocked, verifyPassword } from '../../../../src/auth/config.js';
import {
  issueSession, isSecureRequest, sessionCookie,
} from '../../../../src/auth/session.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Slows a guessing attempt without a store to keep. [D-06] */
const WRONG_PASSWORD_DELAY_MS = 400;

export async function POST(request: Request): Promise<Response> {
  if (isLocked()) {
    return fail(503, 'this instance has no password configured');
  }

  const body = await request.json().catch(() => ({})) as { password?: string; next?: string };
  const password = typeof body.password === 'string' ? body.password : '';

  if (!verifyPassword(password, AUTH.passwordHash!)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    // One message for every failure. "No such user" and "wrong password" are
    // the same answer here, and there is only one account anyway.
    return fail(401, 'that is not the password');
  }

  const { token, expiresAt } = await issueSession(AUTH.passwordHash!, AUTH.sessionHours);
  return json({ ok: true, expiresAt }, {
    headers: { 'set-cookie': sessionCookie(token, expiresAt, isSecureRequest(request)) },
  });
}
