import { listConversations } from '../../src/store/repository.js';
import { whereFrom } from '../../src/domain/sources.js';
import { formatTimecode, type Frames } from '../../src/domain/time.js';
import { orderedInterventions } from '../../src/domain/document.js';
import StartConversation from '../StartConversation.js';
import StudioOne, { type RecentConversation } from './StudioOne.js';

export const dynamic = 'force-dynamic';

/** `HH:MM:SS`, with the hours dropped when there are none. */
function shortTime(frames: Frames): string {
  const full = formatTimecode(frames).slice(0, 8);
  return full.startsWith('00:') ? full.slice(3) : full;
}

/**
 * Studio One.  [STUDIO-ONE §5; D-19]
 *
 * THIS ROUTE DID NOT EXIST, AND THAT IS THE LARGEST FINDING IN THE BRIEF.
 *
 * There was `/c/[id]` — a conversation — and `/c/[id]/room`, and
 * `/c/[id]/watch`. There was no `/c`. The rail's "Studio One" link went to
 * `newest('conversation')?.href ?? '#conversations'`, which means the
 * answer to "where is Studio One?" has always been *the last thing you made
 * in it, or a scroll position on the home page*.
 *
 * So the author's *"Then inside Studio One:"* is not a rearrangement of
 * things that were there. There was no inside. A studio you can only enter
 * through something you already made is a studio nobody can enter on their
 * first day.
 *
 * WHAT IT HOLDS IS THE BRIEF'S OWN DRAWING: the four doors, a rule, and the
 * recent conversations — with the column that says where each one came
 * from, which is why `capturedAs` was added to the source.
 *
 * AS EVERY PAGE IN THIS PRODUCT DOES, THIS ONE ONLY GATHERS. The durations
 * are measured from the documents and the source's origin is derived by
 * `whereFrom` rather than stored beside it; the arranging is `StudioOne`,
 * which is a client component because choosing a door is something a person
 * does without reloading.
 */
/**
 * HOW MANY "RECENT" IS.
 *
 * A browser run put all 161 of this account's conversations on the page,
 * which is not a recent list — it is the library, printed inside the
 * studio, and it pushed the four doors off the top of a 1400px screen
 * within two scrolls. Ten is what a person scanning for "the one I was
 * working on yesterday" actually reads; everything else is in the
 * Library, where there is a search box for it. [§5]
 */
const RECENT = 10;

export default async function StudioOnePage() {
  const conversations = await listConversations();

  const recent: RecentConversation[] = conversations.slice(0, RECENT).map((one) => {
    const first = orderedInterventions(one)[0];
    const take = first?.takes.find((candidate) => candidate.id === first.selectedTakeId);
    return {
      id: one.id,
      title: one.title,
      from: whereFrom(one.source),
      /*
       * THE LENGTH OF THE THING BEING ANSWERED, not of the answer. A
       * Class B source has none until its player has reported one, and
       * that is shown as nothing rather than as 00:00 — which would be
       * a measurement this product has not made. [U-02]
       */
      /*
       * `04:12`, WHICH IS WHAT THE BRIEF'S OWN MOCK-UP SHOWS. A browser
       * run printed `00:00:20` beside a twenty-second source: true,
       * and two leading fields of nothing. The hours appear when there
       * are hours.
       */
      duration: one.source.durationFrames > 0
        ? shortTime(one.source.durationFrames)
        : null,
      responses: one.interventions.length,
      poster: take && take.durationFrames > 0
        ? `/api/conversations/${one.id}/takes/${take.id}/media?kind=poster`
        : null,
      updatedAt: one.updatedAt ?? one.createdAt,
      href: `/c/${one.id}`,
    };
  });

  return (
    <StudioOne recent={recent} total={conversations.length}
               start={<StartConversation />} />
  );
}
