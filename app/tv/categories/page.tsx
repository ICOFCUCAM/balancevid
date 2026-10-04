import Link from 'next/link';

import { byGenre, directory } from '../../../src/domain/channelListing.js';
import { listChannels } from '../../../src/store/channels.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { nowAndNext } from '../../../src/domain/onAir.js';
import Icon from '../../Icon.js';
import { TvFrame } from '../Tv.js';
import { shelfFor } from '../art.js';
import { asWord, markFor } from '../kinds.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Categories — BalanceVid TV',
  description:
    'Every kind of channel on the BalanceVid network: news, music, faith, '
    + 'education, culture, sport and more, each with the stations carrying it.',
};

/**
 * The network by what is on it.  [TV-NETWORK N-4]
 *
 * > *"But don't make it just a giant list."*
 *
 * A CATEGORY IS A DOOR AND A DOOR IS A TILE. This page was a list
 * of lists — a heading per kind with a shelf of channel cards
 * under each — which is the directory drawn twice and read once.
 * `/tv/channels?genre=…` already draws what is behind the door, so
 * the page in front of it has one job: show every kind this
 * network carries, with enough on each tile to choose. [D-04]
 *
 * EVERY TILE IS A GENRE THAT EXISTS. Nothing here is a fixed list
 * of departments — it is the channels, grouped by what their
 * owners said they are. The design this was built against carries
 * eight named categories; a network with no sport has no Sport
 * tile, because the one thing a person does with a category is
 * press it. [D-21]
 *
 * MOST-CARRIED FIRST, which `byGenre` decides and `/tv/channels`
 * orders its pills by too. One answer, one function. [D-19]
 */
export default async function CategoriesPage() {
  const all = await listChannels().catch(() => []);
  const channels = directory(
    all, await lineupFor(all.map((one) => one.id)).catch(() => ({})));

  const at = Date.now();
  const live = new Set<string>();
  for (const channel of all) {
    const slug = channel.station?.slug;
    if (slug && nowAndNext(channel, at).live) live.add(slug);
  }

  const kinds = byGenre(channels);
  /*
   * COUNTED OFF THE TILES AND NOT OFF THE DIRECTORY, because a
   * channel that named no kind is in neither — saying *8
   * channels* over tiles that add up to six is the page
   * contradicting itself in one glance. [D-21]
   */
  const filed = kinds.reduce((sum, [, under]) => sum + under.length, 0);

  return (
    <TvFrame here="/tv/categories" bare>
      <div className="cat-head">
        <div className="cat-head-row">
          <div style={{ minWidth: 0 }}>
            <h1 className="cat-title">
              <Icon name="library" size={24} />
              Browse by category
            </h1>
            <p className="cat-lede">
              {kinds.length === 0
                ? 'No channel has said what kind of channel it is yet.'
                : 'Every kind of channel this network carries, '
                  + 'and how many are on each.'}
            </p>
          </div>
          {kinds.length > 0 && (
            <span className="cat-count" data-testid="tv-category-count">
              {kinds.length} {kinds.length === 1 ? 'category' : 'categories'}
              {' · '}
              {filed} {filed === 1 ? 'channel' : 'channels'}
            </span>
          )}
        </div>
      </div>

      <div className="cat-body">
        <div className="cat-grid" data-testid="tv-categories">
          {kinds.map(([kind, under]) => {
            const onAir = under.filter((one) => live.has(one.slug)).length;
            return (
              <Link key={kind} href={`/tv/channels?genre=${kind}`}
                    className="cat-tile" data-testid="tv-category"
                    data-genre={kind} style={shelfFor(kind)}>
                <span aria-hidden="true" className="cat-tile-wash" />
                <span aria-hidden="true" className="cat-tile-mark">
                  <Icon name={markFor(kind)} size={19} />
                </span>
                <span className="cat-tile-name">{asWord(kind)}</span>
                <span className="cat-tile-says">
                  {under.length} {under.length === 1 ? 'channel' : 'channels'}
                  {/*
                    * HOW MANY ARE ON AIR, which is the one thing
                    * a tile can say that a count of channels
                    * cannot: a category with nothing live in it
                    * is a category to come back to later. It is
                    * absent rather than drawn as a zero, because
                    * a row of grey noughts is eight dead ends.
                    * [D-21, U-19]
                    */}
                  {onAir > 0 && (
                    <span className="cat-tile-live">
                      <span aria-hidden="true" className="cat-tile-dot" />
                      {onAir} live
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>

        <aside className="cat-aside">
          <span aria-hidden="true" className="cat-aside-mark">
            <Icon name="play" size={19} />
          </span>
          <p className="cat-aside-lead">Different channels. One network.</p>
          <p className="cat-aside-said">
            Independent stations from anywhere, each running its own schedule
            against its own clock. A category is a way in; the channel belongs
            to whoever made it.
          </p>
          {/*
            * THE WAYS OUT OF A DEAD END. A reader who finds no
            * category they want is one press from the whole
            * directory, from what is on now, and from search —
            * rather than from the back button. [U-19]
            */}
          <div className="cat-aside-ways">
            <Link href="/tv/channels" className="cat-aside-way">
              <Icon name="channels" size={15} />
              All channels
            </Link>
            <Link href="/tv/guide" className="cat-aside-way">
              <Icon name="calendar" size={15} />
              What is on now
            </Link>
            <Link href="/tv/search" className="cat-aside-way">
              <Icon name="search" size={15} />
              Search the network
            </Link>
          </div>
        </aside>
      </div>
    </TvFrame>
  );
}
