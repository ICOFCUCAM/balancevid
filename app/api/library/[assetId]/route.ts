import { isOwner } from '../../../../src/auth/request.js';
import { paths } from '../../../../src/store/paths.js';
import { CONTAINERS, libraryFile } from '../../../../src/store/libraryMedia.js';
import { fail, json, serveFile } from '../../../../src/web/http.js';
import { bookingsFor, deckRefusalFor, refusalFor } from '../../../../src/domain/deletion.js';
import { listChannels } from '../../../../src/store/channels.js';
import { listDecks } from '../../../../src/store/decks.js';

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
  /*
   * WHICHEVER CONTAINER IS THERE. PNG for a deck's pages, which are type
   * and must not be smeared by JPEG (§20); JPEG for a photograph
   * somebody uploaded as an ident; MP4 for everything that moves; and
   * the sounds, because a song is a library item. The order and the
   * content types are `libraryMedia`'s table rather than this route's
   * own list — there were three such lists and they disagreed. [D-19]
   */
  const found = libraryFile(assetId);
  if (!found) return fail(404, 'not found');
  return serveFile(request, found.path, found.container.type);
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
  /*
   * AND THE DECKS, WHICH THIS DID NOT ASK.  [§20, C-49]
   *
   * Invisible for as long as nothing could reach this route: a
   * deck's page deleted from the library leaves the deck pointing
   * at a file that is not there, and a deck transmits a page at a
   * time. The channels were asked because an ident is the safe
   * playlist on four of them and looks unused on all four; a page
   * is the same argument one surface along.
   */
  const pageOf = deckRefusalFor(await listDecks().catch(() => []), assetId);
  if (pageOf) return fail(409, pageOf);

  const { rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  /*
   * EVERY CONTAINER, from the same table the serving route reads. This
   * removed `jpg` and `mp4` and left a `png` behind — a deck page deleted
   * from the library stayed on disk and stayed servable — and once songs
   * could be uploaded it would have left those too. [D-19]
   */
  await Promise.all([
    ...CONTAINERS.map((container) =>
      rm(paths.libraryMedia(assetId, container.ext), { force: true })),
    /* And the sidecar, because a library entry is a file plus its name
       and leaving the name behind leaves a row pointing at nothing. */
    rm(join(paths.library(), `${assetId}.json`), { force: true }),
    /* And the measurement, which is about a file that is going. */
    ...CONTAINERS.map((container) =>
      rm(`${paths.libraryMedia(assetId, container.ext)}.facts.json`,
        { force: true })),
  ]);
  return json({ ok: true, deleted: assetId });
}
