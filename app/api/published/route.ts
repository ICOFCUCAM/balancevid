import { isRespondable, lineageDepth } from '../../../src/domain/document.js';
import { directory } from '../../../src/domain/channelListing.js';
import { listConversations } from '../../../src/store/repository.js';
import { listChannels } from '../../../src/store/channels.js';
import { json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * What is out there to answer, and what is out there to watch.
 *   [Doctrine U-31, D-03, TV-NETWORK N-3]
 *
 * A published conversation is a Class A source, so this is the list of things
 * a new conversation can begin from — the network, such as it is, with no
 * collaboration feature behind it.
 *
 * AND NOW THE CHANNELS, which is the smaller half of the answer to
 * *"how would people access the channel?"* They have been watchable
 * by a stranger for a long time: `/t/<id>/watch`, the playlist, the
 * segments and `/now` are all public. Nothing has ever been able to
 * say WHICH ONES EXIST, so a channel could only be reached by
 * somebody who already had its link.
 *
 * TWO LISTS IN ONE ANSWER AND NOT ONE LIST OF TWO KINDS. A
 * conversation is something to respond to and a channel is
 * something to watch; they share this route because they share the
 * question *what has an audience*, and merging them into one array
 * with a `kind` would make every caller filter before it could use
 * either.
 *
 * WHO DECIDES IS NOT THIS ROUTE. `directory()` reads the two fields
 * that have always decided — published, and `publication.listed` —
 * and a channel that has not asked to be found is not here. [§10]
 */
export async function GET(): Promise<Response> {
  const conversations = (await listConversations()).filter((c) => c.publication);
  /*
   * A FAILURE TO READ THE CHANNELS IS AN EMPTY TELEVISION LISTING,
   * not a broken page. The conversations half of this answer has
   * worked for a long time and must not start failing because the
   * half added later cannot read a directory.
   */
  const channels = await listChannels().catch(() => []);
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
    channels: directory(channels),
  });
}
