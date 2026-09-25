import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { accessTo } from '../../../../../src/auth/request.js';
import { buildAttribution } from '../../../../../src/domain/plan.js';
import { buildClaimCards, claimCardName } from '../../../../../src/publish/claimCard.js';
import { enqueue, listJobs } from '../../../../../src/store/queue.js';
import { paths } from '../../../../../src/store/paths.js';
import { audit, loadConversation } from '../../../../../src/store/repository.js';
import { loadAllTakeTranscripts } from '../../../../../src/store/transcripts.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * A card per exchange.  [Doctrine U-30, U-31, D-16]
 *
 * The WORDS are computed here, on every request, because they are a pure
 * function of the Conversation and computing them is cheaper than storing
 * them. The PICTURES are drawn by the worker, because the web tier never
 * invokes ffmpeg (U-23) — so this also says which of them exist, and the panel
 * can offer to make the ones that do not.
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

  const cards = buildClaimCards({
    conversation,
    attribution: buildAttribution(conversation, conversation.createdAt).text,
    takeTranscripts: await loadAllTakeTranscripts(id),
  });

  const dir = paths.claimCards(id);
  const drawn: number[] = [];
  for (const card of cards) {
    const exists = await stat(join(dir, claimCardName(card.index)))
      .then((file) => file.size > 0).catch(() => false);
    if (exists) drawn.push(card.index);
  }

  return json({
    cards,
    drawn,
    jobs: (await listJobs(id)).filter((job) => job.kind === 'render_claim_cards'),
  });
}

/** Draw them. Owner only: making files is not a thing a reader does. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  if (await accessTo(request, conversation) !== 'owner') {
    return fail(404, 'conversation not found');
  }

  const cards = buildClaimCards({
    conversation,
    attribution: buildAttribution(conversation, conversation.createdAt).text,
  });
  /*
   * Refused rather than queued empty. A job that succeeds having drawn
   * nothing leaves the author looking for files that were never going to
   * exist, and the reason — no response has been recorded yet — is something
   * the product knows and can say.
   */
  if (cards.length === 0) {
    return fail(409, 'record a response first — a card is a claim and what you said back');
  }

  const job = await enqueue({ kind: 'render_claim_cards', conversationId: id, payload: {} });
  await audit(id, { action: 'claim-cards.queued', detail: { cards: cards.length } });
  return json({ job, cards: cards.length }, { status: 202 });
}
