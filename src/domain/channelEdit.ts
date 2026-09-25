/**
 * Every change a channel can undergo.  [Doctrine CHANNEL §2–§6, D-18, INV-17]
 *
 * The one door, for the reason `performanceEdit` is the one door: a rule
 * enforced in three places is a rule enforced in two places and a bug. The
 * rule this door exists to enforce is D-18's — a schedule references, it
 * never copies — and it is enforced by there being no function here that
 * takes media, a path, or bytes.
 *
 * TWO FUNCTIONS MAKE ASSETS AND THEY BOTH SAY SO IN THEIR NAMES: `openIngest`
 * and `requestRecording`. Everything else moves references around.
 */

import {
  CHANNEL_SCHEMA_VERSION,
  type Channel, type LiveIngest, type LiveSession, type Programme,
  type ProgrammeSource, type RotationEntry,
  type ChannelBlock,
  ingestById, isOpen, orderedBlocks, orderedProgrammes, programmeById,
  programmeEnd, programmeStart, rotationAt, rotationLengthMs,
} from './channel.js';
import { DEFAULT_IDENTITY, type ChannelIdentity } from './identity.js';
import { newId } from './ids.js';

export class ChannelEditError extends Error {}

const fail = (message: string): never => { throw new ChannelEditError(message); };

/** A slot shorter than this is a mistake rather than a programme. */
export const MINIMUM_SLOT_MS = 1000;

export function newChannel(
  name: string, timezone: string, at: string,
): Channel {
  const trimmed = name.trim();
  if (!trimmed) fail('a channel needs a name');
  /*
   * The zone is checked by asking the platform, not by matching a pattern.
   * "Europe/Lagos" is not a zone and looks exactly like one.
   */
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    fail(`${timezone} is not a time zone this system knows`);
  }
  return {
    schemaVersion: CHANNEL_SCHEMA_VERSION,
    id: newId('chan'),
    name: trimmed.slice(0, 120),
    timezone,
    programmes: [],
    rotation: [],
    blocks: [],
    ingests: [],
    recordings: [],
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Put something on air at a time.  [§2, §3, INV-17]
 *
 * It takes a SOURCE, which is a reference, and there is no overload that
 * takes anything else. Scheduling the same render into thirty slots makes
 * thirty programmes and no files at all — which is the whole point, and is
 * asserted by a test that counts what is on disk rather than by this comment.
 */
export function scheduleProgramme(
  channel: Channel,
  entry: {
    startsAt: string;
    durationMs: number;
    source: ProgrammeSource;
    title?: string;
    fromMs?: number;
    toMs?: number;
    loop?: boolean;
  },
  at: string,
): Programme {
  const start = Date.parse(entry.startsAt);
  if (!Number.isFinite(start)) fail('a programme needs a time it goes out');
  /*
   * WITH AN OFFSET, NOT WITHOUT ONE. `Date.parse` accepts "2026-10-01T09:00"
   * and reads it in whatever zone the server happens to be in, so a schedule
   * written on a laptop in Lagos and served from a machine in Virginia goes
   * out an hour early and nothing anywhere reports a fault. [§2]
   */
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(entry.startsAt)) {
    fail('a programme\'s time needs a zone offset — 09:00 is not an instant');
  }
  if (!Number.isFinite(entry.durationMs) || entry.durationMs < MINIMUM_SLOT_MS) {
    fail('a programme needs a length');
  }
  assertSource(entry.source, channel);

  if (entry.fromMs !== undefined && entry.fromMs < 0) fail('that is before the start');
  if (entry.toMs !== undefined && entry.fromMs !== undefined
    && entry.toMs <= entry.fromMs) {
    fail('that trim leaves nothing of the programme');
  }

  const programme: Programme = {
    id: newId('prog'),
    startsAt: entry.startsAt,
    durationMs: Math.round(entry.durationMs),
    source: entry.source,
    ...(entry.title?.trim() ? { title: entry.title.trim().slice(0, 200) } : {}),
    ...(entry.fromMs !== undefined ? { fromMs: Math.round(entry.fromMs) } : {}),
    ...(entry.toMs !== undefined ? { toMs: Math.round(entry.toMs) } : {}),
    ...(entry.loop ? { loop: true } : {}),
    createdAt: at,
  };
  assertNoClash(channel, programme);
  channel.programmes.push(programme);
  return programme;
}

