/**
 * The playout engine, as arithmetic.  [Doctrine CHANNEL §7, D-18, INV-17]
 *
 * "The playout engine continuously reads scheduled assets and produces the
 *  broadcast stream."
 *
 * READS. Not copies, not collects, not prepares. This module turns a schedule
 * and an instant into a list of READS — which asset, from where in it, for
 * how long — and nothing else. It never names an output file, because the
 * moment a playout engine can name a file somebody will make it write one,
 * and the thing it writes will be a second copy of a programme that already
 * exists.
 *
 * WHY THE ENGINE IS A PURE FUNCTION. A broadcast is a thing that happens at a
 * time, which makes it the hardest thing in this codebase to test — you
 * cannot wait until Tuesday to find out whether Tuesday works. Separating
 * "what should be going out at instant T" from "put it on the wire" means the
 * first is a table of inputs and expected outputs, and the second is ffmpeg
 * doing what ffmpeg does. Every scheduling fault worth having lives in the
 * first.
 *
 * THE SEGMENTS ARE THE STREAM, NOT THE WORK. A live HLS playlist has a
 * rolling window of a few seconds of transport, produced ahead of the
 * playhead and deleted behind it. Those are transport artefacts: they are
 * transient, they are windowed, they are named `stream/` and never `assets/`,
 * and deleting them loses nothing. That is what makes them not a violation of
 * the rule — a copy you cannot go back and watch is not a copy of the work,
 * it is the wire.
 */

import {
  type Channel, type Programme, type ProgrammeSource,
  gaps, orderedProgrammes, programmeStart, sourceKey, whatIsOn,
} from './channel.js';

/**
 * How long one segment of the broadcast stream is.
 *
 * Four seconds: the usual HLS compromise. Shorter cuts the delay between
 * something happening and somebody seeing it, and costs a playlist rewrite
 * and a keyframe more often; longer is cheaper and makes the channel feel
 * further away. Four is what a live channel that nobody is interacting with
 * wants.
 */
export const SEGMENT_MS = 4000;

/**
 * How much of the recent past the playlist still names.
 *
 * A viewer who joins mid-segment needs a few behind them to buffer; a viewer
 * whose train goes into a tunnel needs a few more. Six is twenty-four
 * seconds, which is the window every live player is built to expect.
 */
export const WINDOW_SEGMENTS = 6;

/**
 * How far behind the camera a live broadcast goes out.  [§7]
 *
 * A LIVE FEED CANNOT BE READ AHEAD OF ITSELF. The engine produces segments
 * two ahead of the playhead so a slow encode does not starve the playlist,
 * which is fine for a film that already exists and impossible for a camera
 * that has not recorded the next eight seconds yet. Asked for them anyway,
 * ffmpeg reads past the end of the growing file and puts out a fraction of a
 * second of picture followed by nothing.
 *
 * So live content is read from twelve seconds ago: the run-ahead, plus the
 * chunk interval, plus room for a browser that hiccups. That is the
 * glass-to-glass delay every HLS channel has and viewers never notice,
 * because there is nothing to compare it against — and it is declared here
 * rather than discovered as a stutter.
 */
export const LIVE_DELAY_MS = 12_000;

/**
 * ONE READ FROM ONE ASSET.
 *
 * The complete instruction: which reference, where in it to start, how long
 * to take, and where in the broadcast it lands. Everything the engine
 * produces is a list of these, and nothing in it names an output.
 */
export interface Read {
  /** Where in the broadcast this lands, as an instant in milliseconds. */
  atMs: number;
  /** How long to take from the source. */
  durationMs: number;
  /**
   * WHAT TO READ. A reference, exactly as the schedule stored it, passed
   * through untouched — so the thing that resolves references to paths is one
   * function in one place rather than a habit spread through the engine.
   */
  source: ProgrammeSource;
  /** Where in that media to start, on the media's own clock. */
  fromMs: number;
  /** The programme this read belongs to, for the listing and the log. */
  programmeId?: string;
  /**
   * A live feed the delay has not reached yet. The encoder puts a slate up.
   */
  notYet?: true;
  /**
   * Nothing is scheduled and there is no filler.
   *
   * Emitted rather than omitted, because a gap in the output is a decision
   * the channel made and the engine must be able to say so. A playout engine
   * that returned a shorter list for dead air would make dead air look like
   * the end of the schedule.
   */
  offAir?: true;
}

