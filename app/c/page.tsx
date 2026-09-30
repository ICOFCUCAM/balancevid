import { listConversations } from '../../src/store/repository.js';
import { whereFrom } from '../../src/domain/sources.js';
import { formatTimecode, type Frames } from '../../src/domain/time.js';
import { orderedInterventions } from '../../src/domain/document.js';
import { roomFor } from '../../src/domain/rooms.js';
import Room, { RoomList, type RoomRow } from '../Room.js';
import StartConversation from '../StartConversation.js';
import { when } from '../when.js';

export const dynamic = 'force-dynamic';

/**
 * Studio One.  [STUDIO-ONE §5; D-19]
 *
 * THIS ROUTE DID NOT EXIST, AND THAT WAS THE LARGEST FINDING IN ITS OWN
 * BRIEF. There was `/c/[id]` — a conversation — and no `/c`. The rail's
 * "Studio One" went to the newest conversation, or to a scroll position
 * on the home page.
 *
 * IT WAS THEN THE ONLY ROOM WITH A DOOR, which is why this file no
 * longer holds a layout. The frame it invented for itself is
 * `app/Room.tsx` now and all three rooms stand in it; what is left here
 * is the gathering, which is what a page in this product is for.
 */
const RECENT = 10;

/** `HH:MM:SS`, with the hours dropped when there are none. */
function shortTime(frames: Frames): string {
  const full = formatTimecode(frames).slice(0, 8);
  return full.startsWith('00:') ? full.slice(3) : full;
}

export default async function StudioOnePage() {
  const conversations = await listConversations();

  const rows: RoomRow[] = conversations.slice(0, RECENT).map((one) => {
    const first = orderedInterventions(one)[0];
    const take = first?.takes.find((candidate) => candidate.id === first.selectedTakeId);
    return {
      id: one.id,
      href: `/c/${one.id}`,
      title: one.title,
      under: `${one.interventions.length} `
        + `${one.interventions.length === 1 ? 'response' : 'responses'}`,
      poster: take && take.durationFrames > 0
        ? `/api/conversations/${one.id}/takes/${take.id}/media?kind=poster`
        : null,
      facts: [
        whereFrom(one.source),
        /*
         * THE LENGTH OF THE THING BEING ANSWERED, not of the answer. An
         * embedded source has none until its player has reported one,
         * and that prints as an em dash rather than 00:00 — which would
         * be a measurement this product has not made. [U-02]
         */
        one.source.durationFrames > 0 ? shortTime(one.source.durationFrames) : null,
        when(one.updatedAt ?? one.createdAt),
      ],
    };
  });

  return (
    <Room room={roomFor('studio-one')} start={<StartConversation />}>
      <RoomList
        rows={rows}
        heading="Recent conversations"
        empty="Nothing here yet. Choose a source above and the conversation starts."
        more={conversations.length > rows.length && (
          <a href="/#library" data-testid="all-in-library" className="small"
             style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            All {conversations.length} in the Library →
          </a>
        )} />
    </Room>
  );
}
