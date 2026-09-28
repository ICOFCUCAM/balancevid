import pkg from '../package.json' with { type: 'json' };

import { orderedInterventions } from '../src/domain/document.js';
import { listConversations, loadConversation } from '../src/store/repository.js';
import { listPerformances } from '../src/store/performances.js';
import { listChannels } from '../src/store/channels.js';
import { whatIsOn } from '../src/domain/channel.js';
import { bytesLabel, diskSpace } from '../src/store/space.js';
import { theAccount } from '../src/store/accounts.js';
import { listJobs } from '../src/store/queue.js';
import { PLATFORMS, type DestinationKind } from '../src/domain/distribution.js';
import { runtime } from '../src/web/runtime.js';
import { formatMasterPosition, formatTimecode } from '../src/domain/time.js';
import StartConversation from './StartConversation.js';
import StartPerformance from './StartPerformance.js';
import StartChannel from './StartChannel.js';
import Workspace, { type WorkRecord } from './Workspace.js';

export const dynamic = 'force-dynamic';

/*
 * THE VERSION IN THE FOOTER IS THE ONE THAT SHIPPED. Typing it into the
 * page is how a footer ends up two releases behind and nobody notices,
 * because nobody reads a footer until they are trying to work out which
 * build somebody is on.
 */
const VERSION = `v${(pkg as { version: string }).version}`;

/**
 * The way in.  [Doctrine §19, §13, STUDIO-TWO §13, CHANNEL §13]
 *
 * Three studios, everything made in them, and how much room is left. The
 * shape is the building: a rail of places, the three doors, and the work.
 *
 * THIS FILE ONLY GATHERS. Every number here is measured — the durations come
 * from the documents, the storage from the disk, whether a channel is on air
 * from `whatIsOn` — and none of it is arranged. The arranging is
 * `Workspace`, which is a client component because searching and deleting
 * are things a person does without reloading.
 */