/** Move a programme to another time, or change how long its slot is. */
export function moveProgramme(
  channel: Channel, programmeId: string,
  to: { startsAt?: string; durationMs?: number },
): Programme {
  const programme = programmeById(channel, programmeId)
    ?? fail(`no programme ${programmeId} on this channel`);
  const moved: Programme = {
    ...programme,
    ...(to.startsAt ? { startsAt: to.startsAt } : {}),
    ...(to.durationMs !== undefined ? { durationMs: Math.round(to.durationMs) } : {}),
  };
  if (!Number.isFinite(Date.parse(moved.startsAt))
    || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(moved.startsAt)) {
    fail('a programme\'s time needs a zone offset');
  }
  if (moved.durationMs < MINIMUM_SLOT_MS) fail('a programme needs a length');
  assertNoClash(channel, moved);
  Object.assign(programme, moved);
  return programme;
}

export function retitleProgramme(
  channel: Channel, programmeId: string, title: string | null,
): void {
  const programme = programmeById(channel, programmeId)
    ?? fail(`no programme ${programmeId} on this channel`);
  const trimmed = (title ?? '').trim();
  if (trimmed) programme.title = trimmed.slice(0, 200);
  else delete programme.title;
}

/**
 * Take a programme off the schedule.
 *
 * IT DOES NOT TOUCH THE MEDIA, and that is worth saying out loud because it
 * is the mirror of the scheduling rule. A channel never made the file, so a
 * channel never deletes it: dropping the breakfast repeat must not remove the
 * performance its author spent a week on. [§3, D-18]
 */
export function removeProgramme(channel: Channel, programmeId: string): void {
  const before = channel.programmes.length;
  channel.programmes = channel.programmes.filter(
    (programme) => programme.id !== programmeId);
  if (channel.programmes.length === before) {
    fail(`no programme ${programmeId} on this channel`);
  }
}

/** What goes out between programmes, or nothing. [§4] */
export function setFiller(channel: Channel, source: ProgrammeSource | null): void {
  if (source === null) { delete channel.filler; return; }
  assertSource(source, channel);
  if (source.kind === 'live') {
    /*
     * Filler is what plays when nothing is scheduled, which means it has to
     * be there whenever it is needed. A live feed is by definition not always
     * there, and a channel whose fallback can itself fall over has no
     * fallback. [§4, §5]
     */
    fail('filler has to be something that is always there — a live feed is not');
  }
  channel.filler = source;
}

/* ------------------------------------------------------------------------ *
 *  The continuous rotation.  [§4]
 * ------------------------------------------------------------------------ */

/**
 * Put something into the loop.  [§4]
 *
 * NO TIME IS ASKED FOR, which is the whole difference between this and
 * `scheduleProgramme`. A rotation entry's start is the sum of what comes
 * before it; putting one at the top moves everything after it, and nobody
 * edits a clock. That is what makes the brief's listing editable rather than
 * a column of numbers to keep in agreement.
 *
 * `durationMs` still has to be given, because the domain does not decode. The
 * route reads it off the library, which measured it once.
 */
export function addToRotation(
  channel: Channel,
  entry: {
    source: ProgrammeSource; durationMs: number; title?: string;
    fromMs?: number; toMs?: number; loop?: boolean;
  },
  at: string,
  position?: number,
): RotationEntry {
  if (!Number.isFinite(entry.durationMs) || entry.durationMs < MINIMUM_SLOT_MS) {
    fail('a turn in the rotation needs a length');
  }
  assertSource(entry.source, channel);
  const made: RotationEntry = {
    id: newId('rot'),
    source: entry.source,
    durationMs: Math.round(entry.durationMs),
    ...(entry.title?.trim() ? { title: entry.title.trim().slice(0, 200) } : {}),
    ...(entry.fromMs !== undefined ? { fromMs: Math.round(entry.fromMs) } : {}),
    ...(entry.toMs !== undefined ? { toMs: Math.round(entry.toMs) } : {}),
    ...(entry.loop ? { loop: true } : {}),
    createdAt: at,
  };
  const where = position === undefined
    ? channel.rotation.length
    : Math.max(0, Math.min(position, channel.rotation.length));
  channel.rotation.splice(where, 0, made);
  /*
   * THE LOOP STARTS THE MOMENT THERE IS ONE. Without an anchor the rotation's
   * position would be computed against the channel's creation, which is a
   * number that means nothing — and a channel created last month would open
   * somewhere arbitrary in its first rotation. Set once and never moved:
   * changing it later would jump every viewer to a different programme.
   */
  channel.rotationFrom ??= at;
  return made;
}

