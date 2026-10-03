import { directory } from '../../../src/domain/channelListing.js';
import { matching } from '../../../src/domain/channelSearch.js';
import { listChannels } from '../../../src/store/channels.js';
import { ChannelGrid, TvFrame } from '../Tv.js';
import { lineupFor } from '../../../src/store/lineup.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Search — BalanceVid TV',
  description: 'Find a channel on the BalanceVid network.',
};

/**
 * Search.  [TV-NETWORK N-4]
 *
 * A FORM THAT WORKS WITHOUT JAVASCRIPT, because this page is served
 * to strangers on whatever they happen to be holding, and a search
 * box that needs a bundle to submit is a search box that does not
 * work on the phone in the back of a church hall. `method="get"`
 * puts the query in the URL, which also makes a search shareable.
 *
 * THE MATCH IS A DOMAIN JUDGEMENT, not a filter written inline: it
 * decides what counts as a hit across name, callsign, genre and
 * country, and that is a decision somebody will want to change.
 */
export default async function SearchPage(
  { searchParams }: { searchParams: Promise<{ q?: string }> },
) {
  const { q } = await searchParams;
  const asked = (q ?? '').trim();
  const held = await listChannels().catch(() => []);
  const all = directory(held, await lineupFor(held.map((one) => one.id)).catch(() => ({})));
  const found = asked ? matching(all, asked) : [];

  return (
    <TvFrame here="/tv/search">
      <h1 style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--text-xl)' }}>
        Search
      </h1>
      <form method="get" action="/tv/search" className="row"
            style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-5)',
              maxWidth: 480 }}>
        <input name="q" defaultValue={asked} data-testid="tv-search-input"
               placeholder="A channel, a callsign, a kind of programme"
               aria-label="Search channels" />
        <button type="submit" className="ctl"
                style={{ flex: '0 0 auto' }}>Search</button>
      </form>
      {!asked
        ? <p className="muted">{all.length === 1
          ? 'One channel on the network.'
          : `${all.length} channels on the network.`}</p>
        : found.length === 0
          ? (
            <p className="muted" data-testid="tv-no-hits">
              Nothing matches “{asked}”.
            </p>
          )
          : (
            <>
              <p className="muted" data-testid="tv-hits">
                {found.length === 1 ? '1 channel' : `${found.length} channels`}
              </p>
              <ChannelGrid channels={found} />
            </>
          )}
    </TvFrame>
  );
}
