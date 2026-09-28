import { orderedInterventions } from '../src/domain/document.js';
import { listConversations, loadConversation } from '../src/store/repository.js';
import { listPerformances } from '../src/store/performances.js';
import { listChannels } from '../src/store/channels.js';
import { whatIsOn } from '../src/domain/channel.js';
import { bytesLabel, diskSpace } from '../src/store/space.js';
import { formatMasterPosition, formatTimecode } from '../src/domain/time.js';
import StartConversation from './StartConversation.js';
import StartPerformance from './StartPerformance.js';
import StartChannel from './StartChannel.js';
import Workspace, { type WorkRecord } from './Workspace.js';

export const dynamic = 'force-dynamic';

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
  const [summaries, performances, channels, space] = await Promise.all([
    listConversations(),
    listPerformances().catch(() => []),
    listChannels().catch(() => []),
    diskSpace(),
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

  return (
    <Workspace
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
