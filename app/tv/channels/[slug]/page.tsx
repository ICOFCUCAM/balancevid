import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { bySlug, listingFor, tuning } from '../../../../src/domain/channelListing.js';
import type { Assignments } from '../../../../src/domain/registry.js';
import { nowAndNext } from '../../../../src/domain/onAir.js';
import { lineupFor } from '../../../../src/store/lineup.js';
import { listChannels } from '../../../../src/store/channels.js';
import { programmeStart } from '../../../../src/domain/channel.js';
import { TvFrame } from '../../Tv.js';
import Station, { type Slot } from './Station.js';

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
  const at = Date.now();

  /*
   * WHAT THIS STATION IS SHOWING TODAY.  [N-4, §2]
   *
   * THE DAY IS THE CHANNEL'S OWN, not the server's and not the
   * reader's: *"breakfast is breakfast where the channel is."*
   * `channel.timezone` is on the document for exactly this, and a
   * schedule sliced on the container's clock would put a Lagos
   * station's midnight programme on the wrong day for everybody.
   * [channel.ts `timezone`]
   *
   * FIXED PROGRAMMES ONLY. A rotation has no times to print — it
   * is a loop whose position is computed from the wall clock — so
   * a channel that runs one has no Today list, and the panel is
   * absent rather than empty. [§4]
   */
  const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', {
    timeZone: channel.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
  const today = dayOf(at);
  const slots: Slot[] = channel.programmes
    /*
     * AN UNTITLED PROGRAMME IS NOT A ROW. A time with nothing
     * beside it tells a reader less than no row at all, and a
     * placeholder invented here would be this page naming
     * somebody else's programme. [U-19]
     */
    .filter((one) => Boolean(one.title?.trim()))
    .map((one) => ({ at: programmeStart(one), title: one.title!.trim() }))
    .filter((one) => Number.isFinite(one.at) && dayOf(one.at) === today)
    .sort((a, b) => a.at - b.at);

  return (
    <TvFrame here="/tv/channels" bare>
      <Station
        channelId={channel.id}
        listing={listing}
        first={nowAndNext(channel, at)}
        tune={tune}
        today={slots}
      />
    </TvFrame>
  );
}
