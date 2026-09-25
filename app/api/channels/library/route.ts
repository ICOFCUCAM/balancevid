import { isOwner } from '../../../../src/auth/request.js';
import { broadcastLibrary } from '../../../../src/store/broadcastLibrary.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * What there is to broadcast.  [Doctrine CHANNEL §3, D-18]
 *
 * Finished renders from both studios, as REFERENCES. Nothing here is copied,
 * staged or moved into a channel: the scheduler clicks one of these and the
 * document stores the same reference it was handed.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await isOwner(request))) return fail(404, 'not found');
  return json({ items: await broadcastLibrary() });
}
