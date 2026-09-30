import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { paths } from '../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../src/store/performances.js';
import { requestForLink } from '../../../../../src/store/requests.js';
import { fail } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ link: string }> };

/**
 * The song a performer is asked to perform against.
 *   [Doctrine D-25, STUDIO-TWO §3, §10; TAKE-APP T3, T6]
 *
 * REACHED THROUGH THE LINK, NOT THROUGH THE PERFORMANCE. The performer
 * cannot fetch `/api/performances/<id>/master` — they have no session,
 * and they are not told the performance's id in the first place. What
 * they hold is a request, and this is the one file that request lets
 * them hear.
 *
 * THE NORMALISED MASTER, which matters more here than in the studio.
 * "A take performed against a 44.1 kHz original and aligned against a
 * 48 kHz analysis would be out by a fraction that grows all the way
 * through the song" — and on a phone there is no author watching a
 * waveform to notice. What the performer hears and what the alignment
 * measures must be the same audio at the same rate.
 *
 * ONE FILE, AND NOTHING ELSE ABOUT THE PERFORMANCE. The request names
 * the asset it is about; this route serves that asset and answers 404
 * for anything else, so a link cannot be pointed at a second
 * performance's material by editing a URL.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { link } = await params;
  const found = await requestForLink(link, new Date().toISOString());
  if (!found) return fail(404, 'that link is not open');
  if (found.holder.kind !== 'performance') {
    return fail(404, 'this request has no song to perform against');
  }

  let performance;
  try {
    performance = await loadPerformance(found.holder.id);
  } catch {
    return fail(404, 'that performance could not be found');
  }

  /*
   * THE ASSET THE REQUEST NAMES, checked against the performance rather
   * than taken from it. If the producer has since changed the song, the
   * performer is not silently handed a different one mid-take: they get
   * a 409 and the producer gets to issue a new request. What somebody
   * performed against has to be what they were asked to perform
   * against. [T6]
   */
  const asked = found.assignment.watch;
  if (asked && asked !== performance.master.assetId) {
    return fail(409, 'the song has changed since this link was sent');
  }

  const path = paths.performanceAsset(
    performance.id, `${performance.master.assetId}mezz`, 'webm');
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return fail(409, 'the song is still being prepared');
  }

  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      'content-type': 'audio/webm',
      'content-length': String(size),
      /* Played over and over while takes are recorded; it does not change. */
      'cache-control': 'private, max-age=3600',
    },
  });
}
