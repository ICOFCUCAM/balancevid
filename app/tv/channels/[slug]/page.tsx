import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { bySlug, listingFor } from '../../../../src/domain/channelListing.js';
import { nowAndNext } from '../../../../src/domain/onAir.js';
import { listChannels } from '../../../../src/store/channels.js';
import { TvFrame } from '../../Tv.js';
import Station from './Station.js';

export const dynamic = 'force-dynamic';

async function found(slug: string) {
  const channel = bySlug(await listChannels().catch(() => []), slug);
  if (!channel) return null;
  const listing = listingFor(channel);
  return listing ? { channel, listing } : null;
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
  const { channel, listing } = it;
  return (
    <TvFrame here="/tv/channels">
      <Station
        channelId={channel.id}
        listing={listing}
        first={nowAndNext(channel, Date.now())}
      />
    </TvFrame>
  );
}
