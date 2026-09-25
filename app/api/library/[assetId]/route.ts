import { isOwner } from '../../../../src/auth/request.js';
import { paths } from '../../../../src/store/paths.js';
import { fail, serveFile } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ assetId: string }> };

/**
 * One piece of other media.  [Doctrine CHANNEL §3]
 *
 * Owner-only, like everything else that is not published. The playout engine
 * reads the file directly; this route is for the studio's own monitor.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { assetId } = await params;
  if (!(await isOwner(request))) return fail(404, 'not found');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) return fail(404, 'not found');
  /* Two containers, one asset. Whichever is there is what is served. */
  const jpg = paths.libraryMedia(assetId, 'jpg');
  const { access } = await import('node:fs/promises');
  try {
    await access(jpg);
    return serveFile(request, jpg, 'image/jpeg');
  } catch {
    return serveFile(request, paths.libraryMedia(assetId, 'mp4'), 'video/mp4');
  }
}
