import { advance } from '../../../../../src/domain/participationEdit.js';
import { takesLeft } from '../../../../../src/domain/participation.js';
import { newId } from '../../../../../src/domain/ids.js';
import { mutateRequest, requestForLink } from '../../../../../src/store/requests.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ link: string }> };

/**
 * A recording begins.  [Doctrine D-25, U-06; TAKE-APP T3, T4]
 *
 * DECLARED BEFORE THE MEDIA EXISTS, exactly as a take in either studio
 * is: a phone that dies mid-song has still left evidence that somebody
 * was recording, and chunks arriving for a recording nobody declared
 * would have nowhere to go.
 *
 * IT IS NOT A SUBMISSION YET. Nothing is written onto the request's
 * `submissions` here — that happens when the recording is finished, and
 * only for the takes the participant chose to send. The brief is
 * explicit: "Take 3 doesn't have to reach the server at all if they
 * delete it locally." What this route hands back is a place to put
 * bytes, and a place with no bytes in it is swept with the request.
 *
 * SO THE CAP IS CHECKED HERE ANYWAY. A request that allows three takes
 * should not accept a fourth recording's chunks for four minutes and
 * then refuse the submission — the refusal belongs at the start, where
 * it costs nobody a performance.
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { link } = await params;
  const now = new Date().toISOString();
  const found = await requestForLink(link, now);
  if (!found) return fail(404, 'that link is not open');
  if (takesLeft(found) <= 0) {
    const allowed = found.allowed.takes ?? 1;
    return fail(409, `this request accepts ${allowed} recording(s) and has them`);
  }

  const id = newId('sub');
  await mutateRequest(found.id, (draft) => {
    try {
      advance(draft, 'recording', now);
    } catch {
      /* Already recording, which is the ordinary case for take two. */
    }
  }).catch(() => undefined);

  return json({ submissionId: id }, { status: 201 });
}
