import {
  NOT_CONFIGURED, WRONG_CODE, activationCode, activationMatches,
  issuePass, passCookie,
} from '../../../../src/web/activation.js';
import { fail, json } from '../../../../src/web/http.js';
import { isSecureRequest } from '../../../../src/auth/session.js';

export const dynamic = 'force-dynamic';

/**
 * The code, typed once.  [D-21, D-03]
 *
 * POSTED, NEVER PUT IN A URL. A code in a query string is a code in
 * the browser's history, in every proxy log between here and there,
 * and in whatever the person pastes the link into afterwards. It is
 * exchanged for a pass that the download itself checks.
 *
 * THE BODY IS NOT ECHOED BACK and the refusal does not say how close
 * it was. "That code is not this installation's" is the whole of
 * what a wrong code learns.
 */
export async function POST(request: Request): Promise<Response> {
  if (activationCode() === null) return fail(503, NOT_CONFIGURED);

  let given = '';
  try {
    const body = await request.json() as { code?: unknown };
    given = typeof body.code === 'string' ? body.code.trim() : '';
  } catch {
    return fail(400, 'send {"code":"…"}');
  }
  if (given.length === 0) return fail(400, 'type the activation code');
  if (!(await activationMatches(given))) return fail(403, WRONG_CODE);

  const pass = await issuePass();
  /* `activationCode()` was not null a moment ago and this process has
     not restarted since, so this cannot be null — said to the
     compiler rather than asserted at it. */
  if (!pass) return fail(503, NOT_CONFIGURED);

  return json({ ok: true, expiresAt: pass.expiresAt }, {
    headers: {
      'set-cookie': passCookie(
        pass.token, pass.expiresAt, isSecureRequest(request)),
    },
  });
}
