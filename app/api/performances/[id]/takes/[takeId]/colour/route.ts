import { isOwner } from '../../../../../../../src/auth/request.js';
import {
  matchColour, setColourReading, setSoundReading,
} from '../../../../../../../src/domain/performanceEdit.js';
import { PerformanceEditError } from '../../../../../../../src/domain/performanceEdit.js';
import { matchQuality } from '../../../../../../../src/domain/colour.js';
import {
  measureColour, measureSound,
} from '../../../../../../../src/render/ingest.js';
import { loadPerformance, mutatePerformance } from '../../../../../../../src/store/performances.js';
import { paths } from '../../../../../../../src/store/paths.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string; takeId: string }> };

/**
 * Measure this take's picture, and match it to another.
 * [MASTER-EDIT §8, §12 P2; Doctrine U-02]
 *
 * ONE CALL RATHER THAN THREE, and that is a decision about what the author
 * is doing rather than about what the code needs. Choosing "match to Beach"
 * is one act. Expressed as three round trips — measure this take, measure
 * that take, then set the reference — every interface that offered it would
 * have to sequence them, handle two of the three failing, and decide what to
 * show in between. A partly-measured performance is a state nobody asked for.
 *
 * WHY IT IS A ROUTE AND NOT AN EDIT. Measuring reads the media, which is the
 * render layer's job; `performanceEdit.ts` never opens a file, which is what
 * makes it testable without one. So the measuring happens here and what goes
 * into the document is the number.
 *
 * THE MEZZANINE, NOT THE PROXY. The proxy is a small, heavily compressed
 * preview; its colour is close but its contrast is not the take's. Matching
 * two takes on their proxies would grade the compression.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  if (!(await isOwner(request))) return fail(401, 'not signed in');
  const { id, takeId } = await params;
  const body = await request.json().catch(() => ({})) as { to?: unknown };

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const to = body.to === null || body.to === undefined ? null : String(body.to);

  /*
   * Measured before the mutation rather than inside it: `mutatePerformance`
   * holds the document while the change is applied, and a pass over four
   * minutes of video is not a thing to hold a document for.
   */
  const readings = new Map<string, Awaited<ReturnType<typeof measureColour>>>();
  const heard = new Map<string, Awaited<ReturnType<typeof measureSound>>>();
  for (const wanted of [takeId, ...(to ? [to] : [])]) {
    const take = performance.takes.find((each) => each.id === wanted);
    if (!take) return fail(404, `no take ${wanted} in this performance`);
    try {
      const media = paths.performanceAsset(id, `${take.assetId}mezz`, 'mp4');
      readings.set(wanted, await measureColour(
        media, take.durationSamples / 48_000));
      /*
       * AND THE SOUND, IN THE SAME PASS OVER THE SAME FILE. Looking at a
       * take is one act to an author; making them press a second button
       * to have it listened to as well would be the product's internal
       * division of labour showing through. [MASTER-EDIT §12 P3]
       */
      heard.set(wanted, await measureSound(media));
    } catch (error) {
      /* The reason, not just the verdict: "could not be measured" sends an
         author looking at their take when the fault is this machine. */
      const said = error instanceof Error ? error.message.split('\n')[0] : '';
      return fail(422, `"${take.label}" could not be measured${said ? ` — ${said}` : ''}`);
    }
  }

  try {
    const updated = await mutatePerformance(id, (draft) => {
      for (const [wanted, reading] of readings) {
        setColourReading(draft, wanted, reading);
      }
      for (const [wanted, reading] of heard) {
        setSoundReading(draft, wanted, reading);
      }
      matchColour(draft, takeId, to);
    });
    /*
     * AND WHETHER THE GRADE WAS THE WHOLE ANSWER. A match that was clipped
     * looks, to an author, exactly like a match that failed: the take is
     * still darker than the reference and nothing said why. [U-19]
     */
    const me = updated.takes.find((each) => each.id === takeId);
    const reference = to
      ? updated.takes.find((each) => each.id === to)
      : undefined;
    const quality = matchQuality(me?.colour, reference?.colour);
    return json({
      performance: updated,
      ...(to && quality && !quality.matched ? { says: quality.says } : {}),
    });
  } catch (error) {
    if (error instanceof PerformanceEditError) return fail(400, error.message);
    return fail(404, error instanceof Error ? error.message : 'performance not found');
  }
}
