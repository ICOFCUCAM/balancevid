import {
  PerformanceCardError, buildPerformanceCard,
} from '../../../../../src/publish/performanceCard.js';
import { performanceAttribution } from '../../../../../src/domain/performancePlan.js';
import { paths } from '../../../../../src/store/paths.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { loadPerformance } from '../../../../../src/store/performances.js';
import { fail, json, serveFile } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The link preview, as data or as the picture drawn from it.
 * [Doctrine STUDIO-TWO §14, U-30, D-16]
 *
 * The card is a REPRESENTATION and the image is a rendering of it, so the
 * words in the picture and the words a chat window reads come from one
 * generator and cannot go stale against each other.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  if (new URL(request.url).searchParams.get('image')) {
    return serveFile(request, paths.performanceCard(id), 'image/png');
  }

  try {
    return json({
      card: buildPerformanceCard({
        performance,
        attribution: performanceAttribution(performance, performance.createdAt).text,
      }),
      jobs: (await listJobs(id)).filter((job) => job.kind === 'render_performance_card'),
    });
  } catch (error) {
    if (error instanceof PerformanceCardError) return fail(409, error.message);
    throw error;
  }
}

/** Draw it. */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  try {
    // Built here as well as in the worker, so an impossible card is refused
    // rather than queued and failed. [INV-15]
    buildPerformanceCard({
      performance,
      attribution: performanceAttribution(performance, performance.createdAt).text,
    });
  } catch (error) {
    if (error instanceof PerformanceCardError) return fail(409, error.message);
    throw error;
  }
  const job = await enqueue({
    kind: 'render_performance_card', conversationId: id, payload: {},
  });
  return json({ job }, { status: 202 });
}
