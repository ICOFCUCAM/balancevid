import { directory } from '../../../src/domain/channelListing.js';
import { listChannels } from '../../../src/store/channels.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { TvFrame } from '../Tv.js';
import Favorites from './Favorites.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Favorites — BalanceVid TV',
  description: 'The channels you keep on this device.',
};

/**
 * The channels this viewer keeps.  [TV-NETWORK N-9]
 *
 *     HOME · LIVE · GUIDE · CHANNELS · SEARCH · FAVORITES
 *
 * THE WHOLE DIRECTORY IS SERVED AND THE FILTERING IS THE
 * BROWSER'S, because the list of favourites is in the browser and
 * nowhere else. The alternative is a round trip carrying a
 * viewer's slugs to a server that has no business holding them —
 * which would turn a per-device preference into something this
 * installation knows about every visitor. [D-03]
 *
 * A directory is tens of rows, not thousands, and it is the same
 * answer `/tv` already renders. When an installation has enough
 * channels for that to be the wrong trade, the right fix is
 * paging the directory, not posting the viewer's list.
 */
export default async function FavoritesPage() {
  const all = await listChannels().catch(() => []);
  const channels = directory(
    all, await lineupFor(all.map((one) => one.id)).catch(() => ({})));
  return (
    <TvFrame here="/tv/favorites">
      <h1 style={{ margin: '0 0 6px', fontSize: 'var(--text-xl)' }}>
        Favorites
      </h1>
      <Favorites channels={channels} />
    </TvFrame>
  );
}
