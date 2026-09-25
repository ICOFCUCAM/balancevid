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
  ingestById, isOpen, orderedProgrammes, programmeById, programmeEnd, programmeStart,
} from './channel.js';
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
  if (channel.live && !channel.live.endedAt) fail('this channel is already live');
  const ingest = openIngest(channel, label, at);
  channel.live = {
    ingestId: ingest.id,
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
 * END LIVE.  [§5]
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
 * The feed is closed with it, so what was broadcast live becomes an ordinary
 * asset that can be scheduled like anything else. [§5]
 */
export function endLive(
  channel: Channel, at: string, durationMs?: number,
): void {
  const live = channel.live;
  if (!live || live.endedAt) return fail('this channel is not live');
  live.endedAt = at;
  delete live.segment;
  delete live.segmentFromMs;
  const ingest = ingestById(channel, live.ingestId);
  if (ingest && isOpen(ingest)) closeIngest(channel, ingest.id, at, durationMs);
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
    assetId: newId('asset'),
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
