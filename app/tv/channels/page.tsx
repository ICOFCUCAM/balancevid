import { directory } from '../../../src/domain/channelListing.js';
import { listChannels } from '../../../src/store/channels.js';
import { GENRES } from '../../../src/domain/station.js';
import { ChannelGrid, TvFrame } from '../Tv.js';
import { lineupFor } from '../../../src/store/lineup.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Channels — BalanceVid TV',
  description: 'Every channel on the BalanceVid network, by kind.',
};

/**
 * The directory.  [TV-NETWORK N-4]
 *
 * > *"But don't make it just a giant list."*
 *
 * SHELVES, AND ONLY THE ONES WITH SOMETHING ON THEM. The brief
 * names eleven ways to slice a directory and a new network has
 * channels for perhaps two of them; drawing all eleven would be a
 * page of empty headings telling a visitor the network is empty in
 * eleven different ways. A heading appears when a channel is under
 * it. [D-04]
 */
export default async function ChannelsPage(
  { searchParams }: { searchParams: Promise<{ genre?: string }> },
) {
  const { genre } = await searchParams;
  const held = await listChannels().catch(() => []);
  const all = directory(held, await lineupFor(held.map((one) => one.id)).catch(() => ({})));
  const wanted = GENRES.find((one) => one === genre);
  const shown = wanted ? all.filter((one) => one.genre === wanted) : all;
  const shelves = GENRES.filter((one) => all.some((c) => c.genre === one));

  return (
    <TvFrame here="/tv/channels">
      <h1 style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--text-xl)' }}>
        Channels
      </h1>
      {shelves.length > 0 && (
        <nav className="row" data-testid="tv-shelves"
             style={{ gap: 'var(--space-3)', flexWrap: 'wrap',
               marginBottom: 'var(--space-5)' }}>
          <a href="/tv/channels" data-on={wanted ? 'false' : 'true'}
             className="small" style={{ textDecoration: 'none',
               color: wanted ? 'var(--muted)' : 'var(--text)' }}>All</a>
          {shelves.map((shelf) => (
            <a key={shelf} href={`/tv/channels?genre=${shelf}`}
               data-testid="tv-shelf" data-on={shelf === wanted ? 'true' : 'false'}
               className="small" style={{ textDecoration: 'none',
                 textTransform: 'capitalize',
                 color: shelf === wanted ? 'var(--text)' : 'var(--muted)' }}>
              {shelf}
            </a>
          ))}
        </nav>
      )}
      <ChannelGrid channels={shown} />
    </TvFrame>
  );
}
