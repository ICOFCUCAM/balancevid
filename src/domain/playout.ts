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
  /**
   * HOW MUCH MEDIA THE LIVE BUFFER ACTUALLY HOLDS.  [§7, §9, U-02]
   *
   * THE DELAY WAS A GUESS, AND `LIVE_DELAY_MS`'s OWN HEADER SAYS
   * WHAT IT IS GUESSING ABOUT: *"ffmpeg reads past the end of the
   * growing file and puts out a fraction of a second of picture
   * followed by nothing."* Twelve seconds is the margin chosen so
   * that never happens. It holds only while the buffer gains a
   * second of media for every second on the clock.
   *
   * IT DOES NOT, AND THE SHORTFALL IS PERMANENT. The browser
   * uploads two-second chunks and counts the ones it fails to
   * deliver — `useLiveEncoder`'s own `dropped`. Every dropped
   * chunk is two seconds the buffer will never contain while the
   * clock keeps running, and the camera takes a second or two to
   * start after the operator presses the button. Nothing gives any
   * of it back. Six dropped chunks across a broadcast and the read
   * point is past the end of the buffer for the rest of it.
   *
   * MEASURED, READING PAST THE END PRODUCES A ZERO-BYTE SEGMENT —
   * not black, not a held frame, nothing. The player stalls on the
   * last picture it decoded and the channel is frozen, with every
   * instrument green: the feed is arriving, the engine is beating,
   * bytes are landing. `watchTheFeed` asks whether the file is
   * GROWING. Nothing asked whether it had reached the place the
   * engine was about to read from.
   *
   * SO THE READ FOLLOWS THE BUFFER RATHER THAN THE CLOCK. Given
   * this, the live read is never placed past what the buffer holds;
   * when the buffer is behind, the delay grows and the picture
   * stays continuous, which is the trade live television has always
   * made. Asked of a measurer rather than measured, exactly as
   * `assetLengthMs` is: this file does not open files. [D-14]
   */
  liveReachMs?: (source: ProgrammeSource) => number | undefined,
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
      const need = toAt - cursor;
      /*
       * WHERE THE CLOCK SAYS, AND WHERE THE BUFFER ALLOWS.
       *
       * The clock's answer is the twelve-second delay. The buffer's
       * answer is how much media is actually in it, less the piece
       * about to be taken — read any later than that and ffmpeg
       * runs off the end, which is the zero-byte segment.
       *
       * The EARLIER of the two, always. Later is a frozen picture;
       * earlier is a viewer further behind live, which is a thing
       * nobody can see without a second screen to compare against.
       * A buffer nobody has measured keeps the old behaviour
       * exactly, so a reach of `undefined` changes nothing. [§7]
       */
      const wanted = Math.max(0, on.fromMs - behind);
      const reach = behind ? liveReachMs?.(on.source) : undefined;
      const allowed = reach === undefined || !Number.isFinite(reach)
        ? wanted : Math.max(0, Math.min(wanted, reach - need));
      /*
       * AND A BUFFER WITH LESS THAN ONE PIECE IN IT HAS NOTHING TO
       * GIVE. Before the measurement existed this could only be the
       * first twelve seconds of a broadcast; now it is also a feed
       * that has fallen too far behind to fill the slot, and the
       * answer is the same slate rather than a segment with no
       * frames in it.
       */
      const nothingYet = reach === undefined || !Number.isFinite(reach)
        ? on.fromMs < behind : reach < need;
      reads.push({
        atMs: cursor,
        durationMs: need,
        source: on.source,
        fromMs: allowed,
        ...(nothingYet ? { notYet: true as const } : {}),
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
    /*
     * A LENGTH THAT IS NOT A NUMBER IS NOT A LENGTH.  [U-02, D-14]
     *
     * `assetLengthMs` reads a probe, and a probe of a truncated or
     * malformed file answers `NaN`. Carried through, `NaN` loses
     * every comparison below — it is neither `> 0` nor `>=
     * intoSlot` — so it slipped past both guards and came out as
     * `Math.min(want, NaN)`: a read of `NaN` milliseconds, handed
     * to the encoder as `-t NaN`.
     *
     * Found by a test written for something else, which is the
     * only way anything finds this. Not-a-number means not known,
     * which this already has an answer for. [D-21]
     */
    const probed = assetLengthMs?.(on.source);
    const asset = probed !== undefined && Number.isFinite(probed) && probed >= 0
      ? probed : undefined;
    const own = trimTo !== undefined ? Math.max(0, trimTo - trimFrom) : asset;
    const programmeId = on.kind === 'programme' ? on.programme.id : on.entry.id;
    /* How far into the slot this instant is, which `whatIsOn` already worked out. */
    const intoSlot = on.fromMs - trimFrom;

    /*
     * IT WILL RUN OUT BEFORE THE SLOT DOES.  [§4, D-21, U-02]
     *
     * MEASURED ON A REAL CHANNEL, and it is the whole of why it was
     * dark. Every item in its loop was a five-second file sitting in
     * a slot of four to twenty-five minutes:
     *
     *     Station Ident    slot 960s    file 5.0s    black for 99.5%
     *     Morning Music    slot 1500s   file 5.0s    black for 99.7%
     *     ────────────────────────────────────────────────────────
     *     the loop ran 116 minutes and was black for 115 of them
     *
     * The viewer heard five seconds of each item and then nothing —
     * *"music plays and cuts while video does not display"* — and
     * every signal in the control room stayed green, because the
     * engine was running perfectly and writing exactly what it was
     * asked for.
     *
     * THE PRODUCT HAD TWO ANSWERS FOR THIS AND NEITHER WAS REACHABLE.
     * `loop` on the entry does precisely this, and its own comment
     * names the fault: *"for a short film in a long slot. Without it
     * a ten-minute programme in a thirty-minute slot is twenty
     * minutes of black, and black is the one thing a channel must
     * never broadcast by accident."* It was built, correct, accepted
     * by the API — and no surface in this product can set it, so
     * nought of eight entries had it. `filler` covers the hole
     * instead, and that channel had none.
     *
     * SO IT LOOPS WHEN THE ALTERNATIVE IS DEAD AIR. Not whenever it
     * is short: a channel WITH a filler has an operator who chose
     * what covers a hole, and overriding that would be this module
     * deciding it knows better. With no filler the only other answer
     * is black, and the flag's own sentence says what to do about
     * that.
     *
     * IT IS STILL WORTH TELLING SOMEBODY. An ident repeating
     * a hundred and ninety-two times is better than silence and
     * is nobody's intention either — `slotsOverrunning` reports it
     * so the duration can be fixed rather than papered over. [D-21]
     */
    /*
     * NO `runsShort` TEST, BECAUSE IT CHANGED NOTHING. This read
     * `intoSlot + want > own` first — "only loop once it would run
     * past the end" — and a mutation deleting it passed every
     * test, rightly: the branch below wraps with `intoSlot % own`,
     * and for media LONGER than the slot that is `intoSlot`
     * itself, producing exactly the read the ordinary path would.
     * A condition whose two sides cannot be told apart is not a
     * guard. Deleted rather than defended. [U-02]
     */
    if ((loops || !channel.filler) && own !== undefined && own > 0) {
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
