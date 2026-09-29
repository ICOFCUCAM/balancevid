import { isOwner } from '../../../../../src/auth/request.js';
import { historyState } from '../../../../../src/store/history.js';
import {
  auditPerformance, stepPerformance,
} from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Where the document has been.  [MASTER-EDIT §12 P1]
 *
 * GET says whether there is anywhere to go, so a button can be disabled with
 * the truth rather than hopefully. POST walks one step.
 *
 * THE OWNER'S, LIKE EVERY OTHER EDIT. A guest may change their own presence
 * and nothing else (ROOM §6); undo rewrites the document, so it is the same
 * authority as making the edit in the first place.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'performance not found');
  return json(await historyState(id));
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'performance not found');
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action !== 'undo' && body.action !== 'redo') {
    return fail(400, `unknown action: ${body.action}`);
  }
  const performance = await stepPerformance(id, body.action === 'undo' ? -1 : 1);
  /*
   * NOTHING TO UNDO IS NOT AN ERROR. A button pressed once too often at the
   * start of a history is an ordinary thing to do, and a 4xx would make the
   * page show a failure for it. The state comes back either way and the
   * caller can see nothing moved.
   */
  if (!performance) return json({ moved: false, ...(await historyState(id)) });
  await auditPerformance(id, { action: `performance.${body.action}`, detail: {} });
  return json({ moved: true, performance, ...(await historyState(id)) });
}
