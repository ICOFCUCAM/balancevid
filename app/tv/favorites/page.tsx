import { directory } from '../../../src/domain/channelListing.js';
import { listChannels } from '../../../src/store/channels.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { nowAndNext } from '../../../src/domain/onAir.js';
import { TvFrame } from '../Tv.js';
import Favorites, { type Showing } from './Favorites.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Favorites — BalanceVid TV',
  description: 'The channels you keep on this device, as your own lineup.',
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
 *
 * WHAT IS ON COMES WITH THEM, computed here for every channel
 * rather than for the kept ones — for the same reason the rows
 * do. Asking the server *what is on my favourites* is asking it
 * what the favourites are. The guide, the directory and the
 * station page all read `nowAndNext`; this is the fourth, and
 * none of them derives it again. [D-19, D-03]
 */
export default async function FavoritesPage() {
  const all = await listChannels().catch(() => []);
  const channels = directory(
    all, await lineupFor(all.map((one) => one.id)).catch(() => ({})));

  const at = Date.now();
  const showing: Record<string, Showing> = {};
  for (const channel of all) {
    const slug = channel.station?.slug;
    if (!slug) continue;
    const on = nowAndNext(channel, at);
    showing[slug] = {
      now: on.title,
      live: on.live,
      untilMs: on.untilMs,
      next: on.next,
      nextAt: on.nextAt,
    };
  }

  return (
    <TvFrame here="/tv/favorites" bare>
      <Favorites channels={channels} showing={showing} />
    </TvFrame>
  );
}
