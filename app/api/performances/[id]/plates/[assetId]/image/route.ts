import { paths, safe } from '../../../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../../../src/store/performances.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; assetId: string }> };

/**
 * The averaged still of an empty room.  [Doctrine STUDIO-TWO §4, S-6]
 *
 * Served so the STUDIO can key against exactly the same picture the renderer
 * will. A preview computed from a different plate than the export uses is a
 * preview that lies about the one thing this feature has to be trusted on.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, assetId } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  if (!performance.plates.some((plate) => plate.assetId === safe(assetId))) {
    return fail(404, 'no such plate');
  }
  return serveFile(request, paths.performancePlate(id, assetId), 'image/png');
}
