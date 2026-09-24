import {
  PerformanceEditError, publishPerformance, unpublishPerformance,
} from '../../../../../src/domain/performanceEdit.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import {
  auditPerformance, loadPerformance, mutatePerformance,
} from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Give it an audience.  [Doctrine STUDIO-TWO §14, U-31, INV-15]
 *
 * What is published is a RENDER — somebody following a link watches a finished
 * video, not a document that may change under them. So a performance that has
 * never been rendered cannot be published, and the message says which thing to
 * do first rather than reporting that something is missing.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { author?: string };

  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  /*
   * The most recent finished master, which `listJobs` returns newest first.
   *
   * PRIVATE COPIES ARE NOT CANDIDATES. A file exported under the
   * `allowUnpublishable` exemption is a rehearsal the author asked to keep;
   * publishing it later — because the rights were sorted out in between, or
   * because it happened to be the newest file on disk — puts out a video
   * nobody pressed publish on. The exemption is remembered. [INV-15]
   */
  const finished = (await listJobs(id))
    .filter((job) => job.kind === 'render_performance' && job.state === 'done');
  const render = finished.find((job) => !job.payload?.['allowUnpublishable']);
  if (!render?.result?.['planHash']) {
    return fail(409, finished.length > 0
      ? 'the videos made so far were private copies — make a publishable master first'
      : 'make the master video first — there is nothing to publish yet');
  }

  try {
    const updated = await mutatePerformance(id, (draft) => {
      publishPerformance(draft, {
        planHash: String(render.result!['planHash']),
        publishedAt: new Date().toISOString(),
        ...(body.author ? { author: body.author } : {}),
      });
    });
    await auditPerformance(id, {
      action: 'performance.published',
      detail: { planHash: render.result['planHash'] },
    });
    /*
     * Draw what a link to this will show, now rather than at export: before
     * this moment nobody could fetch the card, and the performance may have
     * changed since it was last rendered. [U-30]
     */
    await enqueue({ kind: 'render_performance_card', conversationId: id, payload: {} });
    return json({ publication: updated.publication });
  } catch (error) {
    if (error instanceof PerformanceEditError) return fail(409, error.message);
    throw error;
  }
}

/** Withdraw it. The file stays; the link stops working. */
export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  try {
    const updated = await mutatePerformance(id, (draft) => {
      unpublishPerformance(draft, new Date().toISOString());
    });
    await auditPerformance(id, { action: 'performance.unpublished', detail: {} });
    return json({ publication: updated.publication });
  } catch (error) {
    if (error instanceof PerformanceEditError) return fail(409, error.message);
    return fail(404, 'performance not found');
  }
}
