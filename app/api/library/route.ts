import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isOwner } from '../../../src/auth/request.js';
import { newId } from '../../../src/domain/ids.js';
import { paths, safe } from '../../../src/store/paths.js';
/* One table, read by the route that enforces it and by the picker
   that offers it. Typed twice, they drift. [D-19, C-14, C-48] */
import { ACCEPTS, MOST_UPLOAD_BYTES } from '../../../src/domain/libraryUpload.js';
import { isStill } from '../../../src/store/libraryMedia.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';


export async function GET(request: Request): Promise<Response> {
  if (!(await isOwner(request))) return fail(404, 'not found');
  let entries: string[] = [];
  try {
    entries = await readdir(paths.library());
  } catch { /* nothing uploaded yet, which is not a fault. */ }

  const items = [];
  for (const name of entries) {
    if (name.endsWith('.json')) continue;
    const assetId = name.split('.')[0];
    if (!assetId) continue;
    const info = await stat(join(paths.library(), name)).catch(() => null);
    /*
     * A DIRECTORY IS NOT A FILE TO PLAY, and this listing was offering
     * one. `var/library/decks/` came back as a 4 KB item called "decks"
     * with `form: 'video'` — schedulable, loadable into the Media
     * Player, and black on every monitor it reached, because there is
     * no video at the end of a folder.
     *
     * The same fault was found and fixed once in `broadcastLibrary.ts`
     * and this is the second listing, which is the shape of the bug
     * `libraryMedia.ts` exists to stop: one question about what a file
     * is, answered in more than one place. [D-19, §3]
     */
    if (!info || !info.isFile()) continue;
    let label = assetId;
    try {
      label = JSON.parse(
        await (await import('node:fs/promises')).readFile(
          join(paths.library(), `${assetId}.json`), 'utf8')).label ?? assetId;
    } catch { /* an older upload with no sidecar keeps its id as its name. */ }
    items.push({
      source: {
        kind: 'media' as const, assetId,
        form: isStill(name) ? 'image' as const : 'video' as const,
      },
      title: label,
      bytes: info.size,
      madeAt: info.mtime.toISOString(),
    });
  }
  return json({ items: items.sort((a, b) => b.madeAt.localeCompare(a.madeAt)) });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isOwner(request))) return fail(404, 'not found');
  const type = request.headers.get('content-type') ?? '';
  const kind = ACCEPTS[type.split(';')[0]!.trim()];
  if (!kind) {
    return fail(415, 'that is not a picture, a video or a song this can hold');
  }

  const label = (request.headers.get('x-label') ?? '').trim().slice(0, 120);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, 'that file is empty');
  if (bytes.byteLength > MOST_UPLOAD_BYTES) {
    return fail(413, 'too big for the library — an ident, not a film');
  }

  const assetId = newId('asset');
  await mkdir(paths.library(), { recursive: true });
  await writeFile(paths.libraryMedia(assetId, kind.ext), bytes);
  /* A name beside the file rather than in the filename: a label is somebody's
     words and a filename is a path. */
  await writeFile(
    join(paths.library(), `${safe(assetId)}.json`),
    JSON.stringify({ label: label || 'Untitled', form: kind.form }), 'utf8');

  return json({
    item: {
      source: { kind: 'media', assetId, form: kind.form },
      title: label || 'Untitled',
      bytes: bytes.byteLength,
    },
  }, { status: 201 });
}
