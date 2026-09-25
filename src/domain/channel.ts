/**
 * The Channel: a third root document, and the one that owns nothing.
 * [Doctrine CHANNEL §1–§8, D-18, INV-00, INV-17]
 *
 * "Online TV must never duplicate media merely because it is scheduled for
 *  broadcast. A scheduled programme references an existing media asset. Only
 *  live ingest and explicitly requested recordings create new media assets.
 *  The playout engine continuously reads scheduled assets and produces the
 *  broadcast stream."
 *
 * That paragraph is the whole architecture and it is enforced by the types
 * below rather than by care. A `Programme` has no field that could hold
 * media: it has a `source`, and every kind of source is a REFERENCE — a
 * document and the hash of a render that document already produced, or the id
 * of a live ingest that is arriving on its own. There is nowhere for a
 * scheduled copy to be put, so no amount of future carelessness can put one
 * there.
 *
 * WHY THAT MATTERS MORE HERE THAN ANYWHERE ELSE. A conversation is rendered
 * once and watched; a channel schedules the same forty-minute programme into
 * a breakfast slot, a lunchtime repeat and an overnight loop. A system that
 * copied on schedule would hold three copies of one video by Tuesday and
 * thirty by the end of the month, and the first symptom would be a disk
 * filling rather than a wrong picture — which is the kind of fault that gets
 * discovered late and fixed expensively.
 *
 * A CHANNEL IS A THIRD ROOT DOCUMENT, not a conversation with a flag and not
 * a performance with dates. Its clock is neither a source's timecode nor a
 * song's samples: it is the WALL CLOCK, which is the one clock in this
 * product that keeps running when nobody is looking at it. [§2]
 */

import type { Id } from './ids.js';
import type { Publication } from './document.js';

export type ChannelId = Id<'chan'>;
export type ProgrammeId = Id<'prog'>;
export type IngestId = Id<'ing'>;

export const CHANNEL_SCHEMA_VERSION = 1;

/**
 * Which studio made the thing being broadcast.
 *
 * Named rather than inferred from the id's prefix: a reference that can only
 * be resolved by parsing an identifier is a reference that breaks the day an
 * identifier scheme changes.
 */
export type ProgrammeDocument = 'conversation' | 'performance';

/**
 * WHAT IS ON AIR, AS A REFERENCE.  [§3, INV-17, D-18]
 *
 * Every member of this union names something that exists elsewhere. None of
 * them carries bytes, a path, or a place bytes could be written. That is the
 * rule expressed as a type.
 */
export type ProgrammeSource =
  /**
   * A render some studio already made, addressed the way that studio
   * addresses it: the document it belongs to and the hash of the plan that
   * produced it. Two shapes of one programme are two hashes, which is exactly
   * what a scheduler wants — a channel broadcasting 16:9 does not want the
   * vertical cut.
   */
  | {
    kind: 'render';
    document: ProgrammeDocument;
    documentId: string;
    planHash: string;
  }
  /**
   * Something arriving now, from a camera or an encoder.  [§5]
   *
   * The ONE kind of programme that is allowed to bring media with it, because
   * it is the one kind that did not exist until it was broadcast. Even here
   * the programme does not hold the media: it names the ingest, and the
   * ingest is what the asset belongs to.
   */
  | { kind: 'live'; ingestId: IngestId };

export interface Programme {
  id: ProgrammeId;
  /**
   * When it goes out, as an instant.  [§2]
   *
   * Stored as an ISO 8601 string WITH an offset, and compared as an instant.
   * A schedule written in local time and stored without a zone is a schedule
   * that moves an hour twice a year, and the failure is silent: the picture
   * is right, the clock is right, and the programme is in the wrong place.
   */
  startsAt: string;
  /**
   * How long the slot is, in milliseconds.
   *
   * Milliseconds rather than samples or frames because a schedule is not a
   * cut: nothing here has to be frame-exact against anything else, and a
   * broadcast day expressed in 48 kHz samples is a number nobody reading a
   * schedule can check. The MEDIA keeps its own precision; the slot does not
   * need it. [§2, U-08]
   */
  durationMs: number;
  source: ProgrammeSource;
  /**
   * What the listing calls it.
   *
   * Absent means "ask the thing being referenced", which is the honest
   * default: a programme that copied its source's title at scheduling time
   * would go on calling it by a name the author has since changed.
   */
  title?: string;
  /** Which part of the referenced media, on the media's own clock. */
  fromMs?: number;
  toMs?: number;
  /**
   * Play it again until the slot is over.  [§4]
   *
   * For the overnight loop and for a short film in a long slot. Without it a
   * ten-minute programme in a thirty-minute slot is twenty minutes of black,
   * and black is the one thing a channel must never broadcast by accident.
   */
  loop?: boolean;
  createdAt: string;
}