/** Move a turn earlier or later in the loop. Everything after it follows. */
export function moveInRotation(
  channel: Channel, entryId: string, toPosition: number,
): void {
  const from = channel.rotation.findIndex((entry) => entry.id === entryId);
  if (from < 0) fail(`no rotation entry ${entryId} on this channel`);
  const [entry] = channel.rotation.splice(from, 1);
  const where = Math.max(0, Math.min(toPosition, channel.rotation.length));
  channel.rotation.splice(where, 0, entry!);
}

/**
 * Take a turn out of the loop.
 *
 * As with unscheduling, THE MEDIA IS UNTOUCHED. The channel never made the
 * file and never removes it. [§3, D-18]
 */
export function removeFromRotation(channel: Channel, entryId: string): void {
  const before = channel.rotation.length;
  channel.rotation = channel.rotation.filter((entry) => entry.id !== entryId);
  if (channel.rotation.length === before) {
    fail(`no rotation entry ${entryId} on this channel`);
  }
}

/* ------------------------------------------------------------------------ *
 *  The red button.  [§5]
 * ------------------------------------------------------------------------ */

/**
 * GO LIVE.  [§5]
 *
 * "The scheduled programming stops or pauses. You appear in the live studio."
 *
 * It opens an ingest — the one kind of programme that brings media with it —
 * and puts the channel into a live session that PRE-EMPTS everything. The
 * schedule is not edited, cleared or paused: it goes on being the schedule,
 * and `whatIsOn` simply stops consulting it while the red light is on. A
 * broadcast that rewrote its listings to go live would be a broadcast whose
 * listings were wrong afterwards.
 *
 * `roomId` is where the people are. "You can bring people into the room" is
 * the Conversation Room, which already exists — invitation by link,
 * participants in the room and on the stage, automatic speaker switching
 * (ROOM, D-17). A channel names the room it is coming out of rather than
 * growing a second one.
 */
export function goLive(
  channel: Channel, label: string, at: string, roomId?: string,
): LiveSession {
  if (channel.live && channel.live.phase !== 'ended') {
    fail('this channel is already live');
  }
  const ingest = openIngest(channel, label, at);
  /*
   * ARMED, NOT ON AIR. The camera comes up and the operator sees their own
   * preview; the wire is still showing the schedule. `takeLive` is the cut.
   * [§6]
   */
  channel.live = {
    ingestId: ingest.id,
    phase: 'armed',
    ...(roomId ? { roomId } : {}),
    startedAt: at,
  };
  return channel.live;
}

/**
 * Roll something into the live show, or take it down.  [§5]
 *
 * "You can bring up Studio One conversations, Studio Two performances,
 *  videos, images, graphics, announcements, prepared segments."
 *
 * A reference like every other reference. While it is up it is what goes out
 * and the feed is underneath it; taking it down returns to the room without
 * anybody re-cueing anything, because nothing was ever cued — the feed never
 * stopped, the channel just stopped looking at it.
 */
export function rollIn(
  channel: Channel, source: ProgrammeSource | null, fromMs?: number,
): void {
  const live = channel.live;
  if (!live || live.endedAt) return fail('this channel is not live');
  if (source === null) {
    delete live.segment;
    delete live.segmentFromMs;
    return;
  }
  assertSource(source, channel);
  if (source.kind === 'live') fail('the live feed is already what is underneath');
  live.segment = source;
  if (fromMs !== undefined && Number.isFinite(fromMs) && fromMs >= 0) {
    live.segmentFromMs = Math.round(fromMs);
  } else {
    delete live.segmentFromMs;
  }
}

