import { mkdir, writeFile } from 'node:fs/promises';
import { isOwner } from '../../../src/auth/request.js';
import { canMakeDeckFrom } from '../../../src/domain/deck.js';
import { newId } from '../../../src/domain/ids.js';
import { listDecks } from '../../../src/store/decks.js';
import { paths } from '../../../src/store/paths.js';
import { enqueue } from '../../../src/store/queue.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * Decks.  [Doctrine CHANNEL §20, U-23, U-33 §2]
 *
 * A deck is a document somebody wants to put on air a page at a time. It
 * arrives as a `.pptx`, a `.pdf`, a `.docx` — and leaves as library images,
 * because that is the one kind of media everything downstream already
 * understands.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await isOwner(request))) return fail(404, 'not found');
  return json({ decks: await listDecks() });
}

/**
 * Upload one.
 *
 * THE WEB TIER DOES NOT RASTERISE IT. Turning a deck into pages spawns
 * LibreOffice and a browser, and one of those in a request handler is one
 * export making the application unusable for everybody else — the same rule
 * that keeps ffmpeg out of here (U-23). The file is written down and a job
 * is enqueued, exactly as an uploaded source is.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await isOwner(request))) return fail(404, 'not found');

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, 'a document is required');
  }
  /*
   * Checked before anything is written. An unknown extension handed to a
   * converter is two minutes of a worker discovering it cannot be done, and
   * the message names what would have worked instead.
   */
  if (!canMakeDeckFrom(file.name)) {
    return fail(415,
      `${file.name} cannot be turned into slides. PDF, PowerPoint, Word and `
      + 'their OpenDocument equivalents can.');
  }

  const deckId = newId('deck');
  const extension = (file.name.split('.').pop() ?? 'pdf')
    .toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  await mkdir(paths.decks(), { recursive: true });
  const uploadPath = paths.deckUpload(deckId, extension);
  await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

  const title = String(form.get('title') ?? '').trim()
    || file.name.replace(/\.[^.]+$/, '');

  const job = await enqueue({
    kind: 'rasterise_deck',
    conversationId: deckId,
    payload: { uploadPath, title, origin: file.name },
  });
  return json({ deckId, job }, { status: 202 });
}
