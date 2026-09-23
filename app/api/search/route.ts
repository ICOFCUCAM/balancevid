import { accessTo, isOwner } from '../../../src/auth/request.js';
import { searchConversation } from '../../../src/search/search.js';
import type { ConversationHits } from '../../../src/search/types.js';
import { listConversations, loadConversation } from '../../../src/store/repository.js';
import { loadAllTakeTranscripts, loadTranscript } from '../../../src/store/transcripts.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/** Reading every transcript on the instance is not free; the budget is 200ms (D-05). */
const MAX_CONVERSATIONS = 40;
const MAX_HITS_PER_CONVERSATION = 25;

/**
 * Research Mode.  [Doctrine §43, §16]
 *
 * With `conversation`, searches one — "show me every time the speaker
 * mentions Norway", with a frame for each. Without, searches the instance:
 * §16's "searchable intellectual record", which is the thing that makes a
 * body of conversations worth keeping rather than a pile of videos.
 *
 * The wall applies here exactly as everywhere else, and it matters more here
 * than anywhere: a search endpoint that ignored it would be a way to read
 * every draft on the instance one keyword at a time. [D-03, D-06]
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').slice(0, 200);
  const only = url.searchParams.get('conversation');

  if (!query.trim()) return json({ query, results: [], total: 0 });

  if (only) {
    let conversation;
    try {
      conversation = await loadConversation(only);
    } catch {
      return fail(404, 'conversation not found');
    }
    const access = await accessTo(request, conversation);
    if (access === 'denied') return fail(404, 'conversation not found');

    const source = await loadTranscript(only);
    const takes = await loadAllTakeTranscripts(only);
    const result = searchConversation(query, {
      conversation,
      sourceTranscript: source?.transcript ?? null,
      takeTranscripts: takes,
      owned: access === 'owner',
    });
    return json({ query, results: [result], total: result.total });
  }

  /*
   * Across the instance. An owner searches everything they have; anyone else
   * searches what was published, which is the same set they could already
   * read one page at a time.
   */
  const owner = await isOwner(request);
  const all = await listConversations();
  const visible = all.filter((c) => owner || (c.publication && !c.publication.unpublishedAt));

  const results: ConversationHits[] = [];
  let total = 0;
  for (const conversation of visible.slice(0, MAX_CONVERSATIONS)) {
    const source = await loadTranscript(conversation.id);
    const takes = await loadAllTakeTranscripts(conversation.id);
    const found = searchConversation(query, {
      conversation,
      sourceTranscript: source?.transcript ?? null,
      takeTranscripts: takes,
      limit: MAX_HITS_PER_CONVERSATION,
      owned: owner,
    });
    if (found.total === 0) continue;
    results.push(found);
    total += found.total;
  }

  // The conversation with the most to say about it goes first.
  results.sort((a, b) => b.total - a.total);
  return json({
    query,
    results,
    total,
    ...(visible.length > MAX_CONVERSATIONS
      ? { truncated: `searched the ${MAX_CONVERSATIONS} most recent conversations` }
      : {}),
  });
}
