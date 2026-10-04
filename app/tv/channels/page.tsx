import { directory } from '../../../src/domain/channelListing.js';
import { listChannels } from '../../../src/store/channels.js';
import { GENRES } from '../../../src/domain/station.js';
import { nowAndNext } from '../../../src/domain/onAir.js';
import { NetworkCard, SortBy, TvFrame } from '../Tv.js';
import { NETWORK_ART } from '../art.js';
import { lineupFor } from '../../../src/store/lineup.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Channels — BalanceVid TV',
  description:
    'Every channel on the BalanceVid network. Independent stations from '
    + 'anywhere, each running its own schedule.',
};

/**
 * HOW THE DIRECTORY MAY BE ORDERED, AND WHY *POPULAR* IS NOT HERE.
 *
 * The design this page was built against offers a *Popular* sort.
 * Nothing in this product counts a viewer: there is no watch
 * record, no view tally, and adding one is a decision about
 * measuring an audience rather than a line of sorting code — on a
 * network whose whole argument is that it holds as little about
 * people as it can. A control labelled *Popular* over an
 * alphabetical list would be the worse of the two outcomes.
 *
 * SO THE THREE HERE ARE THINGS THIS NETWORK ACTUALLY KNOWS. The
 * number is what a remote control does, the name is what browsing
 * does, and newest is the one a returning viewer wants. [D-21]
 */
const ORDERS = {
  number: 'Channel number',
  name: 'Name',
  newest: 'Recently added',
} as const;
type Order = keyof typeof ORDERS;

function orderFrom(said: string | undefined): Order {
  return said === 'name' || said === 'newest' ? said : 'number';
}

/**
 * The directory.  [TV-NETWORK N-4]
 *
 * > *"But don't make it just a giant list."*
 *
 * ONE GRID WITH A FILTER OVER IT, rather than a stack of shelves
 * per genre. The shelves were right when the only way to narrow
 * the page was to read it; with a filter row and a sort, a reader
 * picks the slice and the grid answers — and `/tv/categories` is
 * the page that exists for reading the network BY kind. Two pages,
 * two questions, rather than one page answering both badly. [D-04]
 *
 * EVERY PILL IS A GENRE THAT HAS A CHANNEL UNDER IT. A filter that
 * can return nothing is a filter that teaches somebody the network
 * is empty. [D-21]
 */
export default async function ChannelsPage(
  { searchParams }: { searchParams: Promise<{ genre?: string; order?: string }> },
) {
  const { genre, order: asked } = await searchParams;
  const held = await listChannels().catch(() => []);
  const all = directory(
    held, await lineupFor(held.map((one) => one.id)).catch(() => ({})));

  const at = Date.now();
  const live: Record<string, boolean> = {};
  const now: Record<string, string | null> = {};
  const made: Record<string, string> = {};
  for (const channel of held) {
    const slug = channel.station?.slug;
    if (!slug) continue;
    const on = nowAndNext(channel, at);
    live[slug] = on.live;
    now[slug] = on.title;
    made[slug] = channel.createdAt;
  }

  const wanted = GENRES.find((one) => one === genre);
  const order = orderFrom(asked);
  const shown = [...(wanted ? all.filter((one) => one.genre === wanted) : all)]
    .sort((a, b) => {
      if (order === 'name') return a.name.localeCompare(b.name);
      if (order === 'newest') {
        return (made[b.slug] ?? '').localeCompare(made[a.slug] ?? '');
      }
      /*
       * A CHANNEL WITH NO NUMBER GOES LAST AND NOT FIRST. `number`
       * is optional — a channel published before the lineup
       * existed has none — and `undefined` sorting to the top
       * would put the unnumbered ones where the lowest numbers
       * belong. [channelListing.ts]
       */
      return (a.number ?? Infinity) - (b.number ?? Infinity)
        || a.name.localeCompare(b.name);
    });

  /*
   * THE PILLS ARE ORDERED BY WHAT THE NETWORK CARRIES MOST OF,
   * which is the same ordering `/tv/categories` uses and the same
   * reason: `GENRES` is a declaration order in a source file, and
   * a filter row led by a genre with one channel in it tells a
   * reader the wrong thing about the network. [D-04]
   */
  const shelves = GENRES
    .filter((one) => all.some((c) => c.genre === one))
    .sort((a, b) => all.filter((c) => c.genre === b).length
      - all.filter((c) => c.genre === a).length || a.localeCompare(b));
  const keep = (bits: Record<string, string | undefined>) => {
    const out = new URLSearchParams();
    for (const [key, value] of Object.entries(bits)) if (value) out.set(key, value);
    const said = out.toString();
    return said ? `/tv/channels?${said}` : '/tv/channels';
  };

  return (
    <TvFrame here="/tv/channels" bare>
      <section className="net-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="net-hero-art" src={NETWORK_ART.directory}
             style={{ objectPosition: NETWORK_ART.directoryFocus }} />
        <span aria-hidden="true" className="net-hero-veil" />
        <div className="net-head-said">
          <h1 className="net-head-title">TV Channels</h1>
          <p className="net-head-lede">
            Independent stations from anywhere, each running its own schedule.
          </p>
          {/*
            * THE FIELD SUBMITS TO THE SEARCH THAT ALREADY EXISTS.
            * A directory whose own box filtered only this page
            * would find less than the one in the header. [D-19]
            */}
          <form className="net-find" action="/tv/search" method="get"
                data-testid="tv-find">
            <span aria-hidden="true" style={{ color: 'var(--ink-400)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" />
              </svg>
            </span>
            <input name="q" type="search" autoComplete="off"
                   placeholder="Search channels, categories or countries" />
          </form>
        </div>
      </section>

      {shelves.length > 0 && (
        <div className="net-filters">
          <nav className="net-pills" data-testid="tv-shelves">
            {/* A LINK SAYS WHERE YOU ARE WITH `aria-current`, which
                is the anchor's equivalent of the `aria-pressed` a
                toggle owes a reader. A filled pill is a colour. */}
            <a href={keep({ order: asked })} className="net-pill"
               {...(wanted ? {} : { 'aria-current': 'page' as const })}
               data-on={wanted ? 'false' : 'true'}>All</a>
            {shelves.map((shelf) => (
              <a key={shelf} href={keep({ genre: shelf, order: asked })}
                 data-testid="tv-shelf" className="net-pill"
                 {...(shelf === wanted ? { 'aria-current': 'page' as const } : {})}
                 data-on={shelf === wanted ? 'true' : 'false'}
                 style={{ textTransform: 'capitalize' }}>{shelf}</a>
            ))}
          </nav>
          <span className="net-count" data-testid="tv-count">
            {shown.length === 0
              ? 'Nothing here'
              : `${shown.length} ${shown.length === 1 ? 'channel' : 'channels'}`}
          </span>
          <SortBy order={order} orders={ORDERS}
                  {...(wanted ? { genre: wanted } : {})} />
        </div>
      )}

      <section className="net-band">
        {shown.length === 0 ? (
          <div className="panel room-empty" data-testid="tv-empty">
            <strong className="room-empty-title">Nothing here yet</strong>
            <span className="room-empty-says">
              A channel appears here when its owner publishes it and asks to
              be listed.
            </span>
          </div>
        ) : (
          <div className="net-cards" data-testid="tv-grid">
            {shown.map((channel) => (
              <NetworkCard key={channel.slug} channel={channel}
                           {...(live[channel.slug] ? { live: true } : {})}
                           now={now[channel.slug] ?? null} />
            ))}
          </div>
        )}
      </section>
    </TvFrame>
  );
}
