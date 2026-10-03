import { directory } from '../../src/domain/channelListing.js';
import { listChannels } from '../../src/store/channels.js';
import { ChannelGrid, TvFrame } from './Tv.js';
import { lineupFor } from '../../src/store/lineup.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'BalanceVid TV — live channels',
  description:
    'Watch live channels from the BalanceVid network. Independent stations, '
    + 'each running its own schedule, broadcasting on the internet.',
};

/**
 * The front door of the network.  [TV-NETWORK N-4]
 *
 * > *"a normal person can arrive at BalanceVid and immediately
 * > understand: BalanceVid isn't only software for broadcasters. It
 * > also has a television network."*
 *
 * SERVED, NOT FETCHED. This page is the first thing a stranger sees
 * and the first thing a crawler reads, and a grid that arrives
 * after a round trip is a grid a search engine and a slow phone
 * both miss. The data is already on this machine — the directory is
 * a walk over the channel documents — so the page renders with the
 * channels in it.
 *
 * IT READS THE DOMAIN DIRECTLY rather than its own API. The API
 * exists for clients that are not this page, which is every future
 * one; a server component fetching its own server is a hop that
 * buys nothing.
 */
export default async function TvPage() {
  const all = await listChannels().catch(() => []);
  const channels = directory(all, await lineupFor(all.map((one) => one.id)).catch(() => ({})));
  return (
    <TvFrame here="/tv">
      <h1 style={{ margin: '0 0 6px', fontSize: 'var(--text-xl)' }}>
        Live now
      </h1>
      <p className="muted" style={{ margin: '0 0 var(--space-5)' }}>
        {channels.length === 1
          ? 'One channel on the network.'
          : `${channels.length} channels on the network.`}
      </p>
      <ChannelGrid channels={channels} />
    </TvFrame>
  );
}
