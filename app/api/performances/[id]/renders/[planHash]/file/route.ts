import { join } from 'node:path';

import { accessTo } from '../../../../../../../src/auth/request.js';
import { paths, safe } from '../../../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../../../src/store/performances.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; planHash: string }> };

/**
 * The finished master video.  [Doctrine STUDIO-TWO §14]
 *
 * Addressed by plan hash rather than by "the latest", because two shapes of
 * the same performance are two files and an author comparing them wants both
 * to still be there. [U-16]
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, planHash } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  /*
   * A published performance's video is public; an unpublished one's is not.
   * 404 rather than 403 for a stranger: 403 confirms it exists, and that a
   * draft exists is itself private (D-03).
   */
  if (await accessTo(request, performance) === 'denied') {
    return fail(404, 'performance not found');
  }
  return serveFile(
    request,
    join(paths.performanceRenders(id), safe(planHash), 'master.mp4'),
    'video/mp4',
  );
}
