import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { cookies } from 'next/headers';

import {
  ACTIVATION_COOKIE, NOT_CONFIGURED, activationCode, passHolds,
} from '../../../../src/web/activation.js';
import { fail } from '../../../../src/web/http.js';
import { downloadPath } from '../../../../src/store/downloads.js';
import { readName } from '../../../../src/domain/downloads.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ file: string }> };

/**
 * One release, to somebody holding the code.
 *   [Doctrine D-21, D-03; TAKE-PLATFORM P6]
 *
 * THE PASS IS CHECKED BEFORE THE FILE IS LOOKED FOR, so a wrong code
 * cannot be used to find out which releases exist by watching which
 * names answer differently. Both answer the same refusal.
 *
 * NO BYTE RANGES. `serveFile` exists for media a player seeks
 * through; an installer is read once from one end, and a range
 * header on it is a client being thorough rather than a client that
 * needs something. Whole file, one stream, nothing held in memory.
 *
 * AND IT IS NEVER CACHED BY ANYTHING IN BETWEEN. `private` because
 * the bytes are behind a code, and a shared cache that held them
 * would be serving them to people who never typed it.
 */
export async function GET(
  _request: Request, { params }: Params,
): Promise<Response> {
  if (activationCode() === null) return fail(503, NOT_CONFIGURED);
  if (!(await passHolds((await cookies()).get(ACTIVATION_COOKIE)?.value))) {
    return fail(403, 'unlock the downloads with this installation’s code first');
  }

  const { file } = await params;
  const path = await downloadPath(decodeURIComponent(file));
  if (path === null) return fail(404, 'no such release');

  const size = (await stat(path)).size;
  const named = readName(decodeURIComponent(file))!;
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      /*
       * NOT THE REAL TYPE, AND ON PURPOSE. An `.apk` served as
       * `application/vnd.android.package-archive` is offered for
       * INSTALL by some browsers; a release binary should land in
       * the downloads folder and be run by a person who meant to.
       */
      'content-type': 'application/octet-stream',
      'content-length': String(size),
      'content-disposition': `attachment; filename="${named.file}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
