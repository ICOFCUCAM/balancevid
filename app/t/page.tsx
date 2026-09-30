import { listChannels } from '../../src/store/channels.js';
import {
  nextAfter, orderedProgrammes, programmeStart, whatIsOn,
} from '../../src/domain/channel.js';
import type { Channel } from '../../src/domain/channel.js';
import { engineState, healthSentence, streamState } from '../../src/domain/health.js';
import { newestSegmentAt, readBeat } from '../../src/store/playoutHealth.js';
import { PLATFORMS, type DestinationKind } from '../../src/domain/distribution.js';
import { roomFor } from '../../src/domain/rooms.js';
import Room from '../Room.js';
import StartChannel from '../StartChannel.js';
import ControlRoom, { type OnTheAir } from './ControlRoom.js';
import { theBuilding } from '../building.js';

export const dynamic = 'force-dynamic';

/**
 * The control room's front door.  [CHANNEL §4, §15, §17, §18; D-19]
 *
 * *"The current screen is especially weak because it asks the user to type
 * a channel name and timezone before showing them anything about the
 * actual television system."*
 *
 * SO THE FORM IS NOT THE PAGE ANY MORE. What this page answers, in the
 * author's own order: what channel am I controlling, what is on air, what
 * is next, is it live, what is the schedule, where is it distributed.
 * Creating a channel is still here and is a secondary act.
 *
 * AND IT IS DELIBERATELY NOT THE OTHER TWO ROOMS. Studio One and Studio
 * Two open on "start something"; a channel is already running whether or
 * not anybody is standing here, so this opens on "here is what it is
 * doing". The three rooms share a frame and not an entrance.
 *
 * NOTHING ABOUT THE ENGINE OR THE CHANNEL MODEL CHANGED. Every number on
 * this page is read from the functions the playout engine and the viewer's
 * own route already read.
 */
export default async function OnlineTvPage() {
  const [channels, building, beat] = await Promise.all([
    listChannels().catch(() => []), theBuilding(), readBeat().catch(() => null),
  ]);
  const now = Date.now();

  /*
   * THE ENGINE IS ASKED ONCE, NOT PER CHANNEL. It is one process for the
   * whole installation, so a channel that says "the engine is stopped" and
   * another that says it is running would be reporting on one thing twice.
   */
  const engine = engineState(beat ? Date.parse(beat.at) : null, now);

  const onAir: OnTheAir[] = await Promise.all(channels.map(async (one) => {
    const on = whatIsOn(one, now);
    const coming = nextAfter(one, now);
    /*
     * WHETHER ANYTHING IS ACTUALLY ARRIVING — the measurement the VIEWER'S
     * page has always made and the control room never did.
     *
     * An audit found all three operator surfaces saying ON AIR from
     * `whatIsOn`, which is the SCHEDULE, while `/api/channels/<id>/now`
     * told the viewer `transmitting: false`. The viewer was being told the
     * truth and the operator was not, which for a control room is exactly
     * backwards. Both are shown here, and `healthSentence` — written so
     * that "the control room and the viewer must not describe the same
     * condition two different ways" — supplies the operator's wording.
     */
    const stream = streamState(await newestSegmentAt(one.id), now);
    return {
      id: one.id,
      name: one.name,
      href: `/t/${one.id}`,
      timezone: one.timezone,
      /** What the schedule says should be playing. */
      scheduled: on.kind === 'off' ? null : sayWhat(on.kind),
      showing: on.kind === 'programme' ? (on.programme.title ?? 'a programme')
        : on.kind === 'rotation' ? (on.entry.title ?? 'the loop')
          : on.kind === 'live' ? 'a live feed'
            : on.kind === 'emergency' ? 'an emergency cut-away'
              : on.kind === 'backup' ? 'the backup' : null,
      /** And whether the transmitter agrees. */
      transmitting: stream === 'transmitting',
      health: healthSentence(engine, stream, 'operator'),
      next: coming
        ? { title: coming.title ?? 'a programme', at: programmeStart(coming) }
        : null,
      today: todayOn(one, now),
      inLoop: one.rotation.length,
      published: Boolean(one.publication && !one.publication.unpublishedAt),
      destinations: (Object.keys(PLATFORMS) as DestinationKind[])
        .filter((kind) => kind !== 'rtmp')
        .map((kind) => {
          const declared = (one.destinations ?? []).find((d) => d.kind === kind);
          return {
            kind,
            label: PLATFORMS[kind].label,
            state: kind === 'own' ? 'connected' as const
              : declared?.enabled ? 'connected' as const
                : declared ? 'off' as const : 'none' as const,
          };
        }),
    };
  }));

  return (
    <Room room={roomFor('online-tv')} {...building} head="plain" start={null}>
      <ControlRoom channels={onAir} make={<StartChannel />} />
    </Room>
  );
}

/** The five things `whatIsOn` can mean, kept apart. [CHANNEL §4] */
function sayWhat(kind: string): string {
  return kind === 'programme' ? 'Scheduled programme'
    : kind === 'rotation' ? 'The loop'
      : kind === 'live' ? 'Live feed'
        : kind === 'emergency' ? 'Emergency cut-away' : 'Backup';
}

/**
 * Today's fixed slots, in the order they go out.
 *
 * ONLY THE FIXED ONES. A rotation has no clock time — it fills whatever
 * the programmes leave — so putting it in a column headed with times
 * would be inventing a start it does not have. The loop is counted
 * separately and said as a count.
 */
function todayOn(channel: Channel, now: number): {
  at: number; title: string; minutes: number | null;
}[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 24 * 60 * 60 * 1000;
  return orderedProgrammes(channel)
    .filter((one) => {
      const at = programmeStart(one);
      return at >= start.getTime() && at < end;
    })
    .map((one) => ({
      at: programmeStart(one),
      title: one.title ?? channel.name,
      minutes: one.durationMs ? Math.round(one.durationMs / 60000) : null,
    }));
}
