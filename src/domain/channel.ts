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
import type { ChannelIdentity } from './identity.js';
import type { Destination } from './distribution.js';

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
  | { kind: 'live'; ingestId: IngestId }
  /**
   * A LIVE EVENT IN THE LISTING.  [§6]
   *
   *     19:00  LIVE — Evening Discussion
   *
   * A slot that is booked for a broadcast nobody has made yet. It is not a
   * reference to media, because there is no media: it is a reference to an
   * INTENTION, and what it does is hold the air open. At 19:00 the channel
   * switches to whatever live session is running; if nobody went live it
   * falls through to the loop, which is the honest behaviour — a listing
   * cannot make somebody turn up.
   *
   * Distinct from `live`, which names a session that exists. This is the slot
   * you book on Monday for Friday.
   */
  | { kind: 'live_event'; note?: string }
  /**
   * OTHER MEDIA.  [§3, the brief's third branch]
   *
   * "Media library → Studio 1, Studio 2, Other Media." A station ident, a
   * caption card, a photograph, an announcement slide, a piece of footage
   * that was never part of a conversation or a performance. Real channels are
   * half made of these and a schedule that could not hold one would send
   * people back to a video editor to make a ten-second title.
   *
   * It is STILL a reference. The asset it names was uploaded to the library
   * once and lives there; scheduling it thirty times makes thirty programmes
   * and no copies, exactly as a render does. `stillMs` is how long a picture
   * stays up, because a photograph has no duration of its own and something
   * has to say.
   */
  | {
    kind: 'media';
    assetId: string;
    /** `image` is held for its slot; `video` plays. */
    form: 'image' | 'video';
  };

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
  /**
   * WHERE THE ARRIVING MEDIA IS BEING WRITTEN, WHICH IS NOT AN ASSET.
   * [§7, D-18]
   *
   *     Camera → Microphone → Live ingest → Broadcast encoder → Online TV
   *
   * "If you don't choose to save this live session, the temporary live
   *  buffers are discarded after the broadcast."
   *
   * This was wrong in the first version and it is worth saying so: an ingest
   * minted an `assetId` the moment the red button was pressed, which made
   * every live broadcast a permanent file whether or not anybody wanted one.
   * A channel that keeps every second it ever transmitted is the duplication
   * rule broken from the other end — the same fault as a schedule that
   * copies, arriving by a different door.
   *
   * A buffer is transient by construction: it lives under `live/`, never
   * `assets/`, it is swept when the broadcast ends, and INV-17 does not count
   * it because it is not an asset until somebody says so.
   */
  bufferId: string;
  /**
   * SET ONLY IF SOMEBODY CHOSE TO KEEP IT.  [§8]
   *
   * "If you choose Save this live session, then it becomes an archived
   *  recording."
   *
   * Absent while it is only a broadcast. Present once the buffer has been
   * promoted, at which point it is an ordinary asset that can be scheduled,
   * repeated and referenced like anything else — and the one file the channel
   * owns that INV-17 allows.
   */
  assetId?: string;
  /**
   * Whether the operator has asked for it to be kept.
   *
   * SEPARATE FROM `assetId`, because the decision and the promotion happen at
   * different moments: you press Save halfway through, and the buffer becomes
   * a recording when the broadcast ends. Storing only the outcome would make
   * "am I recording?" unanswerable during the thing it is a question about.
   */
  keep?: boolean;
  openedAt: string;
  /** Absent while it is still arriving. */
  closedAt?: string;
  /** Measured when it closes, never assumed. [U-02] */
  durationMs?: number;
}

/**
 * THE TWO MODES, AND THE STEP BETWEEN THEM.  [§6]
 *
 *     PROGRAM  →  TAKE LIVE  →  YOU  →  GUEST  →  VIDEO  →  YOU
 *              →  END LIVE   →  PROGRAM RESUMES
 *
 * "That transition needs to be extremely reliable."
 *
 * Which is why there are three states and not two. ARMED is the camera on,
 * the encoder up, the operator looking at their own preview — and nothing on
 * the wire. ON AIR is the cut. A single button that opened a camera AND put
 * it to air is exactly the unreliable transition the brief is warning about:
 * the first second of every live show would be a black frame while a device
 * negotiated, broadcast to everybody watching.
 *
 * It is the preset/program discipline every vision mixer has had for sixty
 * years, and it is here for the same reason it is there.
 */
