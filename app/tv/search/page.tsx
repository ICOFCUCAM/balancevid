import Link from 'next/link';

import { byGenre, directory, listingFor } from '../../../src/domain/channelListing.js';
import { matching, showings } from '../../../src/domain/channelSearch.js';
import { listChannels } from '../../../src/store/channels.js';
import type { Assignments } from '../../../src/domain/registry.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { nowAndNext } from '../../../src/domain/onAir.js';
import Icon from '../../Icon.js';
import { TvFrame } from '../Tv.js';
import { NETWORK_ART } from '../art.js';
import { asWord, markFor } from '../kinds.js';
import { Clock } from '../guide/Grid.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Search — BalanceVid TV',
  description: 'Find a channel, or find what is on, across the network.',
};

/**
 * WHAT A SEARCH CAN BE ASKING.  [N-4, D-04]
 *
 * > *"Search, Countries, Languages. This is how hundreds or
 * > thousands of user-created channels become navigable."*
 *
 * Somebody typing `worship` may mean a channel called Worship
 * Live, or they may mean *where can I watch worship this
 * evening*, or they may mean *show me the faith shelf*. Those
 * are three questions and the design this page was built against
 * is right to put a control between them rather than guess.
 */
const TABS = {
  channels: 'Channels',
  programmes: 'Programmes',
  categories: 'Categories',
} as const;
type Tab = keyof typeof TABS;

function tabFrom(said: string | undefined): Tab {
  return said === 'programmes' || said === 'categories' ? said : 'channels';
}

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
 *
 * EVERY TAB CARRIES ITS COUNT, which costs all three searches on
 * every request and is worth it: a tab that might be empty is a
 * tab a reader has to press to find out, and the whole point of
 * the control is to save them that. [D-21]
 */
