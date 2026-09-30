import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isOwner } from '../../../src/auth/request.js';
import { newId } from '../../../src/domain/ids.js';
import { paths, safe } from '../../../src/store/paths.js';
import { isStill } from '../../../src/store/libraryMedia.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * OTHER MEDIA — the library's third branch.  [Doctrine CHANNEL §3, D-18]
 *
 * "Media library → Studio 1, Studio 2, Other Media."
 *
 * Idents, caption cards, photographs, announcement slides. Real channels are
 * half made of these, and a schedule that could not hold one would send
 * somebody back to a video editor to make a ten-second title.
 *
 * IT IS STILL A LIBRARY, NOT A CHANNEL'S PROPERTY. The file lands in
 * `var/library/`, beside the two studios' work rather than inside whichever
 * channel used it first — because the second channel that wants the same
 * ident must reference it, not copy it. That is D-18 applied to the one kind
 * of asset that has no studio.
 *
 * NOTHING IS TRANSCODED HERE. The web tier never runs ffmpeg (U-23), and it
 * does not need to: the playout engine scales and encodes every piece it puts
 * on the wire anyway, so an ident arrives as whatever it was and leaves as
 * the house stream format like everything else.
 */
const KINDS: Record<string, { ext: string; form: 'image' | 'video' }> = {
  'image/jpeg': { ext: 'jpg', form: 'image' },
  'image/png': { ext: 'jpg', form: 'image' },
  'image/webp': { ext: 'jpg', form: 'image' },
  'video/mp4': { ext: 'mp4', form: 'video' },
  'video/webm': { ext: 'mp4', form: 'video' },
  'video/quicktime': { ext: 'mp4', form: 'video' },
  /*
   * AND THE SOUNDS.  [§25]
   *
   * *"A song should simply be a Library media item."* It could not be:
   * the library accepted pictures and video and nothing else, so the one
   * thing the media player exists to play was the one thing that could
   * not be put in. Each keeps its own container — an `.mp3` stored as
   * `.mp4` would be a file whose name lies to every reader of it — and
   * `libraryMedia`'s table is what the serving route and the playout
   * engine look it up by.
   *
   * `form` stays `video` because that is what a `ProgrammeSource` can
   * say today; what an audio item LOOKS like on air is the channel's
   * visual treatment, and that is still to build. The studio already
   * tells them apart by measuring the streams. [§25, C-14]
   */
  'audio/mpeg': { ext: 'mp3', form: 'video' },
  'audio/mp4': { ext: 'm4a', form: 'video' },
  'audio/x-m4a': { ext: 'm4a', form: 'video' },
  'audio/aac': { ext: 'm4a', form: 'video' },
  'audio/ogg': { ext: 'ogg', form: 'video' },
  'audio/wav': { ext: 'wav', form: 'video' },
  'audio/x-wav': { ext: 'wav', form: 'video' },
  'audio/flac': { ext: 'flac', form: 'video' },
  'audio/x-flac': { ext: 'flac', form: 'video' },
};

/** Big enough for an ident or a caption card; not a place to put a film. */
const MOST_BYTES = 64 * 1024 * 1024;

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
    if (!info) continue;
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
  const kind = KINDS[type.split(';')[0]!.trim()];
  if (!kind) {
    return fail(415, 'that is not a picture, a video or a song this can hold');
  }

  const label = (request.headers.get('x-label') ?? '').trim().slice(0, 120);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, 'that file is empty');
  if (bytes.byteLength > MOST_BYTES) {
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