export type LivePhase = 'armed' | 'on_air' | 'ended';

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

/**
 * ONE ENTRY IN THE CONTINUOUS ROTATION.  [§4, the brief]
 *
 *     00:00  Music Video — Everlasting Love
 *     04:17  History Discussion
 *     28:42  Music Video — Performance 2
 *     ...
 *     When the schedule reaches the end: it continues from the beginning.
 *
 * THE TIMES IN THAT LIST ARE NOT TIMES OF DAY. They are where each item falls
 * in a sequence that plays back to back and then starts again — which is why
 * a rotation entry carries a DURATION and no start at all. Its start is the
 * sum of what comes before it, derived on every read, and an entry moved to
 * the top moves everything after it without anybody editing a clock.
 *
 * This is the layer that makes the brief's promise true: "so your channel is
 * always online". A rotation cannot have a gap, because there is nothing
 * between the end of one entry and the start of the next.
 */
export interface RotationEntry {
  id: Id<'rot'>;
  source: ProgrammeSource;
  /** How long this item holds the air. */
  durationMs: number;
  title?: string;
  /** Which part of the referenced media, on the media's own clock. */
  fromMs?: number;
  toMs?: number;
  /** Repeat within its own slot, for something shorter than its turn. */
  loop?: boolean;
  createdAt: string;
}

/**
 * THE CHANNEL IS LIVE.  [§5, the brief]
 *
 * "You press GO LIVE. The scheduled programming stops or pauses. You appear
 *  in the live studio... Then End Live, and the scheduled channel
 *  automatically resumes."
 *
 * A live session PRE-EMPTS everything: it beats a fixed programme, which
 * beats the rotation. That ordering is the whole of it, and it is deliberate
 * — the one thing a broadcaster presses a red button for is to interrupt what
 * was going out.
 *
 * `roomId` is where the people are. "You can bring people into the room" is
 * the Conversation Room, which already exists (ROOM.md, D-17): invitation by
 * link, participants in the room and on the stage, automatic speaker
 * switching. A channel going live names the conversation whose room it is
 * coming out of rather than growing a second room of its own — a second room
 * would be a second place invitations, staging and speaker detection could
 * disagree.
 */
export interface LiveSession {
  /** The media arriving. Always present: live is the one thing that is new. */
  ingestId: IngestId;
  /** Armed and previewing, cut to air, or over. [§6] */
  phase: LivePhase;
  /**
   * THE FEED WENT AWAY.  [§9]
   *
   *     LIVE FAILURE → BACKUP VIDEO → MUSIC LOOP → NEXT SCHEDULED PROGRAM
   *
   * "The viewer should never see your FFmpeg error or a dead screen."
   *
   * Set by the playout engine when nothing has arrived in the buffer for
   * long enough that something is wrong — a laptop that slept, a phone that
   * lost signal, a browser tab that was closed mid-sentence. The session is
   * not ended, because the presenter has not decided anything: it is marked,
   * the channel falls through to the backup chain, and the moment bytes start
   * arriving again it clears itself and the broadcast resumes.
   *
   * IT IS ON THE DOCUMENT rather than in the engine's memory, so the studio,
   * the playlist and the audit log all see the same thing. A failover the
   * operator could not see on their own screen would be a failover they found
   * out about from a viewer.
   */
  faultedAt?: string;
  /** When it was taken to air, which is not when it was armed. */
  takenAt?: string;
  /** The room the people are in, where there are people. [ROOM §1, D-17] */
  roomId?: string;
  /**
   * Something rolled into the live show.  [§5]
   *
   * "You can bring up Studio One conversations, Studio Two performances,
   *  videos, images, graphics, announcements, prepared segments."
   *
   * A reference like every other reference, on the air until it is taken
   * down. While it is set, it is what goes out; the live feed is underneath
   * it, and pulling it down returns to the room without anybody re-cueing
   * anything.
   */
  segment?: ProgrammeSource;
  segmentFromMs?: number;
  startedAt: string;
  endedAt?: string;
}