/**
 * TAKE LIVE.  [§6]
 *
 * The cut. Everything before this was preview: the camera was on, the encoder
 * was up, the operator was looking at themselves, and the wire was still
 * showing the schedule. This is the frame where that changes.
 *
 * Separate from `goLive` because the brief's control bar has both buttons and
 * is right to: "that transition needs to be extremely reliable", and a single
 * button that opens a camera and cuts it to air broadcasts the first second
 * of every live show as a black frame while a device negotiates.
 */
export function takeLive(channel: Channel, at: string): LiveSession {
  const live = channel.live;
  if (!live || live.phase === 'ended') return fail('this channel is not armed');
  if (live.phase === 'on_air') return fail('it is already on air');
  live.phase = 'on_air';
  live.takenAt = at;
  return live;
}

/**
 * SAVE THIS LIVE SESSION.  [§8]
 *
 * "If you choose Save this live session, then it becomes an archived
 *  recording. If you don't choose that, the temporary live buffers are
 *  discarded after the broadcast."
 *
 * A decision, not an action: it can be made before the cut, halfway through,
 * or in the last minute, and what happens because of it happens when the
 * broadcast ends. That separation is why it is a flag and not a call to
 * `requestRecording` — the operator pressing Save at 20:40 wants the whole
 * show, not the forty minutes that are left.
 *
 * `false` un-chooses it, which has to be possible: somebody who pressed Save
 * on the wrong show must be able to say so before the buffer is promoted.
 */
export function keepLive(channel: Channel, keep: boolean): void {
  const live = channel.live;
  if (!live || live.phase === 'ended') return fail('this channel is not live');
  const ingest = ingestById(channel, live.ingestId);
  if (!ingest) return fail('that live feed is not on this channel');
  if (keep) ingest.keep = true;
  else delete ingest.keep;
}

/**
 * END LIVE.  [§6, §8]
 *
 * "and the scheduled channel automatically resumes."
 *
 * It resumes WHERE THE CLOCK SAYS, not where it left off, and that is a
 * decision rather than an accident. A channel's rotation is computed from the
 * wall clock against a fixed anchor, so an hour of live television means the
 * rotation has moved an hour on — exactly as it does on any broadcast
 * channel, where the nine o'clock film starts at nine whether or not the news
 * overran. Resuming where it paused would make the channel drift further from
 * its own listings after every live show, and the listing is what viewers
 * were told.
 *
 * AND THE BUFFER IS DECIDED HERE. If Save was chosen it is promoted: the
 * ingest gets an asset id, a recording is written naming who asked, and the
 * worker moves the bytes. If it was not, the buffer is discarded — which is
 * the brief's rule and the reason a live broadcast does not quietly cost a
 * gigabyte a time.
 *
 * Returns what to do with the buffer, because the domain does not touch
 * disk: `keep` means promote it to this asset id, `discard` means delete it.
 */
export function endLive(
  channel: Channel, at: string, durationMs?: number,
): { bufferId: string; keep: false } | { bufferId: string; keep: true;
  assetId: string; recordingId: string } {
  const live = channel.live;
  if (!live || live.phase === 'ended') return fail('this channel is not live');
  live.phase = 'ended';
  live.endedAt = at;
  delete live.segment;
  delete live.segmentFromMs;

  const ingest = ingestById(channel, live.ingestId);
  if (!ingest) return fail('that live feed is not on this channel');
  if (isOpen(ingest)) closeIngest(channel, ingest.id, at, durationMs);

  if (!ingest.keep) {
    /*
     * "The temporary live buffers are discarded after the broadcast." The
     * ingest stays in the document — it happened, and the audit should say so
     * — but it has no asset, so nothing can be scheduled against it and
     * INV-17 does not count it. The bytes go.
     */
    return { bufferId: ingest.bufferId, keep: false };
  }

  const assetId = newId('asset');
  ingest.assetId = assetId;
  const recording = {
    id: newId('rec'),
    label: ingest.label,
    assetId,
    fromAt: ingest.openedAt,
    toAt: at,
    /*
     * Somebody pressed Save, and the document says a person did. It is the
     * same rule `requestRecording` keeps and for the same reason: a channel
     * that quietly kept things would leave nobody able to say who decided.
     */
    requestedBy: 'the operator, live',
    requestedAt: at,
    ...(durationMs !== undefined ? { durationMs: Math.round(durationMs) } : {}),
  };
  channel.recordings.push(recording);
  return { bufferId: ingest.bufferId, keep: true, assetId, recordingId: recording.id };
}

