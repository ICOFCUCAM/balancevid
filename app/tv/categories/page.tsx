import { byGenre, directory } from '../../../src/domain/channelListing.js';
import { listChannels } from '../../../src/store/channels.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { nowAndNext } from '../../../src/domain/onAir.js';
import { NetworkCard, TvFrame } from '../Tv.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Categories — BalanceVid TV',
  description:
    'Every kind of channel on the BalanceVid network: faith, news, music, '
    + 'education, culture and more, each with the stations carrying it.',
};

/**
 * The network by what is on it.  [TV-NETWORK N-4]
 *
 * THE PAGE THE HEADER WAS GOING TO PROMISE. The benchmark for the
 * front page carries CATEGORIES in its navigation, and a menu item
 * is a promise: the honest order is to build the page and then add
 * the link, rather than ship a header with a dead word in it.
 *
 * EVERY SECTION IS A GENRE THAT EXISTS. Nothing here is a fixed
 * list of departments — it is the channels, grouped by what their
 * owners said they are. A network with no sport has no Sport
 * heading, because the one thing a person does with a category is
 * press it. [D-21]
 *
 * MOST-CARRIED FIRST, AND THE NAMES INSIDE EACH ONE BY NAME. The
 * same two orderings the directory already draws, for the same
 * reason: a page is browsed down the headings and read across the
 * names. [D-04]
 */
export default async function CategoriesPage() {
  const all = await listChannels().catch(() => []);
  const channels = directory(
    all, await lineupFor(all.map((one) => one.id)).catch(() => ({})));

  const at = Date.now();
  const live: Record<string, boolean> = {};
  const now: Record<string, string | null> = {};
  for (const channel of all) {
    const slug = channel.station?.slug;
    if (!slug) continue;
    const on = nowAndNext(channel, at);
    live[slug] = on.live;
    now[slug] = on.title;
  }

  const sections = byGenre(channels);

  return (
    <TvFrame here="/tv/categories">
      <h1 style={{ margin: '0 0 6px', fontSize: 'var(--text-xl)' }}>
        Categories
      </h1>
      <p className="muted" style={{ margin: '0 0 var(--space-6)' }}>
        {sections.length === 0
          ? 'No channel has said what kind of channel it is yet.'
          : `What the network carries, in ${sections.length} `
            + `${sections.length === 1 ? 'kind' : 'kinds'}.`}
      </p>

      {sections.map(([genre, rows]) => (
        <section key={genre} style={{ marginBottom: 'var(--space-6)' }}>
          <div className="net-band-head">
            <h2 className="net-band-title" data-testid="tv-category-head">
              {genre.charAt(0).toUpperCase() + genre.slice(1)}
            </h2>
            <span className="small muted">
              {rows.length} {rows.length === 1 ? 'channel' : 'channels'}
            </span>
          </div>
          <div className="net-cards" data-testid="tv-category-rows">
            {rows.map((channel) => (
              <NetworkCard key={channel.slug} channel={channel}
                           {...(live[channel.slug] ? { live: true } : {})}
                           now={now[channel.slug] ?? null} />
            ))}
          </div>
        </section>
      ))}
    </TvFrame>
  );
}
