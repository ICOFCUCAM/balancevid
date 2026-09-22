import { findJob } from '../../../../src/store/queue.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { jobId } = await params;
  const job = await findJob(jobId);
  if (!job) return fail(404, 'job not found');
  return json({ job });
}