/* ------------------------------------------------------------------------ *
 *  The rest of the control bar.  [§6]
 * ------------------------------------------------------------------------ */

/**
 * NEXT.  [§6]
 *
 * Cut to the next item in the loop, now, without waiting for the current one
 * to finish. It moves the ROTATION'S ANCHOR rather than editing anything: the
 * loop's position is `(now − anchor) % turn`, so pulling the anchor back by
 * whatever is left of the current entry puts the next one at this instant and
 * leaves the whole loop intact behind it.
 *
 * It jumps every viewer, which is exactly what pressing Next in a control
 * room does. It is an operator's decision, taken deliberately, and it is not
 * available by accident — nothing in the automatic path calls it.
 */
export function skipToNext(channel: Channel, at: string): void {
  const turn = rotationLengthMs(channel);
  if (turn <= 0) fail('there is nothing in the loop to skip to');
  const turning = rotationAt(channel, Date.parse(at))
    ?? fail('there is nothing in the loop to skip to');
  const left = turning.entry.durationMs - turning.intoMs;
  const anchor = channel.rotationFrom
    ? Date.parse(channel.rotationFrom)
    : Date.parse(channel.createdAt);
  channel.rotationFrom = new Date(anchor - left).toISOString();
}

/**
 * EMERGENCY.  [§6]
 *
 * The button that beats everything, including the red one. A caption card, an
 * apology slide, an ident — whatever the channel has agreed it shows when
 * something has gone wrong — and it goes out immediately, over live, over a
 * fixed programme, over the loop.
 *
 * IT BEATS LIVE, which is the whole point and the one ordering decision worth
 * arguing about. The moment you need this button is the moment the thing on
 * air must stop being on air, and more often than not the thing on air is
 * somebody live. A button that could not interrupt a live broadcast would be
 * a button that did not work when it was needed.
 *
 * It does not end the live session or touch the schedule. It is a cut away,
 * and clearing it is a cut back to whatever the channel would have been
 * showing all along.
 */
export function setEmergency(
  channel: Channel, source: ProgrammeSource | null, at: string,
): void {
  if (source === null) { delete channel.emergency; return; }
  assertSource(source, channel);
  if (source.kind === 'live') {
    fail('an emergency source has to be something that is always there');
  }
  channel.emergency = { source, atMs: Date.parse(at) };
}

/* ------------------------------------------------------------------------ *
 *  The two things that make media.  [§5, §6, D-18]
 * ------------------------------------------------------------------------ */

/**
 * Something starts arriving.  [§5]
 *
 * One of exactly two functions in this module that causes a media asset to
 * exist, and it is named for what it does. The asset id is minted here and
 * the worker writes to it; the channel records that it did, which is what
 * makes a live broadcast a thing that can be repeated afterwards rather than
 * a thing that happened.
 */
export function openIngest(
  channel: Channel, label: string, at: string,
): LiveIngest {
  const already = channel.ingests.find(isOpen);
  if (already) {
    /*
     * One at a time. Two open ingests is two things claiming to be "the live
     * feed", and the programme that points at one of them cannot say which.
     * A second camera is a second CHANNEL, or it is a mix made upstream.
     */
    fail(`"${already.label}" is still arriving — close it before opening another`);
  }
  const ingest: LiveIngest = {
    id: newId('ing'),
    label: (label.trim() || 'Live').slice(0, 120),
    /*
     * A BUFFER, NOT AN ASSET. The camera writes somewhere transient; whether
     * any of it is kept is a separate decision, made later, by a person. [§8]
     */
    bufferId: newId('buf'),
    openedAt: at,
  };
  channel.ingests.push(ingest);
  return ingest;
}

