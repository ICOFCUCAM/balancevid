import { join } from 'node:path';

import { paths, safe } from '../../../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../../../src/store/performances.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; planHash: string }> };

/** One finished clip. Addressed by plan hash, like every other render. [U-16] */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, planHash } = await params;
  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  return serveFile(
    request, join(paths.performanceClips(id), safe(planHash), 'clip.mp4'), 'video/mp4');
}