/**
 * Something arriving live.  [§5]
 *
 * THE ONLY THING IN THIS DOCUMENT THAT MAKES MEDIA, along with a recording
 * somebody asked for. It is a first-class entry rather than a property of a
 * programme because it outlives the programme: an ingest that ran for three
 * hours and was scheduled into two of them is one asset and two slots.
 */
export interface LiveIngest {
  id: IngestId;
  label: string;
  /** The asset the arriving media is being written to. */
  assetId: string;
  openedAt: string;
  /** Absent while it is still arriving. */
  closedAt?: string;
  /** Measured when it closes, never assumed. [U-02] */
  durationMs?: number;
}

/**
 * A recording of the channel's own output.  [§6]
 *
 * The second and last thing that makes media, and it only happens because
 * somebody asked: "explicitly requested recordings". A channel that recorded
 * itself by default would turn every hour of playout into an hour of disk,
 * which is the duplication rule broken from the other end.
 */
export interface BroadcastRecording {
  id: Id<'rec'>;
  label: string;
  assetId: string;
  /** The stretch of the broadcast day that was asked for. */
  fromAt: string;
  toAt: string;
  requestedBy: string;
  requestedAt: string;
  /** Absent until the worker has written it. */
  durationMs?: number;
}

export interface Channel {
  schemaVersion: number;
  id: ChannelId;
  name: string;
  /**
   * The zone the schedule is read in.  [§2]
   *
   * A channel is a place as much as a stream: breakfast is breakfast where
   * the channel is, not where the server is. Instants are stored with
   * offsets and this is what a listing is drawn in.
   */
  timezone: string;
  /**
   * PARALLEL, not ordered. The order is derived from `startsAt`, exactly as a
   * performance's scene order is derived from its sample. An order that is
   * stored is an order that can be wrong. [U-08]
   */
  programmes: Programme[];
  ingests: LiveIngest[];
  recordings: BroadcastRecording[];
  /**
   * What goes out when nothing is scheduled.  [§4]
   *
   * A reference like any other. Absent means the channel is off air between
   * programmes, which is a legitimate choice and is stated rather than
   * discovered.
   */
  filler?: ProgrammeSource;
  publication?: Publication;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------------ *
 *  Derivations. Nothing below is stored.
 * ------------------------------------------------------------------------ */

/** When a programme is over, as an instant in milliseconds. */
export function programmeEnd(programme: Programme): number {
  return Date.parse(programme.startsAt) + programme.durationMs;
}

export function programmeStart(programme: Programme): number {
  return Date.parse(programme.startsAt);
}

/**
 * The schedule in the order it goes out.
 *
 * Derived on every read, for the reason every order in this codebase is
 * derived: two numbers that must agree eventually do not. Ties break on id so
 * the result is stable — two programmes at the same instant is a fault the
 * editor refuses, not something this has to invent an answer for.
 */
export function orderedProgrammes(channel: Channel): Programme[] {
  return [...channel.programmes].sort((a, b) => {
    const difference = programmeStart(a) - programmeStart(b);
    return difference !== 0 ? difference : a.id.localeCompare(b.id);
  });
}

/** What is on air at this instant, or nothing. */
export function onAirAt(channel: Channel, at: number): Programme | undefined {
  return orderedProgrammes(channel).find(
    (programme) => at >= programmeStart(programme) && at < programmeEnd(programme),
  );
}

/** What is on next after this instant, or nothing. */
export function nextAfter(channel: Channel, at: number): Programme | undefined {
  return orderedProgrammes(channel).find((programme) => programmeStart(programme) > at);
}

/**
 * Where two programmes are trying to be on air at once.  [§2]
 *
 * A schedule is the one document in this product where overlap is not a
 * matter of taste: two pictures cannot go down one wire. Reported as pairs
 * rather than thrown, because an editor dragging a programme wants to see the
 * clash while it is happening rather than be refused after it.
 */
export function overlaps(channel: Channel): { a: Programme; b: Programme }[] {
  const ordered = orderedProgrammes(channel);
  const found: { a: Programme; b: Programme }[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (programmeStart(current) < programmeEnd(previous)) {
      found.push({ a: previous, b: current });
    }
  }
  return found;
}

/**
 * The holes in a stretch of the schedule.  [§4]
 *
 * What the filler is for, and what an editor has to be shown: dead air is
 * the one thing a channel cannot broadcast by accident, and a schedule with
 * a gap in it looks exactly like a schedule without one until the moment it
 * goes out.
 */
export function gaps(
  channel: Channel, fromAt: number, toAt: number,
): { fromAt: number; toAt: number }[] {
  const found: { fromAt: number; toAt: number }[] = [];
  let cursor = fromAt;
  for (const programme of orderedProgrammes(channel)) {
    const start = programmeStart(programme);
    const end = programmeEnd(programme);
    if (end <= fromAt || start >= toAt) continue;
    if (start > cursor) found.push({ fromAt: cursor, toAt: Math.min(start, toAt) });
    cursor = Math.max(cursor, end);
    if (cursor >= toAt) break;
  }
  if (cursor < toAt) found.push({ fromAt: cursor, toAt });
  return found;
}

/**
 * Every asset this channel's schedule points at, once each.
 *
 * THE FUNCTION THAT MAKES THE RULE CHECKABLE.  [INV-17, D-18]
 *
 * "Never duplicate media merely because it is scheduled" is a claim about
 * what is on disk, and a claim about disk needs something that can be
 * counted. This returns the DISTINCT references a schedule makes — so a
 * programme broadcast at breakfast, at lunchtime and overnight appears once,
 * and the test that says so is a test of the architecture rather than of a
 * screen.
 */
export function referencedAssets(channel: Channel): ProgrammeSource[] {
  const seen = new Map<string, ProgrammeSource>();
  const add = (source: ProgrammeSource | undefined) => {
    if (!source) return;
    seen.set(sourceKey(source), source);
  };
  for (const programme of channel.programmes) add(programme.source);
  add(channel.filler);
  return [...seen.values()];
}

/** A reference's identity, for counting and comparing. */
export function sourceKey(source: ProgrammeSource): string {
  return source.kind === 'live'
    ? `live:${source.ingestId}`
    : `render:${source.document}:${source.documentId}:${source.planHash}`;
}

/**
 * How long this programme's media actually runs for, if it is known.
 *
 * Trimming narrows it; looping makes the slot's length the answer instead.
 * Returns undefined when the media's own length is not known here — a channel
 * does not decode, and a number it guessed would be a number somebody
 * scheduled against.
 */
export function mediaLengthMs(
  programme: Programme, assetLengthMs?: number,
): number | undefined {
  if (programme.loop) return programme.durationMs;
  const from = programme.fromMs ?? 0;
  const to = programme.toMs ?? assetLengthMs;
  if (to === undefined) return undefined;
  return Math.max(0, to - from);
}

/**
 * Whether a live ingest is still arriving.
 *
 * A programme pointing at an open ingest is the channel taking whatever comes
 * down the wire, which is what live means; one pointing at a closed ingest is
 * a repeat of something that was live, which is an ordinary reference to an
 * ordinary asset.
 */
export function isOpen(ingest: LiveIngest): boolean {
  return !ingest.closedAt;
}

export function ingestById(
  channel: Channel, id: string,
): LiveIngest | undefined {
  return channel.ingests.find((ingest) => ingest.id === id);
}

export function programmeById(
  channel: Channel, id: string,
): Programme | undefined {
  return channel.programmes.find((programme) => programme.id === id);
}