/**
 * A DAY-PART.  [§5]
 *
 *     06:00 ─ Morning Music
 *     09:00 ─ Education
 *     12:00 ─ Conversations
 *     18:00 ─ Live
 *     23:00 ─ Overnight Music
 *
 * "Rather than scheduling every individual video, create programming blocks.
 *  That makes the channel feel like an actual television station."
 *
 * And it is the right shape, not just a convenience: a station does not
 * decide at eleven minutes past nine what to play, it decides that the
 * morning is music. A block is a NAMED STRETCH OF THE DAY WITH ITS OWN LOOP,
 * so "Morning Music" is one thing to edit and it covers three hours forever
 * rather than ninety entries somebody has to keep in order.
 *
 * `fromMinute` is minutes past midnight IN THE CHANNEL'S OWN ZONE, because a
 * block is a statement about breakfast and breakfast is local. It is a time
 * of day rather than an instant for the same reason: it happens every day,
 * and an instant happens once.
 */
export interface ChannelBlock {
  id: Id<'blk'>;
  name: string;
  /** Minutes past midnight, local to the channel. */
  fromMinute: number;
  /**
   * Which days it runs. 0 is Sunday, as `Date` counts them. Empty means
   * every day, which is what a channel starting out wants.
   */
  days?: number[];
  /** Its own loop, played round for as long as the block holds the air. */
  rotation: RotationEntry[];
  createdAt: string;
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
  /**
   * THE CONTINUOUS ROTATION.  [§4]
   *
   * ORDERED, unlike everything else in this codebase — and for once the order
   * is the data rather than something derived from a clock, because there is
   * no clock to derive it from. "It continues from the beginning" is a
   * statement about a sequence, and a sequence whose order was inferred from
   * timestamps would be a sequence you could not reorder.
   */
  rotation: RotationEntry[];
  /**
   * When the rotation began, as an instant.
   *
   * The rotation's position is computed from the wall clock against this, not
   * from a cursor that ticks. A cursor is a second clock, and a second clock
   * is a thing that stops when a process restarts — a channel that resumed
   * where it was rather than where the time says would drift a little further
   * from itself after every deploy.
   */
  rotationFrom?: string;
  /**
   * The day's shape.  [§5]
   *
   * Between the fixed programmes and the channel's own rotation: a block
   * holding the air plays ITS loop, and the channel's loop is what runs when
   * no block does. Ordered by time of day on read, never stored in order.
   */
  blocks: ChannelBlock[];
  ingests: LiveIngest[];
  /** Set while the red light is on, and only then. [§5] */
  live?: LiveSession;
  /**
   * WHAT IS ON AIR INSTEAD, because something has gone wrong.  [§6]
   *
   * The button that beats everything, including the red one — because the
   * moment you need it is the moment the thing on air must stop being on air,
   * and more often than not the thing on air is somebody live. Cleared by the
   * operator; nothing clears it on its own.
   */
  emergency?: { source: ProgrammeSource; atMs: number };
  /**
   * THE SAFE PLAYLIST.  [§9]
   *
   * What goes out when a live feed fails and nobody has pressed anything —
   * an ident, a caption card, a music loop, whatever the channel has agreed
   * it shows rather than a dead screen. Distinct from `emergency`, which is
   * an operator cutting away on purpose, and from `filler`, which covers a
   * hole in a schedule nobody is watching for.
   *
   * Absent is legitimate: a channel with a rotation falls through to the loop
   * instead, which is already something rather than nothing.
   */
  backup?: ProgrammeSource;
  /**
   * WHERE THE PROGRAMME GOES.  [§15, D-21]
   *
   * One master broadcast output, and destinations that receive it. Declared
   * from the beginning even though the first implementation activates only
   * the channel's own, because a destination is a row in a list and adding
   * the list later would mean every screen that shows "on air" learning that
   * there is more than one place it can be on air in.
   */
  destinations?: Destination[];
  /**
   * How the channel looks.  [§13, D-16]
   *
   * "The station branding should be applied at the broadcast layer, not
   *  permanently burned into your source videos. That way you can change your
   *  channel identity later."
   *
   * A small table, drawn by the encoder over whatever is on the wire.
   * Changing it changes every future second and touches no stored file.
   */
  identity?: ChannelIdentity;
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
  for (const programme of channel.programmes) {
    /* A booked live slot is an intention, not an asset. */
    if (programme.source.kind !== 'live_event') add(programme.source);
  }
  for (const entry of channel.rotation) add(entry.source);
  /*
   * AND EVERY DAY-PART'S LOOP. The playout engine reads these, so leaving
   * them out would mean a block whose film had been deleted went out as black
   * with nothing reporting it — INV-17's second half is only as good as the
   * list it is given. [§5]
   */
  for (const block of channel.blocks ?? []) {
    for (const entry of block.rotation) add(entry.source);
  }
  add(channel.filler);
  add(channel.live?.segment);
  add(channel.emergency?.source);
  add(channel.backup);
  return [...seen.values()];
}

