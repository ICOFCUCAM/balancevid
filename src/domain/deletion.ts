/**
 * Throwing something away.  [Doctrine §19, CHANNEL §3, INV-17, U-25, D-13]
 *
 * A library you cannot delete from is a library that fills up, and the thing
 * that fills it is failed experiments — which is most of what a studio
 * produces. So every record in every studio can be thrown away.
 *
 * THE ONE THING THAT MAKES IT DANGEROUS is that a channel schedules by
 * REFERENCE (D-18). Nothing is copied, which is the whole design and also
 * means the bytes a broadcast depends on live somewhere else entirely:
 * deleting a performance can take a programme off the air at nine o'clock
 * tonight, and nothing about the performance's own page would hint at it.
 *
 * So deletion ASKS FIRST. This module answers "what would this break", and
 * it answers with the names of channels and programmes rather than a
 * boolean, because "cannot delete: in use" is the message that makes people
 * go looking through every channel by hand.
 *
 * IT REFUSES RATHER THAN CASCADES. Deleting a performance does not quietly
 * unschedule it: a channel is somebody's evening of television and editing
 * it is a decision, not a side effect of tidying up. The caller unschedules
 * and then deletes, in that order, having been told exactly where to go.
 */

import type { Channel, ProgrammeSource } from './channel.js';
import { orderedBlocks, referencedAssets } from './channel.js';

/** Where a reference to this thing was found, in words somebody can act on. */
export interface Booking {
  channelId: string;
  channelName: string;
  /** The titles of the slots holding it, so the message can name them. */
  slots: string[];
}

/** What this record is, for a message that says the right noun. */
export type RecordKind = 'conversation' | 'performance' | 'media';

/**
 * Does this source point at the record being deleted?
 *
 * A render names the document it came out of, so deleting the document takes
 * every render with it — which is why the match is on `documentId` and not
 * on a plan hash. A library asset names itself.
 */
function pointsAt(
  source: ProgrammeSource, kind: RecordKind, id: string,
): boolean {
  if (kind === 'media') return source.kind === 'media' && source.assetId === id;
  if (source.kind !== 'render') return false;
  return source.document === (kind === 'performance' ? 'performance' : 'conversation')
    && source.documentId === id;
}

/**
 * Every channel that would lose something, and what it would lose.
 *
 * Looks in all four places a channel can hold a reference — the fixed slots,
 * the loop, each day-part's own loop, and the two fallbacks — because a
 * check that missed one would be a check that let somebody delete the thing
 * a channel falls back to when everything else fails. [§4, §5, §9]
 */
export function bookingsFor(
  channels: readonly Channel[], kind: RecordKind, id: string,
): Booking[] {
  const out: Booking[] = [];
  for (const channel of channels) {
    const slots: string[] = [];
    for (const programme of channel.programmes) {
      if (pointsAt(programme.source, kind, id)) {
        slots.push(programme.title ?? 'a scheduled programme');
      }
    }
    for (const entry of channel.rotation) {
      if (pointsAt(entry.source, kind, id)) {
        slots.push(entry.title ?? 'an item in the loop');
      }
    }
    for (const block of orderedBlocks(channel)) {
      for (const entry of block.rotation) {
        if (pointsAt(entry.source, kind, id)) {
          slots.push(entry.title ?? `an item in ${block.name}`);
        }
      }
    }
    if (channel.filler && pointsAt(channel.filler, kind, id)) {
      slots.push('the filler');
    }
    if (channel.backup && pointsAt(channel.backup, kind, id)) {
      slots.push('the safe playlist');
    }
    if (channel.emergency && pointsAt(channel.emergency.source, kind, id)) {
      slots.push('the emergency cut');
    }
    if (slots.length > 0) {
      out.push({ channelId: channel.id, channelName: channel.name, slots });
    }
  }
  return out;
}

/**
 * Why this cannot be deleted yet, in one sentence, or null if it can.
 *
 * Written here rather than at the route so the message is the same wherever
 * deletion is offered, and so the wording is a thing a test can hold to.
 */
export function refusalFor(bookings: readonly Booking[]): string | null {
  if (bookings.length === 0) return null;
  const where = bookings
    .map((booking) => `${booking.channelName} (${booking.slots.join(', ')})`)
    .join('; ');
  return `it is on the air: ${where}. Take it off the schedule first — `
    + 'unscheduling changes no files, and the video stays where it is.';
}

/**
 * A channel deletes differently: nothing else references a channel.
 *
 * What it can hold is the other direction — saved live sessions and
 * recordings somebody asked for, which are the only media a channel owns
 * (INV-17). Deleting the channel deletes those with it, and that is a fact
 * to state rather than a reason to refuse: they were made by this channel
 * and there is nowhere else they belong.
 */
export function channelOwns(channel: Channel): number {
  return referencedAssets(channel).filter(
    (source) => source.kind === 'live').length
    + (channel.recordings?.length ?? 0)
    + channel.ingests.filter((ingest) => ingest.keep).length;
}
