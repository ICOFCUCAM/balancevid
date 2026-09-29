import { isOwner } from '../../../../../../../src/auth/request.js';
import {
  PerformanceEditError, setStabilize,
} from '../../../../../../../src/domain/performanceEdit.js';
import {
  NO_STABILIZER, stabilizerFor,
} from '../../../../../../../src/domain/stabilize.js';
import { detectShake } from '../../../../../../../src/render/ingest.js';
import { loadPerformance, mutatePerformance } from '../../../../../../../src/store/performances.js';
import { paths } from '../../../../../../../src/store/paths.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string; takeId: string }> };

/**
 * Measure this take's shake, and turn the stabiliser on.
 * [MASTER-EDIT §5, §8, §12 P2; Doctrine U-02]
 *
 * ONE CALL, as the colour match is one call, and for the same reason:
 * choosing "Gentle" is one act. Split into measure-then-set, every
 * interface offering it would have to sequence two requests and decide what
 * to show when the first succeeded and the second did not.
 *
 * THE MEASUREMENT IS A FILE, NOT A NUMBER, which is the difference from the
 * colour match. `vidstabdetect` writes a table of per-frame transforms, and
 * it is kept beside the mezzanine under a derived id — the same place the
 * proxy and the plate live. Nothing about it goes in the document: the
 * document says WHICH stabiliser, the file says what to undo, and the two
 * are re-derivable from the take, which does not change.
 *
 * SWITCHING OFF DOES NOT MEASURE, and does not delete the file either. A
 * take that was stabilised and is not any more renders as it was shot,
 * because the PLAN carries the transforms only when the field is set; and
 * an author who turns it back on should not wait through a second pass
 * over four minutes of video for an answer that cannot have changed.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  if (!(await isOwner(request))) return fail(401, 'not signed in');
  const { id, takeId } = await params;
  const body = await request.json().catch(() => ({})) as { stabilize?: unknown };
  const wanted = body.stabilize === null || body.stabilize === undefined
    ? NO_STABILIZER
    : String(body.stabilize);

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  const take = performance.takes.find((each) => each.id === takeId);
  if (!take) return fail(404, `no take ${takeId} in this performance`);

  const stabilizer = stabilizerFor(wanted);
  if (wanted !== NO_STABILIZER && !stabilizer) {
    return fail(400, `unknown stabilizer: ${wanted}`);
  }

  /*
   * REFUSED BEFORE THE PASS, not after it. `setStabilize` refuses a take
   * that is in a replaced background; finding that out after four minutes
   * of analysis would be four minutes an author waited to be told no.
   */
  if (stabilizer && take.environment.kind !== 'original') {
    return fail(400,
      `"${take.label}" is in a replaced background, which is keyed against a `
      + 'still of the room — stabilising moves the picture away from it. '
      + 'Put the take back in its own room first.');
  }

  if (stabilizer) {
    try {
      await detectShake(
        paths.performanceAsset(id, `${take.assetId}mezz`, 'mp4'),
        paths.performanceAsset(id, `${take.assetId}stab`, 'trf'),
        stabilizer,
      );
    } catch (error) {
      const said = error instanceof Error ? error.message.split('\n')[0] : '';
      return fail(422,
        `"${take.label}" could not be measured${said ? ` — ${said}` : ''}`);
    }
  }

  try {
    const updated = await mutatePerformance(id, (draft) => {
      setStabilize(draft, takeId, stabilizer ? stabilizer.id : null);
    });
    return json({ performance: updated });
  } catch (error) {
    if (error instanceof PerformanceEditError) return fail(400, error.message);
    return fail(404, error instanceof Error ? error.message : 'performance not found');
  }
}