/** A reference's identity, for counting and comparing. */
export function sourceKey(source: ProgrammeSource): string {
  if (source.kind === 'live') return `live:${source.ingestId}`;
  /* A booked slot references no media, so it costs no asset. [§6, D-18] */
  if (source.kind === 'live_event') return 'live_event';
  if (source.kind === 'media') return `media:${source.assetId}`;
  return `render:${source.document}:${source.documentId}:${source.planHash}`;
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

/* ------------------------------------------------------------------------ *
 *  The rotation, and what is actually on air.  [§4, §5]
 * ------------------------------------------------------------------------ */

/** One turn of the whole rotation. Zero when there is nothing in it. */
export function rotationLengthMs(channel: Channel): number {
  return channel.rotation.reduce((total, entry) => total + entry.durationMs, 0);
}

/**
 * Where an entry starts within one turn.
 *
 * The "00:00 / 04:17 / 28:42" column of the brief's listing, derived rather
 * than stored — which is what makes moving an entry to the top move
 * everything after it without anybody editing a clock.
 */
export function rotationOffsets(channel: Channel): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const entry of channel.rotation) {
    offsets.push(at);
    at += entry.durationMs;
  }
  return offsets;
}

/**
 * Which entry of the rotation an instant lands in, and how far into it.
 *
 * THE WRAP IS A MODULUS. "When the schedule reaches the end it continues from
 * the beginning" is `(now - start) % turn`, and expressing it that way is
 * what makes the channel correct after a restart: there is no cursor to lose,
 * so a process that comes back up computes the same answer the old one would
 * have. [§4]
 */
export function rotationAt(channel: Channel, at: number): {
  entry: RotationEntry; intoMs: number; index: number;
} | undefined {
  const turn = rotationLengthMs(channel);
  if (turn <= 0) return undefined;
  const from = channel.rotationFrom
    ? Date.parse(channel.rotationFrom)
    : Date.parse(channel.createdAt);
  /*
   * `%` in JavaScript keeps the sign of the dividend, so an instant BEFORE
   * the rotation started would land on a negative offset and index -1. A
   * channel is a loop with no beginning as far as a viewer is concerned, so
   * the modulus is made positive and the rotation is treated as having always
   * been running.
   */
  const into = (((at - from) % turn) + turn) % turn;
  const offsets = rotationOffsets(channel);
  let index = 0;
  for (let i = 0; i < offsets.length; i += 1) {
    if (into >= offsets[i]!) index = i;
    else break;
  }
  return {
    entry: channel.rotation[index]!, index, intoMs: into - offsets[index]!,
  };
}

/**
 * WHAT IS ACTUALLY ON AIR, in the order that decides it.  [§4, §5]
 *
 *   live      — the red button beats everything, which is what it is for;
 *   programme — a fixed-time slot pre-empts the rotation;
 *   rotation  — the continuous loop, which is always there;
 *   off       — only when there is no rotation and nothing scheduled.
 *
 * ONE FUNCTION, because "what is on air" asked in three places is three
 * places that can disagree about it — and the one that matters is the playout
 * engine, which is the only one nobody is watching.
 */
export type OnAir =
  | { kind: 'emergency'; source: ProgrammeSource; fromMs: number }
  /** A live feed failed and the safe playlist took the air. [§9] */
  | { kind: 'backup'; source: ProgrammeSource; fromMs: number }
  | { kind: 'live'; session: LiveSession; source: ProgrammeSource; fromMs: number }
  | { kind: 'programme'; programme: Programme; source: ProgrammeSource; fromMs: number;
    untilMs: number }
  | { kind: 'rotation'; entry: RotationEntry; source: ProgrammeSource; fromMs: number;
    untilMs: number;
    /** Set when the loop being played belongs to a day-part. [§5] */
    blockName?: string }
  | { kind: 'off' };

