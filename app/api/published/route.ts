import { isRespondable, lineageDepth } from '../../../src/domain/document.js';
import { listConversations } from '../../../src/store/repository.js';
import { json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * What is out there to answer.  [Doctrine U-31]
 *
 * A published conversation is a Class A source, so this is the list of things
 * a new conversation can begin from — the network, such as it is, with no
 * collaboration feature behind it.
 */
export async function GET(): Promise<Response> {
  const conversations = (await listConversations()).filter((c) => c.publication);
  return json({
    published: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      author: conversation.publication?.author,
      publishedAt: conversation.publication?.publishedAt,
      respondable: isRespondable(conversation),
      withdrawn: Boolean(conversation.publication?.unpublishedAt),
      interventions: conversation.interventions.length,
      depth: lineageDepth(conversation),
      sourceTitle: conversation.source.title,
    })),
  });
}
