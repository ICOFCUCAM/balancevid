import { listPerformances } from '../../src/store/performances.js';
import { formatMasterPosition } from '../../src/domain/time.js';
import { roomFor } from '../../src/domain/rooms.js';
import Room, { RoomList, type RoomRow } from '../Room.js';
import StartPerformance from '../StartPerformance.js';
import { when } from '../when.js';

export const dynamic = 'force-dynamic';

/**
 * Studio Two.  [D-19, STUDIO-TWO §3; MASTER-EDIT §11]
 *
 * *"Studio Two and Online TV still unfold their intake in the hallway."*
 *
 * THE ROOM'S CONTENTS WERE ALREADY WRITTEN, ON THE HOME PAGE. `app/page.tsx`
 * has built a record per performance since the workspace landed — the
 * poster from the first usable take, the take count, the master's length,
 * whether it is published — and put it in a list mixed with conversations
 * and channels. What was missing was not the gathering. It was somewhere
 * for a performer to stand that is about performing.
 *
 * SO THIS PAGE IS SMALL, AND THAT IS THE FINDING. `StartPerformance` is
 * 141 lines that already existed and only ever needed a room; the frame
 * is shared with the other two; the measurements come from the documents
 * the way they do everywhere else. Almost none of this is new system.
 */
const RECENT = 10;

export default async function StudioTwoPage() {
  const performances = await listPerformances().catch(() => []);

  const rows: RoomRow[] = performances.slice(0, RECENT).map((one) => {
    /*
     * A TAKE WITH NO DURATION HAS NOT BEEN ASSEMBLED YET, and its poster
     * is a file that is not on disk. Picking the first take rather than
     * the first USABLE one is how a room full of work shows a column of
     * broken images on the morning after a long session.
     */
    const usable = one.takes.filter((take) => take.durationSamples > 0);
    return {
      id: one.id,
      href: `/p/${one.id}`,
      title: one.title,
      under: `${one.takes.length} ${one.takes.length === 1 ? 'take' : 'takes'}`,
      poster: usable[0]
        ? `/api/performances/${one.id}/takes/${usable[0].id}/media?kind=poster`
        : null,
      facts: [
        /*
         * WHETHER THERE IS ANYTHING TO CUT YET. A performance with a
         * song and no takes is a real and common state — the song has
         * been brought in and nobody has sung yet — and it is the one
         * thing a performer scanning this list wants to tell apart.
         */
        usable.length > 0
          ? `${usable.length} ready`
          : (one.takes.length > 0 ? 'assembling' : 'no takes yet'),
        one.master.durationSamples > 0
          ? formatMasterPosition(one.master.durationSamples).slice(0, 5)
          : null,
        when(one.updatedAt),
      ],
    };
  });

  return (
    <Room room={roomFor('studio-two')} start={<StartPerformance />}>
      <RoomList
        rows={rows}
        heading="Recent performances"
        empty="No performances yet. Bring in a song above and the takes follow."
        more={performances.length > rows.length && (
          <a href="/#library" data-testid="all-in-library" className="small"
             style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            All {performances.length} in the Library →
          </a>
        )} />
    </Room>
  );
}
