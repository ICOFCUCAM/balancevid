import { enqueue, findJob } from '../../../../src/store/queue.js';
import { audit } from '../../../../src/store/repository.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { jobId } = await params;
  const job = await findJob(jobId);
  if (!job) return fail(404, 'job not found');
  return json({ job });
}

/**
 * Try a failed job again.  [Doctrine D-07]
 *
 * Work a person did is not allowed to be lost to a job that fell over. A take
 * that failed to assemble still has all its chunks on disk, so assembling it
 * again is the whole recovery — and without this the only visible state is the
 * word "preparing", forever, with nothing the author can do about it.
 *
 * A new job rather than a reset of the old one: the failure stays in the
 * record, because a thing that failed twice is worth knowing about.
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { jobId } = await params;
  const job = await findJob(jobId);
  if (!job) return fail(404, 'job not found');
  if (job.state !== 'failed') {
    return fail(409, 'that job has not failed, so there is nothing to try again');
  }
  const retry = await enqueue({
    kind: job.kind, conversationId: job.conversationId, payload: job.payload,
  });
  await audit(job.conversationId, {
    action: 'job.retried',
    detail: { original: job.id, retry: retry.id, kind: job.kind, error: job.error },
  });
  return json({ job: retry }, { status: 202 });
}