export default async function Home() {
  const [summaries, performances, channels, space, account, jobs] = await Promise.all([
    listConversations(),
    listPerformances().catch(() => []),
    listChannels().catch(() => []),
    diskSpace(),
    theAccount(),
    listJobs().catch(() => []),
  ]);

  const now = Date.now();

  /*
   * One frame per conversation, so the library is recognisable rather than a
   * column of titles. Read from the document; a response recorded before
   * posters existed simply has none, and says so rather than showing a
   * plausible grey rectangle.
   */
  const conversationRecords: WorkRecord[] = await Promise.all(
    summaries.map(async (summary) => {
      const conversation = await loadConversation(summary.id).catch(() => null);
      const first = conversation ? orderedInterventions(conversation)[0] : undefined;
      const take = first?.takes.find((candidate) => candidate.id === first.selectedTakeId);
      const responses = conversation?.interventions.length ?? 0;
      return {
        id: summary.id,
        kind: 'conversation' as const,
        title: summary.title,
        detail: `${responses} ${responses === 1 ? 'response' : 'responses'}`,
        duration: summary.source.durationFrames > 0
          ? formatTimecode(summary.source.durationFrames).slice(0, 8)
          : null,
        poster: take && take.durationFrames > 0
          ? `/api/conversations/${summary.id}/takes/${take.id}/media?kind=poster`
          : null,
        href: `/c/${summary.id}`,
        updatedAt: summary.updatedAt ?? summary.createdAt,
        published: Boolean(
          summary.publication && !summary.publication.unpublishedAt),
      };
    }),
  );

  const performanceRecords: WorkRecord[] = performances.map((performance) => {
    const usable = performance.takes.filter((take) => take.durationSamples > 0);
    return {
      id: performance.id,
      kind: 'performance' as const,
      title: performance.title,
      detail: `${performance.takes.length} `
        + `${performance.takes.length === 1 ? 'take' : 'takes'}`,
      duration: performance.master.durationSamples > 0
        ? formatMasterPosition(performance.master.durationSamples).slice(0, 5)
        : null,
      poster: usable[0]
        ? `/api/performances/${performance.id}/takes/${usable[0].id}/media?kind=poster`
        : null,
      href: `/p/${performance.id}`,
      updatedAt: performance.updatedAt,
      published: Boolean(
        performance.publication && !performance.publication.unpublishedAt),
    };
  });

  const channelRecords: WorkRecord[] = channels.map((channel) => {
    /*
     * WHAT IS ACTUALLY ON, by the function the playout engine uses — not by
     * scanning the fixed slots, which was the old answer here and was wrong
     * for every channel whose day is filled by the loop. [CHANNEL §4]
     */
    const on = whatIsOn(channel, now);
    const scheduled = channel.programmes.length + channel.rotation.length;
    return {
      id: channel.id,
      kind: 'channel' as const,
      title: channel.name,
      detail: `${scheduled} scheduled · ${channel.timezone}`,
      duration: null,
      poster: null,
      href: `/t/${channel.id}`,
      updatedAt: channel.updatedAt,
      published: Boolean(
        channel.publication && !channel.publication.unpublishedAt),
      live: on.kind !== 'off',
    };
  });

  /* Newest first, across all three, which is what "recent" has to mean. */
  const records = [...conversationRecords, ...performanceRecords, ...channelRecords]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  /*
   * THE CHANNEL AT THE TOP OF THE PAGE.  [CHANNEL §4, §15]
   *
   * The newest one, because a single-channel instance has exactly one and
   * a page that made you choose would be asking a question with one
   * answer. Everything on it is measured: whether it is on air comes from
   * `whatIsOn` — the same function the playout engine uses, so the badge
   * and the transmitter cannot disagree — and the next programme is the
   * next fixed slot that has not started, not a guess from the list.
   */
  const front = [...channels].sort(
    (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];

  const hero = front ? (() => {
    const on = whatIsOn(front, now);
    const upcoming = [...front.programmes]
      .filter((programme) => Date.parse(programme.startsAt) > now)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = startOfDay.getTime() + 24 * 60 * 60 * 1000;
    return {
      id: front.id,
      name: front.name,
      href: `/t/${front.id}`,
      timezone: front.timezone,
      live: on.kind !== 'off',
      /* What the audience is seeing, when anybody is. */
      onAir: on.kind === 'programme' ? (on.programme.title ?? 'a programme')
        : on.kind === 'rotation' ? (on.entry.title ?? 'the loop')
          : on.kind === 'live' ? 'a live feed'
            : on.kind === 'emergency' ? 'an emergency cut-away'
              : on.kind === 'backup' ? 'the backup' : null,
      next: upcoming
        ? { title: upcoming.title ?? 'a programme', startsAt: upcoming.startsAt }
        : null,
      today: front.programmes.filter((programme) => {
        const at = Date.parse(programme.startsAt);
        return at >= startOfDay.getTime() && at < endOfDay;
      }).length,
      inLoop: front.rotation.length,
      /*
       * EVERY DESTINATION THE MODEL KNOWS ABOUT, not only the declared
       * ones — a panel listing what you have connected tells you nothing
       * about what you could connect, which is the question somebody
       * looking at it is actually asking. The channel's own output is
       * always there and always available; the rest say plainly that
       * they are not wired up, because they are not. [§15]
       */
      destinations: (Object.keys(PLATFORMS) as DestinationKind[])
        .filter((kind) => kind !== 'rtmp')
        .map((kind) => {
          const declared = (front.destinations ?? []).find((d) => d.kind === kind);
          return {
            kind,
            label: PLATFORMS[kind].label,
            state: kind === 'own' ? 'connected' as const
              : declared?.enabled ? 'connected' as const
                : declared ? 'off' as const : 'none' as const,
          };
        }),
    };
  })() : null;

  return (
    <Workspace
      account={{ name: account.name, role: 'Owner' }}
      runtime={runtime()}
      /*
       * WHAT IS ACTUALLY PENDING, from the queue itself. A bell with a
       * dot on it that nothing can ever put there is furniture; this one
       * is silent unless the worker has something in hand or something
       * fell over. [D-07]
       */
      pending={{
        working: jobs.filter((job) => job.state === 'running').length,
        waiting: jobs.filter((job) => job.state === 'pending').length,
        failed: jobs.filter((job) => job.state === 'failed').length,
      }}
      hero={hero}
      version={VERSION}
      records={records}
      space={{
        used: bytesLabel(space.usedBytes),
        free: bytesLabel(space.freeBytes),
        total: bytesLabel(space.totalBytes),
        /*
         * Of the disk, not of a plan. There is no quota to be a fraction of,
         * and inventing one would put a number on the page that nothing
         * enforces.
         */
        fraction: space.totalBytes > 0
          ? (space.totalBytes - space.freeBytes) / space.totalBytes : 0,
        partial: space.partial,
      }}
      starters={{
        one: <StartConversation />,
        two: <StartPerformance />,
        tv: <StartChannel />,
      }}
    />
  );
}