/**
 * It stops arriving, and becomes an ordinary asset.
 *
 * The duration is MEASURED by whoever writes the file and passed in here, not
 * computed from the two timestamps: a feed that dropped for ninety seconds
 * was open for an hour and is fifty-eight and a half minutes long, and a
 * schedule built on the subtraction would run the repeat into the next
 * programme. [U-02]
 */
export function closeIngest(
  channel: Channel, ingestId: string, at: string, durationMs?: number,
): LiveIngest {
  const ingest = ingestById(channel, ingestId)
    ?? fail(`no ingest ${ingestId} on this channel`);
  if (!isOpen(ingest)) fail('that feed is already closed');
  ingest.closedAt = at;
  if (durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0) {
    ingest.durationMs = Math.round(durationMs);
  }
  return ingest;
}

/**
 * Somebody asks for a stretch of the output to be kept.  [§6]
 *
 * The second and last thing here that makes an asset — "only live ingest and
 * explicitly requested recordings" — and `requestedBy` is not decoration: a
 * recording exists because a person asked, and the document says which
 * person, because the alternative is a channel that quietly keeps everything
 * and nobody able to say who decided that.
 */
export function requestRecording(
  channel: Channel,
  ask: { label: string; fromAt: string; toAt: string; requestedBy: string },
  at: string,
): Channel['recordings'][number] {
  const from = Date.parse(ask.fromAt);
  const to = Date.parse(ask.toAt);
  if (!Number.isFinite(from) || !Number.isFinite(to)) fail('a recording needs a window');
  if (to <= from) fail('that recording ends before it starts');
  if (!ask.requestedBy.trim()) fail('a recording is made because somebody asked');
  const recording = {
    id: newId('rec'),
    label: (ask.label.trim() || 'Recording').slice(0, 120),
    assetId: newId('asset'),
    fromAt: ask.fromAt,
    toAt: ask.toAt,
    requestedBy: ask.requestedBy.trim().slice(0, 120),
    requestedAt: at,
  };
  channel.recordings.push(recording);
  return recording;
}

/* ------------------------------------------------------------------------ *
 *  Checks.
 * ------------------------------------------------------------------------ */

/**
 * A source has to name something that could exist.
 *
 * It cannot check that the render is on disk — the domain does not read
 * disk — so it checks the shape, and the ROUTE checks the file. Two checks in
 * two layers rather than one in the wrong one: a domain that read the
 * filesystem could not be tested without one.
 */
function assertSource(source: ProgrammeSource, channel: Channel): void {
  if (source.kind === 'render') {
    if (source.document !== 'conversation' && source.document !== 'performance') {
      fail(`unknown kind of document: ${source.document}`);
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.documentId)) fail('that is not a document');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.planHash)) fail('that is not a render');
    return;
  }
  /*
   * A BOOKED LIVE SLOT REFERENCES AN INTENTION, so there is nothing to check
   * but the note somebody typed on it. It is the one source with no media
   * behind it and it is deliberately allowed here: holding the air open at
   * seven is a scheduling act, not a media one. [§6]
   */
  if (source.kind === 'live_event') return;
  if (source.kind === 'media') {
    /*
     * The library's third branch. Checked for shape here and for existence at
     * the route, the same split the render case takes — the domain does not
     * read disk, and a domain that did could not be tested without one.
     */
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.assetId)) fail('that is not a file');
    if (source.form !== 'image' && source.form !== 'video') {
      fail(`unknown kind of file: ${source.form}`);
    }
    return;
  }
  if (source.kind === 'live') {
    if (!ingestById(channel, source.ingestId)) {
      fail('that live feed is not on this channel');
    }
    return;
  }
  fail(`unknown kind of programme: ${(source as { kind: string }).kind}`);
}

/**
 * Two pictures cannot go down one wire.  [§2]
 *
 * Checked against every OTHER programme, so moving one onto its own old slot
 * is not a clash with itself. Refused rather than reported, because unlike a
 * gap — which is a thing the filler answers — an overlap has no answer: the
 * playout engine would have to pick, and a machine picking which programme
 * goes out is not a schedule.
 */
