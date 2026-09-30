import { listPerformances } from '../../src/store/performances.js';
import { formatMasterPosition } from '../../src/domain/time.js';
import { roomFor } from '../../src/domain/rooms.js';
import Room, { RoomWork, type RoomCard } from '../Room.js';
import StartPerformance from '../StartPerformance.js';
import { theBuilding } from '../building.js';
import { when } from '../when.js';

export const dynamic = 'force-dynamic';

/**
 * Studio Two.  [D-19, STUDIO-TWO §3; MASTER-EDIT §11]
 *
 * *"Studio Two is not Studio One with different wording."* The frame is
 * shared and everything inside it is this room's: its photograph, its
 * `TAKES → TIMELINE → MASTER`, its four production steps, and a list
 * whose columns are takes and master length rather than sources and
 * responses.
 *
 * THIS FILE ONLY GATHERS. Nothing about how a performance is produced
 * changed here — the intake is the same `StartPerformance`, doing the
 * same thing, presented as a starting point rather than a file control.
 */
const RECENT = 8;

export default async function StudioTwoPage() {
  const [performances, building] = await Promise.all([
    listPerformances().catch(() => []), theBuilding(),
  ]);

  const rows: RoomCard[] = performances.slice(0, RECENT).map((one) => {
    /*
     * A TAKE WITH NO DURATION HAS NOT BEEN ASSEMBLED YET, and its poster
     * is a file that is not on disk. Picking the first take rather than
     * the first USABLE one is how a room full of work shows a column of
     * empty wells on the morning after a long session.
     */
    const usable = one.takes.filter((take) => take.durationSamples > 0);
    const runs = one.master.durationSamples > 0
      ? formatMasterPosition(one.master.durationSamples).slice(0, 5) : null;
    return {
      id: one.id,
      href: `/p/${one.id}`,
      title: one.title,
      /*
       * WHETHER THERE IS ANYTHING TO CUT YET. A song with no takes is a
       * real and common state — the music is in and nobody has sung —
       * and it is the one thing a performer scanning this list wants to
       * tell apart.
       */
      from: usable.length > 0 ? `${usable.length} ready`
        : (one.takes.length > 0 ? 'Assembling' : 'No takes'),
      under: [`${one.takes.length} ${one.takes.length === 1 ? 'take' : 'takes'}`,
        runs].filter(Boolean).join(' · '),
      when: when(one.updatedAt),
      state: one.publication && !one.publication.unpublishedAt ? 'Published' : null,
      poster: usable[0]
        ? `/api/performances/${one.id}/takes/${usable[0].id}/media?kind=poster`
        : null,
    };
  });

  return (
    <Room room={roomFor('studio-two')} {...building}
          start={<StartPerformance />}>
      <RoomWork
        rows={rows}
        heading="Recent performances"
        empty="No performances yet"
        emptySays="Bring in a song to begin your first performance."
        more={performances.length > rows.length && (
          <a href="/#library" data-testid="all-in-library" className="small"
             style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            All {performances.length} in the Library →
          </a>
        )} />
    </Room>
  );
}