/**
 * What the channel is reading over a stretch of the broadcast day.  [§7]
 *
 * The whole engine. Walks the window, and for each moment answers with the
 * programme that owns it, the filler that covers the hole, or off-air — and
 * for each of those says where in the media to read from.
 *
 * `assetLengthMs` is asked for, not looked up: the domain does not decode.
 * Without it a programme that is shorter than its slot runs out and the rest
 * of the slot reads as off-air, which is exactly what would happen on the
 * wire — the engine describes the fault rather than papering over it.
 */
export function playoutWindow(
  channel: Channel, fromAt: number, toAt: number,
  assetLengthMs?: (source: ProgrammeSource) => number | undefined,
): Read[] {
  if (toAt <= fromAt) return [];
  const reads: Read[] = [];
  let cursor = fromAt;
  /*
   * A guard, not a limit. Every branch below advances the cursor, but a
   * duration that came out as zero — a rotation entry edited to nothing while
   * the engine was mid-window — would spin here forever, and a playout
   * process that stops responding is a channel off the air with no error
   * anywhere. It gives up on the window instead.
   */
  let steps = 0;

  while (cursor < toAt && steps < 10_000) {
    steps += 1;
    const on = whatIsOn(channel, cursor);

    if (on.kind === 'off') {
      /*
       * Only reachable when there is no rotation AND nothing scheduled. With
       * a rotation the channel is always online, which is the brief's point;
       * this is the empty channel, and it runs to the next programme or to
       * the end of the window.
       */
      const next = orderedProgrammes(channel)
        .find((entry) => programmeStart(entry) > cursor);
      const until = Math.min(next ? programmeStart(next) : toAt, toAt);
      reads.push(fillerRead(channel, cursor, Math.max(1, until - cursor), assetLengthMs));
      cursor = until > cursor ? until : toAt;
      continue;
    }

    if (on.kind === 'live' || on.kind === 'emergency' || on.kind === 'backup') {
      /*
       * A live feed has no end until somebody presses the button, so it is
       * read to the end of the window. Nothing else can be scheduled over it:
       * that is what pre-emption means. The emergency source is the same
       * shape — it stays up until an operator clears it — and is read the
       * same way, from its own beginning, because an apology slide starts at
       * the start. [§6]
       */
      /*
       * The delay applies to a live FEED, not to a segment rolled in over it
       * — a film played during a live show is an ordinary file and can be
       * read from wherever it likes. [§7]
       */
      const behind = on.kind === 'live' && on.source.kind === 'live'
        ? LIVE_DELAY_MS : 0;
      reads.push({
        atMs: cursor,
        durationMs: toAt - cursor,
        source: on.source,
        fromMs: Math.max(0, on.fromMs - behind),
        /*
         * Before the delay has elapsed there is nothing in the buffer yet.
         * Saying so lets the encoder put a slate up rather than read past the
         * end of a file that is still being written.
         */
        ...(on.fromMs < behind ? { notYet: true as const } : {}),
      });
      cursor = toAt;
      continue;
    }

    /* A programme or a turn of the rotation: both have an end and a length. */
    const slotEnd = Math.min(on.untilMs, toAt);
    const want = slotEnd - cursor;
    if (want <= 0) { cursor = Math.max(slotEnd, cursor + 1); continue; }

    const loops = on.kind === 'programme' ? on.programme.loop : on.entry.loop;
    const trimFrom = (on.kind === 'programme' ? on.programme.fromMs : on.entry.fromMs)
      ?? 0;
    const trimTo = on.kind === 'programme' ? on.programme.toMs : on.entry.toMs;
    const asset = assetLengthMs?.(on.source);
    const own = trimTo !== undefined ? Math.max(0, trimTo - trimFrom) : asset;
    const programmeId = on.kind === 'programme' ? on.programme.id : on.entry.id;
    /* How far into the slot this instant is, which `whatIsOn` already worked out. */
    const intoSlot = on.fromMs - trimFrom;

    if (loops && own !== undefined && own > 0) {
      /*
       * Ten minutes of film in a thirty-minute slot. The arithmetic that lets
       * something short hold a long turn without anybody cutting anything.
       */
      let at = cursor;
      let into = intoSlot % own;
      while (at < slotEnd) {
        const take = Math.min(own - into, slotEnd - at);
        if (take <= 0) break;
        reads.push({
          atMs: at, durationMs: take, source: on.source,
          fromMs: trimFrom + into, programmeId,
        });
        at += take;
        into = 0;
      }
      cursor = slotEnd;
      continue;
    }

    if (own !== undefined && intoSlot >= own) {
      /* It has run out. The rest of the slot is a hole like any other. */
      reads.push(fillerRead(channel, cursor, want, assetLengthMs, programmeId));
      cursor = slotEnd;
      continue;
    }
    const available = own === undefined ? want : Math.min(want, own - intoSlot);
    reads.push({
      atMs: cursor, durationMs: available, source: on.source,
      fromMs: trimFrom + intoSlot, programmeId,
    });
    cursor += available;
    if (available < want) {
      reads.push(fillerRead(
        channel, cursor, want - available, assetLengthMs, programmeId));
      cursor = slotEnd;
    }
  }

  return reads;
}