function assertNoClash(channel: Channel, programme: Programme): void {
  const start = programmeStart(programme);
  const end = programmeEnd(programme);
  for (const other of orderedProgrammes(channel)) {
    if (other.id === programme.id) continue;
    if (start < programmeEnd(other) && programmeStart(other) < end) {
      fail(`that overlaps "${other.title ?? 'the programme'}" `
        + `at ${new Date(programmeStart(other)).toISOString()}`);
    }
  }
}

/* ------------------------------------------------------------------------ *
 *  Day-parts, booked live slots, and the channel's identity.  [§5, §6, §13]
 * ------------------------------------------------------------------------ */

/**
 * Give the day a shape.  [§5]
 *
 *     06:00 ─ Morning Music        18:00 ─ Live
 *     09:00 ─ Education            20:00 ─ Best Conversations
 *     12:00 ─ Conversations        23:00 ─ Overnight Music
 *
 * A block is created empty and filled the same way the channel's own loop is,
 * because it IS a loop — one that only holds the air for part of the day. A
 * station does not decide at eleven minutes past nine what to play; it
 * decides that the morning is music.
 */
export function addBlock(
  channel: Channel,
  block: { name: string; fromMinute: number; days?: number[] },
  at: string,
): ChannelBlock {
  const name = block.name.trim();
  if (!name) fail('a block needs a name');
  if (!Number.isInteger(block.fromMinute)
    || block.fromMinute < 0 || block.fromMinute > 24 * 60 - 1) {
    fail('a block starts at a time of day');
  }
  if (orderedBlocks(channel).some((other) => other.fromMinute === block.fromMinute
    && sameDays(other.days, block.days))) {
    /*
     * Two blocks starting at the same minute on the same day is the same
     * fault as two programmes at the same instant: the channel would have to
     * pick, and a machine picking the shape of the day is not a schedule.
     */
    fail('another block already starts then');
  }
  const made: ChannelBlock = {
    id: newId('blk'),
    name: name.slice(0, 80),
    fromMinute: block.fromMinute,
    ...(block.days?.length ? { days: [...new Set(block.days)].sort() } : {}),
    rotation: [],
    createdAt: at,
  };
  channel.blocks.push(made);
  return made;
}

export function removeBlock(channel: Channel, blockId: string): void {
  const before = channel.blocks.length;
  channel.blocks = channel.blocks.filter((block) => block.id !== blockId);
  if (channel.blocks.length === before) fail(`no block ${blockId} on this channel`);
}

/** Put something into a day-part's loop. Same rules as the channel's own. */
export function addToBlock(
  channel: Channel, blockId: string,
  entry: {
    source: ProgrammeSource; durationMs: number; title?: string;
    fromMs?: number; toMs?: number; loop?: boolean;
  },
  at: string,
): RotationEntry {
  const block = channel.blocks.find((candidate) => candidate.id === blockId)
    ?? fail(`no block ${blockId} on this channel`);
  if (!Number.isFinite(entry.durationMs) || entry.durationMs < MINIMUM_SLOT_MS) {
    fail('a turn in a block needs a length');
  }
  assertSource(entry.source, channel);
  const made: RotationEntry = {
    id: newId('rot'),
    source: entry.source,
    durationMs: Math.round(entry.durationMs),
    ...(entry.title?.trim() ? { title: entry.title.trim().slice(0, 200) } : {}),
    ...(entry.fromMs !== undefined ? { fromMs: Math.round(entry.fromMs) } : {}),
    ...(entry.toMs !== undefined ? { toMs: Math.round(entry.toMs) } : {}),
    ...(entry.loop ? { loop: true } : {}),
    createdAt: at,
  };
  block.rotation.push(made);
  return made;
}

export function removeFromBlock(
  channel: Channel, blockId: string, entryId: string,
): void {
  const block = channel.blocks.find((candidate) => candidate.id === blockId)
    ?? fail(`no block ${blockId} on this channel`);
  const before = block.rotation.length;
  block.rotation = block.rotation.filter((entry) => entry.id !== entryId);
  if (block.rotation.length === before) fail(`no entry ${entryId} in that block`);
}

