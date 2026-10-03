import { headers } from 'next/headers';

import { directory } from '../../src/domain/channelListing.js';
import { listChannels } from '../../src/store/channels.js';
import { nowAndNext } from '../../src/domain/onAir.js';
import {
  Categories, LiveNow, NetworkHero, Reach, TvApps, TvFrame,
} from './Tv.js';
import { lineupFor } from '../../src/store/lineup.js';
import { originFrom } from '../../src/web/share.js';

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

  /*
   * WHAT IS ON, ANSWERED HERE AND NOT FETCHED SIX TIMES.
   *   [N-4, N-5]
   *
   * `nowAndNext` is the same function the station page uses, and
   * the channel documents are already in memory on this request —
   * so a shelf of six cards costs six pure calls rather than six
   * round trips from the browser. The station page fetches because
   * it POLLS; a directory does not. [D-19]
   *
   * KEYED BY SLUG, because that is what a `Listing` carries and
   * the id is the studio's business, not the viewer's.
   */
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

  /*
   * THE GENRES, MOST-CARRIED FIRST, AND REAL. A strip of fixed
   * categories with three of them empty advertises what the
   * network does not have, and the one thing a viewer does with a
   * category is press it. [D-21]
   */
  const counted = new Map<string, number>();
  for (const one of channels) {
    if (!one.genre) continue;
    counted.set(one.genre, (counted.get(one.genre) ?? 0) + 1);
  }
  const genres = [...counted.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);

  const countries = new Set(channels.map((one) => one.country).filter(Boolean));
  const languages = new Set(channels.map((one) => one.language).filter(Boolean));

  /* The door the hero's first button opens: something that is
     actually on, or nothing and the button is not drawn. */
  const watching = channels.find((one) => live[one.slug]) ?? channels[0] ?? null;

  return (
    <TvFrame here="/tv" bare>
      <NetworkHero genres={genres.slice(0, 6)} channels={channels.length}
                   watch={watching ? `/tv/channels/${watching.slug}` : null}
                   {...(genres.length > 6 ? { more: true } : {})} />
      {/*
        * WHAT IS ON COMES BEFORE HOW IT IS FILED.
        *
        * The categories strip was above the shelf and the benchmark
        * puts it below, which is not a matter of taste: somebody
        * arriving at a television network wants to see television.
        * A row of genre buttons between the hero and the channels
        * asks them to choose a department before they have seen
        * anything on the shelves.
        */}
      <LiveNow channels={channels} live={live} now={now} />
      <Categories genres={genres} />
      <Reach countries={countries.size} languages={languages.size}
             channels={channels.length} />

      {channels.length === 0 && (
        <section className="net-band">
          <div className="panel room-empty" data-testid="tv-empty">
            <strong className="room-empty-title">
              No channels are listed yet
            </strong>
            <span className="room-empty-says">
              A channel appears here when its owner publishes it and asks to
              be listed.
            </span>
          </div>
        </section>
      )}

      {/*
        * AND HOW TO TAKE IT OFF THIS PAGE. The addresses are
        * absolute because a television has no page to resolve a
        * relative one against, and they are on the front page
        * because the fault this stage keeps finding is a
        * capability nothing points at. [N-7]
        *
        * BELOW THE CHANNELS NOW RATHER THAN BESIDE THEM. A
        * stranger arriving has to see television before they are
        * offered a playlist URL — but it stays on this page,
        * because it is the one thing this network does that a
        * streaming site does not.
        */}
      <section className="net-band">
        <TvApps origin={originFrom(await headers()) ?? ''} />
      </section>
    </TvFrame>
  );
}
