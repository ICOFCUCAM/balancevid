import { isOwner } from '../../../../src/auth/request.js';
import { paths } from '../../../../src/store/paths.js';
import { fail, json, serveFile } from '../../../../src/web/http.js';
import { bookingsFor, refusalFor } from '../../../../src/domain/deletion.js';
import { listChannels } from '../../../../src/store/channels.js';

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

/**
 * Throw a piece of other media away.  [Doctrine §19, CHANNEL §3, D-18]
 *
 * The idents, the caption cards, the stills — the things a channel reaches
 * for that no studio produced. Both containers go, and the sidecar that
 * holds the label with them: a library entry is a file plus its name, and
 * leaving the name behind would leave a row pointing at nothing.
 *
 * Asked of the channels first, as every deletion is. This one matters most
 * of the three: an ident is exactly the kind of thing that is the safe
 * playlist on four channels and looks unused on all of them.
 */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { assetId } = await params;
  if (!(await isOwner(request))) return fail(404, 'not found');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) return fail(404, 'not found');

  const channels = await listChannels().catch(() => []);
  const refusal = refusalFor(bookingsFor(channels, 'media', assetId));
  if (refusal) return fail(409, refusal);

  const { rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await Promise.all([
    rm(paths.libraryMedia(assetId, 'jpg'), { force: true }),
    rm(paths.libraryMedia(assetId, 'mp4'), { force: true }),
    rm(join(paths.library(), `${assetId}.json`), { force: true }),
  ]);
  return json({ ok: true, deleted: assetId });
}