export default async function SearchPage(
  { searchParams }: { searchParams: Promise<{ q?: string; in?: string }> },
) {
  const { q, in: asked } = await searchParams;
  const want = (q ?? '').trim();
  const tab = tabFrom(asked);

  const held = await listChannels().catch(() => []);
  const lineup: Assignments = await lineupFor(held.map((one) => one.id))
    .catch(() => ({}));
  const all = directory(held, lineup);

  const nowMs = Date.now();
  const channels = want ? matching(all, want) : [];
  /*
   * THE DOCUMENTS ARE PAIRED WITH THEIR ROWS HERE, because the
   * walk needs the channel and the result needs the listing, and
   * the domain must not be handed a document to pull a slug out
   * of. [D-06]
   */
  const programmes = want
    ? showings(
      held.flatMap((channel) => {
        const listing = listingFor(channel, lineup[channel.id]);
        return listing && all.some((one) => one.slug === listing.slug)
          ? [{ channel, listing }] : [];
      }), want, nowMs)
    : [];
  const kinds = want
    ? byGenre(all).filter(([kind]) => kind.toLowerCase().includes(want.toLowerCase()))
    : [];

  const live: Record<string, boolean> = {};
  const onNow: Record<string, string | null> = {};
  for (const channel of held) {
    const slug = channel.station?.slug;
    if (!slug) continue;
    const on = nowAndNext(channel, nowMs);
    live[slug] = on.live;
    onNow[slug] = on.title;
  }

  const counts: Record<Tab, number> = {
    channels: channels.length,
    programmes: programmes.length,
    categories: kinds.length,
  };
  const to = (which: Tab) => {
    const bag = new URLSearchParams();
    if (want) bag.set('q', want);
    if (which !== 'channels') bag.set('in', which);
    const query = bag.toString();
    return query ? `/tv/search?${query}` : '/tv/search';
  };

  return (
    <TvFrame here="/tv/search" bare>
      <div className="sr-head">
        <div className="sr-head-row">
          <h1 className="sr-title">
            <Icon name="search" size={24} />
            Search
          </h1>
          <p className="sr-lede">
            Find a channel, or find what is on, across every channel on the
            network.
          </p>

          <form method="get" action="/tv/search" className="sr-field"
                role="search">
            <span aria-hidden="true" className="sr-field-mark">
              <Icon name="search" size={17} />
            </span>
            <input name="q" defaultValue={want} data-testid="tv-search-input"
                   placeholder="A channel, a callsign, a programme"
                   aria-label="Search the network" />
            {/*
              * THE CLEAR IS A LINK AND NOT A BUTTON, so it works
              * on the same page that works without a bundle. It
              * keeps the tab, because clearing the words is not
              * the same as changing the question. [D-19]
              */}
            {want && (
              <Link href={tab === 'channels' ? '/tv/search' : `/tv/search?in=${tab}`}
                    className="sr-clear" aria-label="Clear the search"
                    data-testid="tv-search-clear">
                <Icon name="close" size={14} />
              </Link>
            )}
            {tab !== 'channels' && <input type="hidden" name="in" value={tab} />}
            <button type="submit" className="sr-go">Search</button>
          </form>

          <nav className="sr-tabs" aria-label="What to search">
            {(Object.keys(TABS) as Tab[]).map((which) => (
              <Link key={which} href={to(which)} className="sr-tab"
                    data-testid="tv-search-tab"
                    {...(which === tab ? { 'aria-current': 'page' as const } : {})}>
                {TABS[which]}
                {want && (
                  <span className="sr-tab-count">{counts[which]}</span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="sr-body">
        <div className="sr-list" data-testid="tv-search-results">
          {!want
            ? (
              <p className="sr-empty" data-testid="tv-search-idle">
                {all.length === 1
                  ? 'One channel on the network. Type to find it.'
                  : `${all.length} channels on the network. Type to find one.`}
              </p>
            )
            : counts[tab] === 0
              ? (
                <p className="sr-empty" data-testid="tv-no-hits">
                  Nothing in {TABS[tab].toLowerCase()} matches “{want}”.
                  {counts.channels + counts.programmes + counts.categories > 0
                    && ' Try one of the other two.'}
                </p>
              )
              : tab === 'channels'
                ? channels.map((one) => (
                  <Link key={one.slug} href={`/tv/channels/${one.slug}`}
                        className="sr-row" data-testid="tv-search-hit"
                        data-slug={one.slug}>
                    <span aria-hidden="true" className="sr-mark">
                      {one.logoAssetId
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img alt="" src={`/api/tv/channels/${one.slug}/logo`} />
                        : (one.callsign ?? one.name.slice(0, 2).toUpperCase())}
                    </span>
                    <span className="sr-said">
                      <span className="sr-name">{one.name}</span>
                      <span className="sr-under">
                        {[one.number !== undefined ? `CH ${one.number}` : null,
                          one.says || null,
                          /* WHAT IS ON, where the channel is saying
                             anything at all. A directory row that
                             could show it and does not is the
                             network's own answer withheld. [N-7] */
                          onNow[one.slug] || null]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {live[one.slug] && <span className="sr-tag">LIVE</span>}
                    <span aria-hidden="true" className="sr-go-mark">
                      <Icon name="chevron" size={15} />
                    </span>
                  </Link>
                ))
                : tab === 'programmes'
                  ? programmes.map((one) => (
                    <Link key={`${one.channel.slug}-${one.fromMs}`}
                          href={`/tv/channels/${one.channel.slug}`}
                          className="sr-row" data-testid="tv-search-hit"
                          data-slug={one.channel.slug}>
                      <span aria-hidden="true" className="sr-mark">
                        {one.channel.logoAssetId
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img alt=""
                                 src={`/api/tv/channels/${one.channel.slug}/logo`} />
                          : (one.channel.callsign
                              ?? one.channel.name.slice(0, 2).toUpperCase())}
                      </span>
                      <span className="sr-said">
                        <span className="sr-name">{one.title}</span>
                        <span className="sr-under">
                          {one.channel.name}
                          {one.channel.number !== undefined
                            && ` · CH ${one.channel.number}`}
                          {' · '}
                          {/* THE TIME IS WRITTEN BY THE BROWSER,
                              because the viewer's clock is the one
                              this grid is drawn against. [§2] */}
                          <Clock at={one.fromMs} />
                        </span>
                      </span>
                      {one.now
                        ? <span className="sr-tag">ON NOW</span>
                        : one.booked
                          ? <span className="sr-tag" data-booked="true">LIVE</span>
                          : null}
                      <span aria-hidden="true" className="sr-go-mark">
                        <Icon name="chevron" size={15} />
                      </span>
                    </Link>
                  ))
                  : kinds.map(([kind, under]) => (
                    <Link key={kind} href={`/tv/channels?genre=${kind}`}
                          className="sr-row" data-testid="tv-search-hit">
                      <span aria-hidden="true" className="sr-mark">
                        <Icon name={markFor(kind)} size={19} />
                      </span>
                      <span className="sr-said">
                        <span className="sr-name">{asWord(kind)}</span>
                        <span className="sr-under">
                          {under.length === 1
                            ? '1 channel' : `${under.length} channels`}
                          {' · '}
                          {under.slice(0, 3).map((one) => one.name).join(', ')}
                        </span>
                      </span>
                      <span aria-hidden="true" className="sr-go-mark">
                        <Icon name="chevron" size={15} />
                      </span>
                    </Link>
                  ))}
        </div>

        <aside className="sr-poster">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={NETWORK_ART.search}
               style={{ objectPosition: NETWORK_ART.searchFocus }} />
          <span aria-hidden="true" className="sr-poster-wash" />
          <div className="sr-poster-said">
            {/*
              * COUNTED, NOT CLAIMED. The design carries a slogan
              * over this picture; what goes here instead is the
              * one thing about the network that is true and
              * checkable, which is how much of it there is.
              * [D-21]
              */}
            <p className="sr-poster-lead">
              {all.length === 1 ? 'One channel, ' : `${all.length} channels, `}
              one network.
            </p>
            <p className="sr-poster-under">
              Independent stations from anywhere, each running its own
              schedule. Search finds the channel, the programme or the shelf.
            </p>
          </div>
        </aside>
      </div>
    </TvFrame>
  );
}
