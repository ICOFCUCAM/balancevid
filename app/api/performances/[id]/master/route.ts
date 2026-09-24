import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { paths } from '../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../src/store/performances.js';
import { fail } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The song, to perform against.  [Doctrine STUDIO-TWO §3, §10]
 *
 * The normalised master rather than the file the author uploaded, so that what
 * they hear in their headphones and what the alignment measures are the same
 * audio at the same rate. A take performed against a 44.1 kHz original and
 * aligned against a 48 kHz analysis would be out by a fraction that grows all
 * the way through the song.
 *
 * Owner-only, like everything else about work in progress: middleware already
 * sees to that, since this is not a route a published performance exposes.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const path = paths.performanceAsset(id, `${performance.master.assetId}mezz`, 'webm');
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
      // The performer plays this over and over while recording takes; it does
      // not change once ingest has run.
      'cache-control': 'private, max-age=3600',
    },
  });
}
