import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { paths } from '../../../../../../../src/store/paths.js';
import { loadRequest } from '../../../../../../../src/store/requests.js';
import { fail } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string; requestId: string; submissionId: string }>;
};

/** The shape our ids have. Refused rather than sanitised. [INV-15] */
const REQUEST = /^req_[A-Za-z0-9]{1,64}$/;
const SUBMISSION = /^sub_[A-Za-z0-9_-]{1,120}$/;

/**
 * An answer, for the host to hear before they put it on air.
 *   [TIMELINE B14e; D-25, CHANNEL §5]
 *
 * "The host can cite their participation and play their view that is
 * already on the queue."
 *
 * THE OWNER'S ROUTE, not the participant's. It is behind the session
 * like everything else a producer owns — the link the answer came in
 * on opens the request, never the queue, and a viewer has no way to
 * ask for one at all.
 *
 * CHECKED AGAINST THE CHANNEL THAT ASKED. A request holds which
 * production it belongs to, and this serves a file only when that
 * production is the channel in the URL. Without that check a
 * broadcaster could read another broadcaster's answers by editing a
 * path, which is exactly the boundary D-25 draws.
 *
 * AND ONLY ONE THAT HAS BEEN SENT. Segments on disk for a recording
 * the performer deleted, or has not sent, are not an answer — they
 * are bytes the participant has not given anybody. [T4]
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id, requestId, submissionId } = await params;
  if (!REQUEST.test(requestId)) return fail(404, 'no such answer');
  if (!SUBMISSION.test(submissionId)) return fail(404, 'no such answer');

  let found;
  try {
    found = await loadRequest(requestId);
  } catch {
    return fail(404, 'no such answer');
  }
  if (found.holder.kind !== 'channel' || found.holder.id !== id) {
    return fail(404, 'no such answer');
  }
  if (!(found.submissions ?? []).some((one) => one.assetId === submissionId)) {
    return fail(404, 'no such answer');
  }

  const path = paths.requestAsset(found.id, submissionId, 'webm');
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return fail(409, 'that answer is still arriving');
  }

  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      'content-type': 'video/webm',
      'content-length': String(size),
      /* Auditioned and played more than once in a programme, and it
         never changes once it has been sent. */
      'cache-control': 'private, max-age=3600',
    },
  });
}
