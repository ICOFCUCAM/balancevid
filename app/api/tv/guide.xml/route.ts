import {
  EXPORT_SPAN_MS, carried, xmltvGuide,
} from '../../../../src/domain/tvExport.js';
import { GUIDE_STEP_MS, guideWindow } from '../../../../src/domain/tvGuide.js';
import { listChannels } from '../../../../src/store/channels.js';
import { lineupFor } from '../../../../src/store/lineup.js';
import { originOf } from '../../../../src/web/share.js';

export const dynamic = 'force-dynamic';

/**
 * The guide, for a television.  [Doctrine CHANNEL §2, §4, D-03,
 * D-19, TV-NETWORK N-7]
 *
 * THE SAME WINDOW FUNCTION THE WEB GUIDE USES, over a longer
 * span. `guideWindow` snaps backwards to the half hour so the
 * document opens on the programme already in progress — a guide
 * beginning at the current instant shows everything that started
 * an hour ago as though it started now. A television asks the
 * same question the page does and must not get a differently
 * shaped answer. [D-19]
 *
 * TWELVE HOURS, bounded by what `airtime` will walk rather than
 * by a preference; the span and the reason are in `tvExport.ts`.
 *
 * NOT CACHED. It is a function of the clock, and a guide a
 * half-hour old is a guide showing the wrong programme as current
 * — the same argument `/api/channels/<id>/playlist` makes in
 * stronger terms.
 */
export async function GET(request: Request): Promise<Response> {
  const channels = await listChannels().catch(() => []);
  const lineup = await lineupFor(channels.map((one) => one.id)).catch(() => ({}));
  const { from, to } = guideWindow(Date.now(), EXPORT_SPAN_MS, GUIDE_STEP_MS);
  const body = xmltvGuide(
    carried(channels, lineup), originOf(request), from, to);
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'content-disposition': 'inline; filename="balancevid.xml"',
      'cache-control': 'no-store',
    },
  });
}
