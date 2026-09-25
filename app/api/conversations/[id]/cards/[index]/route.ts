import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { accessTo } from '../../../../../../src/auth/request.js';
import { claimCardName } from '../../../../../../src/publish/claimCard.js';
import { paths } from '../../../../../../src/store/paths.js';
import { loadConversation } from '../../../../../../src/store/repository.js';
import { fail } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * One card, as a picture.  [Doctrine U-30, U-31, D-03]
 *
 * Public for a published conversation, like the share card and for the same
 * reason: a card exists to be passed on, and one behind a session is one
 * nobody but its author ever sees. A draft's cards answer 404 — the existence
 * of a draft is itself private, and 403 would confirm it.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, index } = await params;

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  if (await accessTo(request, conversation) === 'denied') {
    return fail(404, 'conversation not found');
  }

  // A number, and a small one. Anything else is a 404 rather than a path.
  const n = Number(index);
  if (!Number.isInteger(n) || n < 1 || n > 999) return fail(404, 'no such card');

  let bytes;
  try {
    bytes = await readFile(join(paths.claimCards(id), claimCardName(n)));
  } catch {
    return fail(404, 'that card has not been drawn');
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'image/png',
      // Same reasoning as the share card: many machines fetch it at once when
      // a link is posted, and it only changes when the conversation does.
      'cache-control': 'public, max-age=300, must-revalidate',
    },
  });
}
