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
import { type Station, hostOf, stationSays } from './station.js';
import {
  type Assignments, lineupOf, tuneFrom, usableNumber,
} from './registry.js';

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
  /**
   * THE TUNING NUMBER, where the network has allocated one.
   * [N-6]
   *
   * Optional, and that is not laziness: a channel published
   * before the lineup existed, or one on an installation whose
   * numbers file cannot be read, has no number and must still
   * appear in the directory. A row that vanished for want of a
   * number would make an unreadable file into a blank
   * television network. [D-21]
   */
  number?: number;
  callsign?: string;
  /** `Faith · English · CM`, or nothing. */
  says: string;
  description?: string;
  genre?: string;
  language?: string;
  country?: string;
  logoAssetId?: string;
  /** The photograph behind the station's name. [N-4] */
  bannerAssetId?: string;
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
export function listingFor(
  channel: Channel, number?: number,
): Listing | null {
  const station: Station | undefined = channel.station;
  if (!station?.slug) return null;
  return {
    slug: station.slug,
    name: channel.name,
    ...(usableNumber(number) ? { number } : {}),
    says: stationSays(station),
    ...(station.callsign ? { callsign: station.callsign } : {}),
    ...(station.description ? { description: station.description } : {}),
    ...(station.genre ? { genre: station.genre } : {}),
    ...(station.language ? { language: station.language } : {}),
    ...(station.country ? { country: station.country } : {}),
    ...(station.logoAssetId ? { logoAssetId: station.logoAssetId } : {}),
    ...(station.bannerAssetId ? { bannerAssetId: station.bannerAssetId } : {}),
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
export function directory(
  channels: Iterable<Channel>, assigned: Assignments = {},
): Listing[] {
  const out: Listing[] = [];
  for (const channel of channels) {
    if (!inDirectory(channel)) continue;
    const row = listingFor(channel, assigned[channel.id]);
    if (row) out.push(row);
  }
  /*
   * STILL BY NAME, AND DELIBERATELY SO NOW THAT NUMBERS EXIST. A
   * directory is browsed — somebody is reading names — and a
   * LINEUP is tuned, which is `lineupOf` in the registry and is
   * ordered by number. Two orderings because they answer two
   * questions, and making the directory numeric would turn
   * browsing into looking up. [D-04]
   */
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

/**
 * The channel that answers on a host.  [§10, TV-NETWORK N-8]
 *
 * > *"The channel owner can eventually have a custom domain, but
 * > BalanceVid provides the canonical public channel identity."*
 *
 * THE SAME GATE AS `bySlug`, AND DELIBERATELY SO. A custom domain
 * is a second front door to one station, not a second set of
 * rules about who may come in — so private and offline answer the
 * way a host nobody holds answers, and an UNLISTED STATION
 * ANSWERS, because the brief says in as many words what unlisted
 * means:
 *
 * > *"works through direct link/domain but doesn't appear in the
 * > directory."*
 *
 * A domain is that direct link with the station's own name on it.
 *
 * THE HOST IS NORMALISED BY `hostOf`, not here, because the
 * middleware compares the same string against the installation's
 * own name and the two must agree about ports and case. A custom
 * domain that routes and then finds nothing is worse than one
 * that never routed.
 */
export function byDomain(
  channels: Iterable<Channel>, host: string | null | undefined,
): Channel | undefined {
  const wanted = hostOf(host);
  if (!wanted) return undefined;
  for (const channel of channels) {
    /* Stored lower case by `setStation`, and lowered again here
       because a document on disk is not a type. [N-3] */
    if (channel.station?.domain?.toLowerCase() !== wanted) continue;
    const standing = standingOf(channel);
    return standing === 'public' || standing === 'unlisted' ? channel : undefined;
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 *  The remote control.  [TV-NETWORK N-9]
 * ------------------------------------------------------------------ */

/** Where CH+ and CH− go from here. */
export interface Tuning {
  up: Listing | null;
  down: Listing | null;
}

/**
 * The channel one press away in each direction.
 *
 * > *"A remote control could eventually have: CH + / CH −"*
 *
 * `tuneFrom` HAS BEEN BUILT AND TESTED SINCE N-6 AND NOTHING DREW
 * IT. It wraps both ends and lands on the nearest channel in the
 * direction asked when the one you were on has gone, and all of
 * that was arithmetic nobody could reach — the finding this whole
 * network stage keeps making, recorded in the document under *not
 * built* and now closed.
 *
 * NUMBERS ARE THE RING AND LISTINGS ARE THE ANSWER. The registry
 * knows about numbers and must not learn about stations; the page
 * needs a slug to link to and a name to show. This is the one
 * place that holds both, which is why it is here and not there.
 *
 * NOTHING EITHER WAY FOR A LINEUP OF ONE, because there is
 * nowhere to go, and a CH+ button that reloads the same channel is
 * a button that looks broken.
 *
 * TUNING FROM OUTSIDE THE LINEUP WORKS, and that is not an edge
 * case: an unlisted station is reached by its slug or its own
 * domain and is not in the directory, so `from` is a number the
 * ring does not contain. `tuneFrom` lands on the nearest in the
 * direction asked, which is what a set does when you tune away
 * from a channel that is not on the dial. [N-8]
 */
export function tuning(
  channels: Iterable<Channel>, assigned: Assignments, from: number,
): Tuning {
  const lineup = lineupOf([...channels].filter(inDirectory), assigned);
  const numbers = lineup.map((row) => row.number);
  const at = (number: number | null) => {
    if (number === null) return null;
    const found = lineup.find((row) => row.number === number);
    return found ? listingFor(found.channel, found.number) : null;
  };
  return {
    up: at(tuneFrom(numbers, from, 1)),
    down: at(tuneFrom(numbers, from, -1)),
  };
}