function sameDays(a?: number[], b?: number[]): boolean {
  const left = [...new Set(a ?? [])].sort().join(',');
  const right = [...new Set(b ?? [])].sort().join(',');
  return left === right;
}

/**
 * Book a live slot in the listing.  [§6]
 *
 *     19:00  LIVE — Evening Discussion
 *
 * It references an intention, not media. At the hour the channel switches to
 * whoever is live; if nobody is, it falls through to whatever would have been
 * on — because a listing cannot make somebody turn up, and a channel that
 * went to black at nineteen hundred because its presenter was late would be
 * punishing the viewer for it.
 */
export function bookLiveEvent(
  channel: Channel,
  entry: { startsAt: string; durationMs: number; title?: string; note?: string },
  at: string,
): Programme {
  return scheduleProgramme(channel, {
    startsAt: entry.startsAt,
    durationMs: entry.durationMs,
    source: {
      kind: 'live_event',
      ...(entry.note?.trim() ? { note: entry.note.trim().slice(0, 200) } : {}),
    },
    ...(entry.title?.trim() ? { title: entry.title.trim() } : {}),
  }, at);
}

/**
 * How the channel looks.  [§13, D-16]
 *
 * Merged rather than replaced, so turning the live lamp off does not also
 * forget the bug. There is no "clear everything" here on purpose: an identity
 * is a thing you adjust, and a single button that wiped it would be a button
 * somebody presses once.
 */
export function setIdentity(
  channel: Channel, patch: Partial<ChannelIdentity>,
): void {
  const now = channel.identity ?? { ...DEFAULT_IDENTITY };
  const next: ChannelIdentity = { ...now, ...patch };
  if (next.bug) {
    if (next.bug.opacity < 0 || next.bug.opacity > 1) {
      fail('a bug is between invisible and solid');
    }
    if (!next.bug.text?.trim() && !next.bug.assetId) delete next.bug;
  }
  if (next.lowerThird && next.lowerThird.holdMs < 0) {
    fail('a lower third cannot be held for less than no time');
  }
  channel.identity = next;
}

/* ------------------------------------------------------------------------ *
 *  Failure, and what the viewer sees instead.  [§9]
 * ------------------------------------------------------------------------ */

/**
 * The safe playlist.  [§9]
 *
 *     LIVE FAILURE → BACKUP VIDEO → MUSIC LOOP → NEXT SCHEDULED PROGRAM
 *
 * What goes out when a live feed fails and nobody has pressed anything.
 * Distinct from `filler`, which covers a hole in a schedule nobody is
 * watching for, and from `emergency`, which is an operator cutting away on
 * purpose. This is the one that runs when there is nobody there to run it.
 */
export function setBackup(
  channel: Channel, source: ProgrammeSource | null,
): void {
  if (source === null) { delete channel.backup; return; }
  assertSource(source, channel);
  if (source.kind === 'live' || source.kind === 'live_event') {
    fail('a backup has to be something that is already there');
  }
  channel.backup = source;
}

/**
 * The feed has stopped arriving.  [§9]
 *
 * Called by the playout engine, not by a person: it is the one transition in
 * this document that a machine decides, and it decides it by watching a file
 * stop growing. The session is NOT ended, because nothing has been decided —
 * a presenter whose wifi dropped has not finished their programme.
 *
 * Idempotent, because the engine will notice again on the next pass and a
 * fault that kept moving its own timestamp would never let the backup expire.
 */
export function faultLive(channel: Channel, at: string): boolean {
  const live = channel.live;
  if (!live || live.phase !== 'on_air' || live.faultedAt) return false;
  live.faultedAt = at;
  return true;
}

/**
 * It came back.
 *
 * Also the engine's to call. A broadcast that resumed because the bytes
 * resumed is the behaviour a presenter expects — they reconnected, so they
 * are back on — and it is why the fault marks rather than ends.
 */
export function recoverLive(channel: Channel): boolean {
  const live = channel.live;
  if (!live?.faultedAt) return false;
  delete live.faultedAt;
  return true;
}
