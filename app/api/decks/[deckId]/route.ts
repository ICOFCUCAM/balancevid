import { isOwner } from '../../../../src/auth/request.js';
import { bookingsFor, refusalFor } from '../../../../src/domain/deletion.js';
import { deckAssetIds } from '../../../../src/domain/deck.js';
import { deleteDeck, loadDeck } from '../../../../src/store/decks.js';
import { listChannels } from '../../../../src/store/channels.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ deckId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { deckId } = await params;
  if (!(await isOwner(request))) return fail(404, 'not found');
  try {
    return json({ deck: await loadDeck(deckId) });
  } catch {
    return fail(404, 'deck not found');
  }
}

/**
 * Throw a deck away.  [Doctrine §19, CHANNEL §20, D-23]
 *
 * THIS ONE REALLY DOES DELETE MEDIA, unlike deleting a channel. A deck's
 * slides exist only as its pages: they were not uploaded one by one and
 * there is nowhere else they belong, so they go with it.
 *
 * Which makes the question to the channels matter more here, not less — a
 * slide may be a caption card on a schedule, or the safe playlist. Asked
 * per page, because a deck of forty is forty references and any one of them
 * could be the one holding a channel up.
 */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { deckId } = await params;
  if (!(await isOwner(request))) return fail(404, 'not found');

  let deck;
  try {
    deck = await loadDeck(deckId);
  } catch {
    return fail(404, 'deck not found');
  }

  const channels = await listChannels().catch(() => []);
  for (const assetId of deckAssetIds(deck)) {
    const refusal = refusalFor(bookingsFor(channels, 'media', assetId));
    if (refusal) return fail(409, `a slide from this deck ${refusal}`);
  }

  await deleteDeck(deckId);
  return json({ ok: true, deleted: deckId, slides: deck.slides.length });
}
