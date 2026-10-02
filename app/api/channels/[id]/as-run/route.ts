import { isOwner } from '../../../../../src/auth/request.js';
import { asRunCsv } from '../../../../../src/domain/asRun.js';
import { dayOf, ranDays, readRan } from '../../../../../src/store/asRun.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * What this channel actually transmitted.  [CHANNEL §5, §18, D-21, C-32]
 *
 *     /api/channels/<id>/as-run              today, as JSON
 *     /api/channels/<id>/as-run?day=2026-10-01
 *     /api/channels/<id>/as-run?format=csv   the file people ask for
 *
 * THE OWNER'S ONLY. An as-run names every asset a channel played and
 * when, which is a schedule, an inventory and a set of viewing
 * figures' denominators in one — none of it a viewer's business. The
 * viewer's page already says what is on NOW, which is the part that
 * is public. [§17]
 *
 * CSV BECAUSE THAT IS WHAT GETS HANDED OVER. An as-run is evidence
 * for a regulator, a rights holder or an advertiser, and the people
 * who ask for one ask for a file they can open. JSON is here too for
 * anybody building on it.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'not found');

  const asked = new URL(request.url);
  /*
   * A DAY, IN UTC, AND SHAPED LIKE ONE. The store already passes
   * this through `safe`, so a traversal cannot escape the channel's
   * directory; this rejects it earlier and says why, because
   * `2026-10-01` and `../../etc` deserve different answers.
   */
  const wanted = asked.searchParams.get('day') ?? dayOf(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wanted)) {
    return fail(400, 'a day looks like 2026-10-01');
  }

  const log = await readRan(id, wanted);

  if (asked.searchParams.get('format') === 'csv') {
    return new Response(asRunCsv(log), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        /* Named so a folder of them sorts and reads. */
        'content-disposition':
          `attachment; filename="as-run-${id}-${wanted}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  return json({
    day: wanted,
    /* Which other days there is a log for, so a client need not guess. */
    days: await ranDays(id),
    ran: log,
  });
}