/**
 * What covers a hole.
 *
 * The filler, read from its own beginning and looped by the same modulus a
 * looping programme uses — filler that played once and then stopped would
 * turn one hole into a shorter hole. Off-air when there is none.
 */
function fillerRead(
  channel: Channel, atMs: number, durationMs: number,
  assetLengthMs?: (source: ProgrammeSource) => number | undefined,
  programmeId?: string,
): Read {
  if (!channel.filler) {
    return {
      atMs, durationMs, offAir: true, fromMs: 0,
      source: { kind: 'render', document: 'conversation', documentId: '', planHash: '' },
      ...(programmeId ? { programmeId } : {}),
    };
  }
  const length = assetLengthMs?.(channel.filler);
  return {
    atMs,
    durationMs,
    source: channel.filler,
    fromMs: length && length > 0 ? atMs % length : 0,
    ...(programmeId ? { programmeId } : {}),
  };
}

/* ------------------------------------------------------------------------ *
 *  The stream.  [§7]
 * ------------------------------------------------------------------------ */

/**
 * The instant a segment begins.
 *
 * Segments are aligned to the EPOCH rather than to the channel's first
 * programme, so every viewer of a channel computes the same boundaries and a
 * player that reconnects lands on a segment that already exists. Aligned to
 * the schedule instead, the boundaries would move whenever the first
 * programme moved, which is a live stream that stutters when somebody edits
 * tomorrow's listings.
 */
export function segmentIndexAt(atMs: number): number {
  return Math.floor(atMs / SEGMENT_MS);
}

export function segmentStart(index: number): number {
  return index * SEGMENT_MS;
}

/**
 * The live playlist, as text.  [§7]
 *
 * A rolling window ending at `now`, not including the segment now is in:
 * naming a segment that is still being produced is how a player gets a 404
 * and gives up. `EXT-X-PROGRAM-DATE-TIME` on the first entry is what makes a
 * player able to say what time it is watching, which a channel — unlike a
 * video — is expected to know.
 */
export function livePlaylist(
  nowMs: number, urlFor: (index: number) => string,
): string {
  const current = segmentIndexAt(nowMs);
  const first = Math.max(0, current - WINDOW_SEGMENTS);
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(SEGMENT_MS / 1000)}`,
    `#EXT-X-MEDIA-SEQUENCE:${first}`,
    `#EXT-X-PROGRAM-DATE-TIME:${new Date(segmentStart(first)).toISOString()}`,
  ];
  for (let index = first; index < current; index += 1) {
    lines.push(`#EXTINF:${(SEGMENT_MS / 1000).toFixed(3)},`);
    lines.push(urlFor(index));
  }
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------------ *
 *  What the schedule costs, which is the claim worth checking.
 * ------------------------------------------------------------------------ */

/**
 * How many DISTINCT assets a stretch of broadcast reads from.  [INV-17, D-18]
 *
 * The number that makes "never duplicate media merely because it is
 * scheduled" a testable claim rather than a promise. A day of programming
 * that repeats one film six times reads from one asset, and this returns one.
 * If it ever returns six, something has started copying.
 */
export function distinctAssetsRead(reads: Read[]): number {
  return new Set(
    reads.filter((read) => !read.offAir).map((read) => sourceKey(read.source)),
  ).size;
}

/** The stretches of a window that would go out as black. [§4] */
export function deadAir(
  channel: Channel, fromAt: number, toAt: number,
): { fromAt: number; toAt: number }[] {
  /*
   * A CHANNEL WITH A ROTATION HAS NO DEAD AIR, by construction: the rotation
   * covers every instant a fixed programme does not, and when it reaches the
   * end it starts again. That is the brief's "so your channel is always
   * online", stated as the function that would have to return something for
   * it to be untrue. [§4]
   */
  if (channel.rotation.length > 0 || channel.filler) return [];
  return gaps(channel, fromAt, toAt);
}
