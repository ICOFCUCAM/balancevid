import { readFile } from 'node:fs/promises';

import { accessTo } from '../../../../../src/auth/request.js';
import { paths } from '../../../../../src/store/paths.js';
import { loadConversation } from '../../../../../src/store/repository.js';
import { fail } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The picture a link to this conversation shows.  [Doctrine U-31, D-03]
 *
 * Public, because a link preview is fetched by a server the sender has never
 * heard of — WhatsApp's, Slack's, a mail client's — with none of their
 * cookies. A card behind a session is a card nobody ever sees.
 *
 * PUBLIC ONLY WHEN PUBLISHED, and that is the whole of the care needed here.
 * A draft's card would put the author's title and a sentence from their
 * unfinished argument in front of anyone who guessed a URL, and the existence
 * of a draft is itself private. So a draft answers 404 — the same answer a
 * conversation that does not exist gives, because 403 would confirm it does.
 *
 * Served from disk rather than drawn on request: the web tier never invokes
 * ffmpeg (U-23). The worker draws it alongside the thumbnails, and publishing
 * requires a render, so by the time a link can be shared the card exists.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  if (await accessTo(request, conversation) === 'denied') {
    return fail(404, 'conversation not found');
  }

  let bytes;
  try {
    bytes = await readFile(paths.shareCard(id));
  } catch {
    return fail(404, 'this conversation has no card yet');
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'image/png',
      /*
       * Cached, unlike everything else here. A preview is fetched by many
       * machines at once the moment a link is posted, and the card only
       * changes when the conversation is re-rendered — at which point the
       * link's readers have long since seen it. `must-revalidate` keeps a
       * withdrawn conversation from living on in a cache for a week.
       */
      'cache-control': 'public, max-age=300, must-revalidate',
    },
  });
}
