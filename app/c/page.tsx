import { listConversations } from '../../src/store/repository.js';
import { whereFrom } from '../../src/domain/sources.js';
import { formatTimecode, type Frames } from '../../src/domain/time.js';
import { orderedInterventions } from '../../src/domain/document.js';
import { roomFor } from '../../src/domain/rooms.js';
import Room, { RoomWork, type RoomCard } from '../Room.js';
import StartConversation from '../StartConversation.js';
import { theBuilding } from '../building.js';
import { when } from '../when.js';

export const dynamic = 'force-dynamic';

/**
 * Studio One.  [STUDIO-ONE §5; D-19]
 *
 * THIS FILE ONLY GATHERS, as every page in this product does. The frame
 * is `Room`, the intake is `StartConversation`, and the measurements
 * come from the documents.
 */
const RECENT = 8;

/** `HH:MM:SS`, with the hours dropped when there are none. */
function shortTime(frames: Frames): string {
  const full = formatTimecode(frames).slice(0, 8);
  return full.startsWith('00:') ? full.slice(3) : full;
}

export default async function StudioOnePage() {
  const [conversations, building] = await Promise.all([
    listConversations(), theBuilding(),
  ]);

  const rows: RoomCard[] = conversations.slice(0, RECENT).map((one) => {
    const first = orderedInterventions(one)[0];
    const take = first?.takes.find((candidate) => candidate.id === first.selectedTakeId);
    const responses = one.interventions.length;
    /*
     * THE LENGTH OF THE THING BEING ANSWERED, not of the answer. An
     * embedded source has none until its player has reported one, and
     * that is left unsaid rather than printed as 00:00 — which would be
     * a measurement this product has not made. [U-02]
     */
    const runs = one.source.durationFrames > 0
      ? shortTime(one.source.durationFrames) : null;
    return {
      id: one.id,
      href: `/c/${one.id}`,
      title: one.title,
      from: whereFrom(one.source),
      under: [`${responses} ${responses === 1 ? 'response' : 'responses'}`, runs]
        .filter(Boolean).join(' · '),
      when: when(one.updatedAt ?? one.createdAt),
      state: one.publication && !one.publication.unpublishedAt ? 'Published' : null,
      poster: take && take.durationFrames > 0
        ? `/api/conversations/${one.id}/takes/${take.id}/media?kind=poster`
        : null,
    };
  });

  return (
    <Room room={roomFor('studio-one')} {...building}
          start={<StartConversation />}>
      <RoomWork
        rows={rows}
        heading="Recent conversations"
        empty="No conversations yet"
        emptySays="Bring in a source above to begin your first conversation."
        more={conversations.length > rows.length && (
          <a href="/#library" data-testid="all-in-library" className="small"
             style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            All {conversations.length} in the Library →
          </a>
        )} />
    </Room>
  );
}
