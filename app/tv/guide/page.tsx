import { inDirectory, listingFor } from '../../../src/domain/channelListing.js';
import { columnsFor, guideWindow, placeOf, rowFor } from '../../../src/domain/tvGuide.js';
import { listChannels } from '../../../src/store/channels.js';
import type { Assignments } from '../../../src/domain/registry.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { TvFrame } from '../Tv.js';
import Grid from './Grid.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'TV guide — BalanceVid TV',
  description: 'What is on, across every channel on the BalanceVid network.',
};

/**
 * The guide.  [TV-NETWORK N-5]
 *
 * > *"That is what makes hundreds of channels feel like a
 * > television network, rather than hundreds of independent web
 * > streams."*
 *
 * THE ROWS ARE BUILT ON THE SERVER AND THE CLOCK IS APPLIED ON THE
 * CLIENT. The walk needs the channel documents, which only this
 * machine has; the column headings need the VIEWER'S timezone,
 * which only their browser knows. Formatting the times here would
 * print the server's timezone to everybody — the fault the domain
 * module exists to avoid, committed at the last step. [§2]
 */
export default async function GuidePage() {
  const channels = (await listChannels().catch(() => []));
  const lineup: Assignments = await lineupFor(channels.map((one) => one.id))
    .catch(() => ({}));
  const { from, to } = guideWindow(Date.now());
  const rows = channels
    .filter(inDirectory)
    .map((channel) => {
      const listing = listingFor(channel, lineup[channel.id]);
      return listing ? rowFor(channel, listing, from, to) : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    /*
     * BY NUMBER, UNLIKE THE DIRECTORY. A guide IS a lineup — it is
     * read down the channels in the order a remote steps through
     * them — where the directory is browsed by name. Two
     * orderings for two questions. A channel with no number goes
     * last rather than first, so an unnumbered one never sits at
     * the top of the grid. [D-04, N-6]
     */
    .sort((a, b) => (a.channel.number ?? Infinity) - (b.channel.number ?? Infinity)
      || a.channel.name.localeCompare(b.channel.name))
    .map((row) => ({
      channel: row.channel,
      slots: row.slots.map((slot) => ({
        ...slot, ...placeOf(slot, from, to),
      })),
    }));

  return (
    <TvFrame here="/tv/guide">
      <h1 style={{ margin: '0 0 var(--space-5)', fontSize: 'var(--text-xl)' }}>
        TV guide
      </h1>
      {rows.length === 0
        ? (
          <p className="muted" data-testid="tv-empty">
            No channels are listed yet. A channel appears here when its owner
            publishes it and asks to be listed.
          </p>
        )
        : <Grid rows={rows} columns={columnsFor(from, to)} from={from} to={to} />}
    </TvFrame>
  );
}
