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
  type Channel, type LiveIngest, type Programme, type ProgrammeSource,
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
