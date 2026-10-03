import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { bySlug, listingFor, tuning } from '../../../../src/domain/channelListing.js';
import type { Assignments } from '../../../../src/domain/registry.js';
import { nowAndNext } from '../../../../src/domain/onAir.js';
import { lineupFor } from '../../../../src/store/lineup.js';
import { listChannels } from '../../../../src/store/channels.js';
import { TvFrame } from '../../Tv.js';
import Station from './Station.js';

export const dynamic = 'force-dynamic';

/**
 * The channel at this address, with its number.
 *
 * THE NUMBER WAS MISSED HERE AND NOT IN THE API, which is the
 * cost of resolving the same channel twice. The route and the
 * page each find it, each build a listing, and only one of them
 * was taught about the lineup — so the API answered `100` while
 * the page it serves drew nothing. Found by looking at the page
 * after reading the right answer out of the endpoint.
 *
 * Kept as two resolvers rather than one for now, because the page
 * must render on the server without a round trip to itself; the
 * duplication is the shape of that, and this comment is the
 * marker for the day a third caller appears. [D-19]
 */
async function found(slug: string) {
  const channels = await listChannels().catch(() => []);
  const channel = bySlug(channels, slug);
  if (!channel) return null;
  const lineup: Assignments = await lineupFor(channels.map((one) => one.id))
    .catch(() => ({}));
  const listing = listingFor(channel, lineup[channel.id]);
  if (!listing) return null;
  /*
   * AND WHERE CH+ AND CH− GO FROM HERE. Computed on the server
   * with the channel, because the ring is the whole directory and
   * the page would otherwise fetch it to find two slugs. [N-9]
   */
  return { channel, listing, tune: tuning(channels, lineup, lineup[channel.id] ?? 0) };
}

/**
 * WHAT A SHARED LINK SAYS ABOUT ITSELF.  [TV-NETWORK N-4]
 *
 * This is the half of discovery that happens off BalanceVid
 * entirely. A channel pasted into a message, a post or a search
 * result is represented by these two strings, and until now every
 * link on the product carried the site-wide description — *"A
 * conversation editor for recorded media"* — which is a sentence
 * about Studio One under a link to a television station.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const it = await found(slug);
  if (!it) return { title: 'Channel not found — BalanceVid TV' };
  const { listing } = it;
  return {
    title: `${listing.name} — BalanceVid TV`,
    description: listing.description
      ?? [listing.says, 'Live on the BalanceVid network.']
        .filter(Boolean).join(' · '),
  };
}

/**
 * The station page.  [TV-NETWORK N-4]
 *
 * > *"The channel owner can eventually have a custom domain, but
 * > BalanceVid provides the canonical public channel identity."*
 *
 * THE PLAYER IS THE ONE THAT ALREADY WORKS. `ChannelPlayer` has
 * been serving `/t/<id>/watch` publicly for a long time and takes
 * a channel id; this page has one. A second player would be a
 * second set of bugs about HLS on Safari. [D-19]
 *
 * NOW AND NEXT ARE RENDERED ON THE SERVER AND THEN FOLLOWED. The
 * first paint carries what is on, so a crawler and a slow phone
 * both get it; the client refreshes it afterwards, because a
 * channel changes programme while somebody is looking at the page.
 */
export default async function StationPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const it = await found(slug);
  if (!it) notFound();
  const { channel, listing, tune } = it;
  return (
    <TvFrame here="/tv/channels">
      <Station
        channelId={channel.id}
        listing={listing}
        first={nowAndNext(channel, Date.now())}
        tune={tune}
      />
    </TvFrame>
  );
}
