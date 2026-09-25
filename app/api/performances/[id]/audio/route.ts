import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { auditPerformance, loadPerformance } from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The performance, to listen to.  [Doctrine STUDIO-TWO §14, U-22]
 *
 * The same mechanism as the other studio's: the audio of a finished render,
 * re-mastered for listening, with the author's named sections (§15) as
 * chapters. A performance loses less than a conversation does by being heard
 * — it is music — so there is no warning to give about it.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  return json({ jobs: (await listJobs(id)).filter((job) => job.kind === 'render_audio') });
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { planHash?: string };

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const renders = (await listJobs(id))
    .filter((job) => job.kind === 'render_performance' && job.state === 'done');
  const render = body.planHash
    ? renders.find((job) => job.result?.['planHash'] === body.planHash)
    : renders[0];
  if (!render?.result?.['planHash']) {
    return fail(409, 'make the master video first — the audio is taken from it');
  }
  /*
   * A private copy's audio is a private copy, and nothing extra is needed to
   * keep it private: the file is served from the render's own directory, and
   * that route hands a stranger only the render the publication names — which
   * a private copy can never be, because publishing refuses one. [INV-15]
   */
  const planHash = String(render.result['planHash']);
  const job = await enqueue({
    kind: 'render_audio',
    conversationId: id,
    payload: { planHash, performance: true },
  });
  await auditPerformance(id, {
    action: 'audio.queued',
    detail: { planHash, title: performance.title },
  });
  return json({ job, planHash }, { status: 202 });
}
