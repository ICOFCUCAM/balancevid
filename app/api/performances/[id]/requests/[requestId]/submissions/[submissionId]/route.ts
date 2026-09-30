import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { paths } from '../../../../../../../../src/store/paths.js';
import { loadRequest } from '../../../../../../../../src/store/requests.js';
import { fail } from '../../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string; requestId: string; submissionId: string }>;
};

/** The shape our ids have. Refused rather than sanitised. [INV-15] */
const REQUEST = /^req_[A-Za-z0-9]{1,64}$/;
const SUBMISSION = /^sub_[A-Za-z0-9_-]{1,120}$/;

/**
 * A submission, for the producer to watch before deciding.
 *   [TAKE-APP T10; D-25]
 *
 * "Preview / Accept / Reject / Hold." A producer who has to accept
 * something to find out what it is has not been given a choice, and
 * accepting is the one moment a submission becomes production
 * material — so watching it first has to be possible without it.
 *
 * THE OWNER'S ROUTE, not the participant's. It is behind the session
 * like everything else a producer owns; the link the recording came
 * in on opens the request, never the inbox.
 *
 * CHECKED AGAINST THE PERFORMANCE THAT ASKED. Without that check a
 * producer could watch another producer's submissions by editing a
 * path, which is exactly the boundary D-25 draws.
 *
 * AND ONLY ONE THAT HAS BEEN SENT. Segments on disk for a recording
 * the performer deleted, or has not sent, are not a submission —
 * they are bytes the participant has not given anybody. [T4]
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id, requestId, submissionId } = await params;
  if (!REQUEST.test(requestId)) return fail(404, 'no such submission');
  if (!SUBMISSION.test(submissionId)) return fail(404, 'no such submission');

  let found;
  try {
    found = await loadRequest(requestId);
  } catch {
    return fail(404, 'no such submission');
  }
  if (found.holder.kind !== 'performance' || found.holder.id !== id) {
    return fail(404, 'no such submission');
  }
  if (!(found.submissions ?? []).some((one) => one.assetId === submissionId)) {
    return fail(404, 'no such submission');
  }

  const path = paths.requestAsset(found.id, submissionId, 'webm');
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return fail(409, 'that recording is still arriving');
  }

  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      'content-type': 'video/webm',
      'content-length': String(size),
      /* Watched more than once while a producer makes up their mind,
         and it never changes once it has been sent. */
      'cache-control': 'private, max-age=3600',
    },
  });
}
