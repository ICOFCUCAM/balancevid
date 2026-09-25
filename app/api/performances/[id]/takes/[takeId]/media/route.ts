import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { paths, safe } from '../../../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../../../src/store/performances.js';
import { fail } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; takeId: string }> };

/**
 * One take's media, for the studio to play.  [Doctrine STUDIO-TWO §7, U-39]
 *
 * RANGE REQUESTS ARE THE POINT of this route existing rather than a static
 * file. Switching means seeking: the author drags to the chorus and four
 * videos must arrive at that moment together. Without `Range` a browser
 * refuses to seek at all until the whole file has arrived, and a four-minute
 * take is not something to download before you can look at the second verse.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, takeId } = await params;

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  const take = performance.takes.find((t) => t.id === safe(takeId));
  if (!take) return fail(404, 'no such take');

  /*
   * A picture of the take, rather than the take.  [§2, §8]
   *
   * Served from the same route because it is the same object seen differently
   * — and answered before the mezzanine is looked for, so a strip can be
   * shown for a take whose media is still assembling.
   */
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind === 'poster' || kind === 'strip') {
    const picture = kind === 'poster'
      ? paths.performanceTakePoster(id, safe(takeId))
      : paths.performanceTakeStrip(id, safe(takeId));
    try {
      const bytes = await readFile(picture);
      return new Response(new Uint8Array(bytes), {
        headers: {
          'content-type': 'image/jpeg',
          // It is a picture of a file that does not change once assembled.
          'cache-control': 'private, max-age=3600',
        },
      });
    } catch {
      return fail(404, 'that picture has not been made yet');
    }
  }

  const path = paths.performanceAsset(id, `${take.assetId}mezz`, 'mp4');
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return fail(409, 'that take is still being assembled');
  }

  const range = request.headers.get('range');
  const common = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  };

  if (!range) {
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: { ...common, 'content-length': String(size) },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const from = Number(match?.[1] ?? 0) || 0;
  const to = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (from >= size || to < from) {
    return new Response(null, {
      status: 416, headers: { ...common, 'content-range': `bytes */${size}` },
    });
  }

  return new Response(
    Readable.toWeb(createReadStream(path, { start: from, end: to })) as ReadableStream,
    {
      status: 206,
      headers: {
        ...common,
        'content-length': String(to - from + 1),
        'content-range': `bytes ${from}-${to}/${size}`,
      },
    },
  );
}
