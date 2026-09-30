import { listChannels } from '../../src/store/channels.js';
import { whatIsOn } from '../../src/domain/channel.js';
import { roomFor } from '../../src/domain/rooms.js';
import Room, { RoomWork, type RoomCard } from '../Room.js';
import StartChannel from '../StartChannel.js';
import { theBuilding } from '../building.js';
import { when } from '../when.js';

export const dynamic = 'force-dynamic';

/**
 * The control room.  [CHANNEL §4, §15; D-19]
 *
 * *"Open Control"* rather than *"Enter Studio"*, which is the author's
 * own distinction and a real one: a studio is somewhere you go to make
 * something, and a control room is somewhere that is already running
 * whether or not anybody is standing in it.
 *
 * WHICH IS WHY THIS ROOM'S LIST IS NOT A LIST OF RECENT WORK. It is a
 * list of channels and what each one is doing RIGHT NOW, answered by
 * `whatIsOn` — the same function the playout engine reads, so the badge
 * on this page and the transmitter cannot disagree. That is the one
 * thing a control room is for, and it is the reason the three rooms are
 * not three copies of a shell.
 *
 * THE HOME PAGE'S HERO STAYS WHERE IT IS. It shows the newest channel's
 * on-air state, its next programme and its destinations, and it belongs
 * on the page somebody lands on — being told you are live is not
 * something to have to navigate to. *"The next change should not be
 * another dashboard redesign."*
 */
export default async function OnlineTvPage() {
  const [channels, building] = await Promise.all([
    listChannels().catch(() => []), theBuilding(),
  ]);
  const now = Date.now();

  const rows: RoomCard[] = channels.map((one) => {
    const on = whatIsOn(one, now);
    /*
     * WHAT THE AUDIENCE IS SEEING, IN ITS OWN WORDS. `whatIsOn` answers
     * with the reason as well as the fact — a scheduled programme, the
     * loop, a live feed, an emergency cut-away, the backup — and a
     * control room that flattened all five to "ON AIR" would be hiding
     * the two that mean something has gone wrong.
     */
    const doing = on.kind === 'programme' ? (on.programme.title ?? 'a programme')
      : on.kind === 'rotation' ? (on.entry.title ?? 'the loop')
        : on.kind === 'live' ? 'a live feed'
          : on.kind === 'emergency' ? 'an emergency cut-away'
            : on.kind === 'backup' ? 'the backup' : null;
    const scheduled = one.programmes.length + one.rotation.length;
    return {
      id: one.id,
      href: `/t/${one.id}`,
      title: one.name,
      from: on.kind === 'off' ? 'Off air' : 'On air',
      under: doing ? `Showing ${doing} · ${scheduled} scheduled`
        : `${scheduled} scheduled · ${one.timezone}`,
      when: when(one.updatedAt),
      state: one.publication && !one.publication.unpublishedAt ? 'Published' : null,
      poster: null,
      ...(on.kind !== 'off' ? { live: true } : {}),
    };
  });

  return (
    <Room room={roomFor('online-tv')} {...building} start={<StartChannel />}>
      <RoomWork
        rows={rows}
        heading="Channels"
        empty="No channel yet"
        emptySays={'Name one above — it has a schedule, a loop and an output '
          + 'from the moment it exists.'} />
    </Room>
  );
}