export type OnAirKind = OnAir['kind'];

/**
 * How long the backup holds the air after a live feed fails.
 *
 * A minute. Long enough that a presenter whose wifi dropped for twenty
 * seconds comes back to their own broadcast rather than to the middle of a
 * music loop; short enough that a broadcast nobody is coming back to becomes
 * an ordinary channel again rather than a caption card all evening.
 *
 * After it, the chain carries on by itself — the loop, and then whatever the
 * schedule had next — which is the brief's sequence and needs no timer,
 * because it is only ever the ordinary resolution happening again.
 */
export const BACKUP_HOLD_MS = 60_000;

export function whatIsOn(channel: Channel, at: number): OnAir {
  /*
   * EMERGENCY FIRST. Above live, deliberately: see the note on the field.
   */
  if (channel.emergency) {
    return {
      kind: 'emergency', source: channel.emergency.source, fromMs: 0,
    };
  }
  const live = channel.live;
  /*
   * A FAULTED FEED IS NOT ON AIR EITHER, and this is the whole of the
   * automatic failover: nothing switches, nothing is rewritten, the channel
   * simply stops looking at a feed that has stopped arriving and resolves
   * what it would have resolved anyway — backup, then the loop, then the next
   * scheduled programme. The viewer sees a channel, not an error. [§9]
   */
  if (live && live.phase === 'on_air' && live.faultedAt) {
    const since = at - Date.parse(live.faultedAt);
    if (channel.backup && since < BACKUP_HOLD_MS) {
      return { kind: 'backup', source: channel.backup, fromMs: 0 };
    }
  }
  /*
   * ARMED IS NOT ON AIR. The camera is up and the operator is previewing
   * themselves; the wire is still showing the schedule until somebody takes
   * it. [§6]
   */
  if (live && live.phase === 'on_air' && !live.faultedAt) {
    /*
     * A segment rolled into the live show is what goes out while it is up;
     * the feed is underneath it. Taking it down returns to the room without
     * anybody re-cueing anything. [§5]
     */
    const source = live.segment ?? { kind: 'live' as const, ingestId: live.ingestId };
    /*
     * WHERE IN THE BUFFER THIS INSTANT IS.  [§7]
     *
     * The live buffer is one growing file that started when the camera came
     * up, so "now" is however long the camera has been running — not zero.
     * Zero was right when the buffer was imaginary and is the bug that would
     * have made every segment replay the first four seconds of the broadcast
     * forever.
     *
     * Measured from `openedAt` rather than from `takenAt`: recording starts
     * when the feed is ARMED, so by the time somebody takes it there are
     * already some seconds in the file, and reading from the cut would read
     * from the wrong place by exactly the length of the preview.
     */
    const ingest = ingestById(channel, live.ingestId);
    const intoBuffer = ingest ? Math.max(0, at - Date.parse(ingest.openedAt)) : 0;
    return {
      kind: 'live', session: live, source,
      fromMs: live.segment ? (live.segmentFromMs ?? 0) : intoBuffer,
    };
  }

  const programme = onAirAt(channel, at);
  /*
   * A BOOKED LIVE SLOT HOLDS THE AIR OPEN AND NOTHING MORE.  [§6]
   *
   * If somebody is live, the branch above already returned. If nobody is, the
   * slot falls through to whatever would have been on — a listing cannot make
   * somebody turn up, and a channel that went to black at nineteen hundred
   * because its presenter was late would be a channel that punished the
   * viewer for it.
   */
  if (programme && programme.source.kind !== 'live_event') {
    return {
      kind: 'programme', programme, source: programme.source,
      fromMs: (programme.fromMs ?? 0) + (at - programmeStart(programme)),
      untilMs: programmeEnd(programme),
    };
  }

  /*
   * THE DAY-PART, between the fixed slots and the channel's own loop. A block
   * holding the air plays ITS rotation; the channel's is what runs when no
   * block does. [§5]
   */
  const block = blockAt(channel, at);
  if (block) {
    const turningBlock = turnOf(block.block.rotation, block.fromMs, at);
    if (turningBlock) {
      return {
        kind: 'rotation', entry: turningBlock.entry, source: turningBlock.entry.source,
        fromMs: (turningBlock.entry.fromMs ?? 0) + turningBlock.intoMs,
        untilMs: at + (turningBlock.entry.durationMs - turningBlock.intoMs),
        blockName: block.block.name,
      };
    }
  }

  const turning = rotationAt(channel, at);
  if (turning) {
    return {
      kind: 'rotation', entry: turning.entry, source: turning.entry.source,
      fromMs: (turning.entry.fromMs ?? 0) + turning.intoMs,
      untilMs: at + (turning.entry.durationMs - turning.intoMs),
    };
  }

  return { kind: 'off' };
}

