import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { byDomain, listingFor } from '../../../src/domain/channelListing.js';
import type { Assignments } from '../../../src/domain/registry.js';
import { nowAndNext } from '../../../src/domain/onAir.js';
import { lineupFor } from '../../../src/store/lineup.js';
import { listChannels } from '../../../src/store/channels.js';
import { TvFrame } from '../Tv.js';
import { canonicalFor } from '../../../src/web/hosting.js';
import Station from '../channels/[slug]/Station.js';

export const dynamic = 'force-dynamic';

/**
 * The station that answers on this host.  [TV-NETWORK N-8]
 *
 * NOBODY LINKS HERE. The middleware rewrites `/` to this path
 * when a request arrives on a host that is not the installation's
 * own, and the host it arrived on is the whole of the question.
 * Reached directly on `balancevid.com/tv/station` it finds
 * nothing and says so, which is correct: no station answers on
 * the network's own name.
 *
 * THE LOOKUP IS HERE AND NOT IN THE MIDDLEWARE because
 * *"middleware has no business reading storage"*, which that file
 * has said since it was written. The gate decides the host is
 * foreign; this decides which station that is.
 */
async function answering() {
  const host = (await headers()).get('x-forwarded-host')
    ?? (await headers()).get('host');
  const channels = await listChannels().catch(() => []);
  const channel = byDomain(channels, host);
  if (!channel) return null;
  const lineup: Assignments = await lineupFor(channels.map((one) => one.id))
    .catch(() => ({}));
  const listing = listingFor(channel, lineup[channel.id]);
  return listing ? { channel, listing } : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const it = await answering();
  if (!it) return { title: 'No channel at this address — BalanceVid TV' };
  const { listing } = it;
  const head = await headers();
  const canonical = canonicalFor(
    `/tv/channels/${listing.slug}`,
    process.env['BALANCEVID_HOST'], head.get('x-forwarded-proto'));
  return {
    title: `${listing.name} — BalanceVid TV`,
    description: listing.description
      ?? [listing.says, 'Live on the BalanceVid network.']
        .filter(Boolean).join(' · '),
    /*
     * THE CANONICAL ADDRESS IS THE SLUG'S, NOT THIS ONE, which is
     * the brief stated as a tag: *"BalanceVid provides the
     * canonical public channel identity."* Without it this page
     * and `/tv/channels/<slug>` are the same station at two
     * addresses, and a search engine either picks one at random
     * or splits the station's standing between them.
     *
     * ABSOLUTE, AND THAT IS NOT A STYLE CHOICE. This was written
     * relative first. Next resolves a relative canonical against
     * `metadataBase`, which this product does not set, so what
     * would have gone out on a live station page was
     * `http://localhost:3000/tv/channels/…` — a canonical tag
     * pointing at a machine nobody can reach, which is worse than
     * none. Built from the same function the 308 uses, because
     * the redirect and the tag make the same claim and two
     * builders eventually disagree.
     */
    ...(canonical ? { alternates: { canonical } } : {}),
  };
}

export default async function StationByDomain() {
  const it = await answering();
  if (!it) notFound();
  const { channel, listing } = it;
  return (
    /*
     * THE SAME PAGE, NOT A SECOND ONE. `Station` is what
     * `/tv/channels/<slug>` renders, so a custom domain shows the
     * station it already has rather than a cut-down copy that
     * drifts. The frame's nav still points at `/tv`, which is
     * right: the directory is the discovery layer and this is one
     * station's door into it. [D-19]
     */
    <TvFrame here="/tv/channels">
      <Station
        channelId={channel.id}
        listing={listing}
        first={nowAndNext(channel, Date.now())}
      />
    </TvFrame>
  );
}
