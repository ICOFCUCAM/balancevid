/**
 * Which channels a stranger may be shown.  [Doctrine CHANNEL §2,
 * D-03, D-04, U-31, TV-NETWORK N-3]
 *
 * > *"how would the many channels that shall be owned by BalanceVid
 * > users be differentiated and captured?"*
 *
 * A CHANNEL HAS BEEN WATCHABLE BY A STRANGER FOR A LONG TIME.
 * `/t/<id>/watch`, the playlist, the segments and `/now` are all
 * public, and `policy.ts` states the line: *"A viewer gets the
 * transmission, which is a stream of four-second segments and two
 * sentences about what is in them."* What has never existed is any
 * way to FIND one. The door opens; nothing points at it.
 *
 * AND THE FIELD THAT DECIDES HAS BEEN THERE THE WHOLE TIME.
 * `ChannelPublication.listed` is documented as *"whether the
 * programme appears in a browse surface"* and has had no reader,
 * because there was no browse surface. This is its first.
 *
 * TWO AXES, NOT ONE, and `availability.ts` already had this
 * argument and settled it: *"`listed: false` was being asked to
 * mean PRIVATE"*. Being findable and being watchable are different
 * questions, and a channel may answer them differently —
 *
 *   PUBLIC     published, listed      in the directory
 *   UNLISTED   published, not listed  watchable by link, not listed
 *   PRIVATE    access is narrowed     not for strangers at all
 *   OFFLINE    unpublished            exists, is not transmitting
 *
 * — which is exactly the brief's §10, over a model that was already
 * built for it.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Channel } from './channel.js';
import { isPublished } from './channel.js';
import { type Station, stationSays } from './station.js';

/** What a channel is, to a stranger looking for something to watch. */
export type Standing = 'public' | 'unlisted' | 'private' | 'offline';

/**
 * DEFAULT LISTED, and that default is the one already in the
 * document. `channelEdit` writes `listed: false` and omits the
 * field when it is true, so an absent `listed` means listed —
 * reading it as "not listed" would hide every channel published
 * before this file existed.
 */
export function standingOf(channel: Channel): Standing {
  if (!isPublished(channel)) return 'offline';
  const publication = channel.publication;
  if (publication?.access && publication.access !== 'anyone') return 'private';
  return publication?.listed === false ? 'unlisted' : 'public';
}

/** May a stranger be shown this channel in a list they did not ask for? */
export function inDirectory(channel: Channel): boolean {
  return standingOf(channel) === 'public';
}

/**
 * One row of the directory.
 *
 * WHAT IS **NOT** HERE IS THE POINT, and it is the same line
 * `policy.ts` draws for the transmission: no schedule, no
 * destinations, no ingests, no library, no references, no owner.
 * A directory row is a poster outside a cinema. [D-03]
 */
export interface Listing {
  /** The address, which is how a viewer reaches it. */
  slug: string;
  name: string;
  callsign?: string;
  /** `Faith · English · CM`, or nothing. */
  says: string;
  description?: string;
  genre?: string;
  language?: string;
  country?: string;
  logoAssetId?: string;
}

/**
 * A channel as a row, or nothing if it has no address.
 *
 * A CHANNEL WITHOUT A SLUG CANNOT BE LISTED, because the row's
 * whole purpose is to be a link and there is nowhere to link to.
 * Returned as nothing rather than listed with its id: a directory
 * entry pointing at `/t/chan_c3bf…` is the machine-chosen address
 * this stage exists to replace.
 */
export function listingFor(channel: Channel): Listing | null {
  const station: Station | undefined = channel.station;
  if (!station?.slug) return null;
  return {
    slug: station.slug,
    name: channel.name,
    says: stationSays(station),
    ...(station.callsign ? { callsign: station.callsign } : {}),
    ...(station.description ? { description: station.description } : {}),
    ...(station.genre ? { genre: station.genre } : {}),
    ...(station.language ? { language: station.language } : {}),
    ...(station.country ? { country: station.country } : {}),
    ...(station.logoAssetId ? { logoAssetId: station.logoAssetId } : {}),
  };
}

/**
 * The directory, from everything this installation holds.
 *
 * SORTED BY NAME, because there are no channel numbers yet and
 * sorting by "most recently published" would make the front page a
 * thing that moves under a returning viewer. Alphabetical is the
 * ordering a viewer can predict, which is what a directory is for
 * until a lineup exists to impose an order of its own. [D-04]
 */
export function directory(channels: Iterable<Channel>): Listing[] {
  const out: Listing[] = [];
  for (const channel of channels) {
    if (!inDirectory(channel)) continue;
    const row = listingFor(channel);
    if (row) out.push(row);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The channel answering to an address, among those a stranger may see. */
export function bySlug(
  channels: Iterable<Channel>, slug: string,
): Channel | undefined {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return undefined;
  for (const channel of channels) {
    if (channel.station?.slug !== wanted) continue;
    /*
     * UNLISTED IS REACHABLE BY ADDRESS, which is the whole of what
     * unlisted means — *"works through direct link/domain but
     * doesn't appear in the directory"*. Offline and private are
     * not, and they answer the same way as a slug nobody holds,
     * because *"a 403 would confirm that something is there to
     * guess at."* [D-03]
     */
    const standing = standingOf(channel);
    return standing === 'public' || standing === 'unlisted' ? channel : undefined;
  }
  return undefined;
}