/** Every reference the rotation makes, for the count that proves the rule. */
export function rotationById(
  channel: Channel, id: string,
): RotationEntry | undefined {
  return channel.rotation.find((entry) => entry.id === id);
}

/* ------------------------------------------------------------------------ *
 *  Day-parts.  [§5]
 * ------------------------------------------------------------------------ */

/** The blocks in the order they run through a day. */
export function orderedBlocks(channel: Channel): ChannelBlock[] {
  return [...(channel.blocks ?? [])].sort((a, b) => a.fromMinute - b.fromMinute);
}

/**
 * Minutes past midnight, and the weekday, IN THE CHANNEL'S OWN ZONE.
 *
 * Computed through `Intl` rather than by arithmetic on the instant, because
 * the arithmetic is wrong twice a year: an hour added in March does not move
 * breakfast, and a channel whose morning block started at five for one day
 * every spring would be a channel with a bug nobody could reproduce in
 * summer. [§2]
 */
export function localDay(channel: Channel, at: number): {
  minute: number; weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: channel.timezone,
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    minute: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: Math.max(0, days.indexOf(get('weekday'))),
  };
}

/**
 * Which block holds the air at this instant, and when it took it.
 *
 * The last block whose start has passed today — so the overnight block that
 * began at 23:00 is still the one running at 02:00, which is how a schedule
 * printed in a newspaper has always read.
 */
export function blockAt(
  channel: Channel, at: number,
): { block: ChannelBlock; fromMs: number } | undefined {
  const blocks = orderedBlocks(channel).filter((block) => block.rotation.length > 0);
  if (blocks.length === 0) return undefined;
  const { minute, weekday } = localDay(channel, at);
  const runsToday = (block: ChannelBlock, day: number) =>
    !block.days || block.days.length === 0 || block.days.includes(day);

  const todays = blocks.filter((block) => runsToday(block, weekday));
  const current = [...todays].reverse().find((block) => block.fromMinute <= minute);
  if (current) {
    return { block: current, fromMs: at - (minute - current.fromMinute) * 60_000 };
  }
  /*
   * Before the first block of the day: yesterday's last one is still running,
   * which is what an overnight block IS. Its anchor is yesterday's clock.
   */
  const yesterday = (weekday + 6) % 7;
  const carried = [...blocks.filter((block) => runsToday(block, yesterday))].pop();
  if (!carried) return undefined;
  const sinceMidnight = minute * 60_000;
  return {
    block: carried,
    fromMs: at - sinceMidnight - (24 * 60 - carried.fromMinute) * 60_000,
  };
}

/** Where a loop is, given when it started. Shared by blocks and the channel. */
function turnOf(
  rotation: RotationEntry[], fromMs: number, at: number,
): { entry: RotationEntry; intoMs: number; index: number } | undefined {
  const turn = rotation.reduce((total, entry) => total + entry.durationMs, 0);
  if (turn <= 0) return undefined;
  const into = (((at - fromMs) % turn) + turn) % turn;
  let index = 0;
  let offset = 0;
  for (let i = 0; i < rotation.length; i += 1) {
    if (into >= offset) { index = i; }
    else break;
    offset += rotation[i]!.durationMs;
  }
  let before = 0;
  for (let i = 0; i < index; i += 1) before += rotation[i]!.durationMs;
  return { entry: rotation[index]!, index, intoMs: into - before };
}
