import { join } from 'node:path';

import { accessTo } from '../../../../../../../src/auth/request.js';
import { paths, safe } from '../../../../../../../src/store/paths.js';
import { listJobs } from '../../../../../../../src/store/queue.js';
import { loadPerformance } from '../../../../../../../src/store/performances.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; planHash: string }> };

/** One finished clip. Addressed by plan hash, like every other render. [U-16] */
/** Was this clip made as something the author may give away? [INV-15] */
async function publiclyClippable(id: string, planHash: string): Promise<boolean> {
  const jobs = await listJobs(id);
  const job = jobs.find((entry) => entry.kind === 'render_performance_clip'
    && entry.state === 'done'
    && entry.result?.['planHash'] === planHash);
  return Boolean(job) && !job!.payload?.['allowUnpublishable'];
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, planHash } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  // Published, or the owner's. A stranger gets the same answer as a wrong id.
  const access = await accessTo(request, performance);
  if (access === 'denied') return fail(404, 'performance not found');
  // A hash that is not a hash is a 404, not a thrown identifier check.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(planHash)) return fail(404, 'not found');

  /*
   * AND NEVER A PRIVATE COPY.  [INV-15]
   *
   * A clip exported under the rights exemption is a rehearsal the author asked
   * to keep. Publishing the performance must not hand it out, and the check
   * belongs on the route rather than only on the page that lists them —
   * otherwise the rule is "not linked" rather than "not served".
   */
  if (access !== 'owner' && !(await publiclyClippable(id, safe(planHash)))) {
    return fail(404, 'performance not found');
  }
  return serveFile(
    request, join(paths.performanceClips(id), safe(planHash), 'clip.mp4'), 'video/mp4');
}
