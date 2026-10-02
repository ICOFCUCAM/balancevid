/**
 * One segment of the broadcast stream.  [Doctrine CHANNEL §7, U-23, D-18]
 *
 * The place where the engine's arithmetic meets ffmpeg, and the only place in
 * Studio Three that writes bytes other than a live ingest or a requested
 * recording. What it writes is a TRANSPORT SEGMENT: four seconds of MPEG-TS
 * in `stream/`, named by its epoch-aligned index, swept away a few seconds
 * later. It is the wire, not the work — you cannot go back and watch it,
 * nothing references it, and deleting the whole directory loses nothing but
 * the next few seconds of playout.
 *
 * WHY MPEG-TS AND NOT fMP4. A transport stream can be cut anywhere and
 * concatenated by appending, which is what lets a segment that spans a
 * programme boundary be produced as two pieces and joined without a
 * remux — and a channel's segments span boundaries constantly, because
 * programmes do not begin on four-second multiples of the epoch.
 *
 * EVERY SEGMENT IS ENCODED THE SAME WAY, whatever it came from. A stream
 * whose codec parameters change at a programme boundary is a stream every
 * player stalls on, and "it only breaks at nine o'clock" is the worst kind of
 * fault to be handed. So the house format, every time, even when the source
 * already matches it.
 */

import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Channel } from '../domain/channel.js';
import {
  SEGMENT_MS, type Read, playoutWindow, segmentStart,
} from '../domain/playout.js';
import { whatIsOn } from '../domain/channel.js';
import { marksFor } from '../domain/identity.js';
/* The compositor's own three answers, which used to be private
   functions at the bottom of this file and so could be asked by
   nothing else — least of all by the lane whose job is to draw
   them. [D-19, C-47] */
import { intoProgramme, nextUp, onAirTitle } from '../domain/onAir.js';
import { overlayNow } from '../render/overlay.js';
import type { Mark } from '../domain/identity.js';
import { kbps, streamQuality } from '../domain/quality.js';
import { HOUSE } from '../render/ingest.js';
import {
  FfmpegError, type RunOptions, canDrawText, ffmpeg,
} from '../render/ffmpeg.js';
import { noteFailure, reasonFrom } from '../store/playoutHealth.js';
import type { Aired } from '../domain/asRun.js';
import { volumeFilter } from '../domain/loudness.js';
import {
  type Dip, afadeFilters, dipAt, fadeFilters,
} from '../domain/transition.js';
import { paths } from '../store/paths.js';
import { pathFor } from '../store/playoutSources.js';
import { libraryFile } from '../store/libraryMedia.js';

/**
 * What the stream looks like. Constant across every programme.
 *
 * Read once at import from the deployment's setting, and deliberately NOT
 * per segment: the constancy above is the invariant this whole file is built
 * around, and a value that could change between segment 4,102 and segment
 * 4,103 is a player stalling at an unreproducible moment. Restarting the
 * engine is the honest way to change the wire format.
 *
 * With nothing set this is 1280×720 at 2500k — the numbers that were written
 * here as literals before there was a table. [quality.ts]
 */
const WIRE = streamQuality();
export const STREAM = {
  width: WIRE.width,
  height: WIRE.height,
  fps: WIRE.fps,
  videoBitrate: kbps(WIRE.videoBitsPerSecond),
  audioBitrate: kbps(WIRE.audioBitsPerSecond),
} as const;

/**
 * Produce the segment with this index, if it is not already there.
 *
 * Idempotent by construction: the file is written to a temporary name and
 * renamed into place, so a playout process that restarts mid-segment leaves
 * no half-written four seconds for a player to choke on.
 */
export interface SourceFacts {
  durationMs: number;
  hasAudio: boolean;
}

export async function produceSegment(
  channel: Channel, index: number,
  factsOf: (path: string) => SourceFacts | undefined,
  /** What each file plays at, measured elsewhere. [C-33] */
  gainOf: (path: string) => number | undefined = () => undefined,
  opts: RunOptions = {},
/**
 * WHAT IT ACTUALLY PUT OUT, for the as-run.  [§5, C-32]
 *
 * Returned rather than looked up again afterwards, because this
 * function is the only place that knows BOTH what the schedule
 * asked for and whether the encoder managed it. An as-run derived
 * from the document would report a failed render as a perfect
 * programme, which is the one thing it exists not to do.
 */
): Promise<Aired> {
  const fromAt = segmentStart(index);
  const toAt = fromAt + SEGMENT_MS;
  const target = paths.channelSegment(channel.id, index);
  await mkdir(dirname(target), { recursive: true });

  /*
   * THE STATION'S MARKS, computed once for the segment from what is on air at
   * its start. Not per piece: a segment that spanned a programme boundary
   * would otherwise change its lower third halfway through four seconds,
   * which reads as a glitch rather than as a caption. [§13]
   */
  const marks = marksFor(
    channel.identity,
    whatIsOn(channel, fromAt),
    intoProgramme(channel, fromAt),
    (on) => onAirTitle(channel, on),
    nextUp(channel, fromAt),
    channel.name,
  );
  /*
   * AND WHETHER THIS BUILD CAN DRAW THEM.  [C-24]
   *
   * Asked of the binary rather than assumed of it. The answer is
   * cached for the life of the process, so this is one spawn at
   * startup and a map lookup four times a second after that.
   */
  const canText = await canDrawText();
  /*
   * AND THE MARKS, DRAWN.  [§13, C-40]
   *
   * A transparent PNG of this channel's own graphics, by the
   * renderer the slides already use. Asked for, never waited for:
   * the first segment wanting a new overlay goes out without it and
   * the next one has it, which is the same bargain the loudness
   * queue makes (C-33) and for the same reason — a channel that
   * paused for a browser to start would stutter every time its
   * caption changed.
   */
  const overlay = overlayNow(marks, STREAM, paths.overlays(),
    /* A logo names a library asset; the store turns it into a file. */
    (assetId) => libraryFile(assetId, { moving: false })?.path);

  const reads = playoutWindow(channel, fromAt, toAt, (source) => {
    const path = pathFor(channel, source);
    return path ? factsOf(path)?.durationMs : undefined;
  });

  /*
   * ONE PIECE PER READ, then joined. The common case is one read and one
   * piece, and the join is skipped — a concat of one file is a pointless
   * decode of four seconds every four seconds, on a machine that has to keep
   * up with real time.
   */
  const pieces: string[] = [];
  let fellBackHere = false;
  /*
   * WHAT IS ON EITHER SIDE OF EACH READ, so a join can be told from
   * a split. `playoutWindow` divides a segment wherever the answer
   * changes AND wherever one has to be read in parts, and only the
   * first of those is a transition. [C-34]
   */
  const whatsOn = reads.map((read) => whatIsOn(channel, read.atMs));
  for (const [ordinal, read] of reads.entries()) {
    const piece = `${target}.${ordinal}.part.ts`;
    /*
     * Each piece is written with its PTS already offset to where it lands
     * inside the segment, so the pieces are one continuous timeline before
     * they are joined rather than two clips that each start at zero.
     */
    const level = read.offAir ? null : volumeFilter(
      gainOf(pathFor(channel, read.source) ?? '') ?? 0);
    /*
     * A DIP AT EACH END THAT IS A JOIN.  [§5, C-34]
     *
     * The incoming side is faded up when the piece BEFORE it is a
     * different thing; the outgoing side faded down when the piece
     * AFTER it is. A segment that is all one programme has neither,
     * and the commonest segment is exactly that — so the filters
     * are absent four times out of five and the encode is as it
     * was.
     *
     * A BOUNDARY AT THE SEGMENT'S OWN EDGE IS NOT SEEN HERE, and
     * that is a real limit rather than an oversight: the engine
     * produces each segment independently, so the piece before this
     * one is in a file that was written four seconds ago. Joins are
     * dipped where they fall INSIDE a segment, which is most of
     * them, and cut where they fall exactly on the boundary. Said
     * plainly rather than papered over.
     */
    const mine = whatsOn[ordinal]!;
    const before = ordinal > 0 ? whatsOn[ordinal - 1] : undefined;
    const after = whatsOn[ordinal + 1];
    const dip = {
      inMs: before ? dipAt({
        leaving: before, arriving: mine,
        leavingMs: reads[ordinal - 1]!.durationMs, arrivingMs: read.durationMs,
      }).inMs : 0,
      outMs: after ? dipAt({
        leaving: mine, arriving: after,
        leavingMs: read.durationMs, arrivingMs: reads[ordinal + 1]!.durationMs,
      }).outMs : 0,
    };
    if (await encodePiece(channel, read, piece, factsOf, read.atMs - fromAt,
      marks, canText, overlay, level, dip, opts)) {
      fellBackHere = true;
    }
    pieces.push(piece);
  }

  const temp = `${target}.tmp.ts`;
  if (pieces.length === 1) {
    await rename(pieces[0]!, temp);
  } else {
    /*
     * JOINED BY APPENDING BYTES, which is the property MPEG-TS was chosen
     * for: a transport stream is a sequence of 188-byte packets and two of
     * them back to back are one of them. No decode, no process, no remux —
     * which matters on a machine that has to stay ahead of real time.
     *
     * The concat demuxer would also work in principle and was tried first; on
     * this platform's static ffmpeg it segfaults on `-c copy` over MPEG-TS,
     * which is a good reminder that reaching for a tool to do what a
     * `cat` does is a dependency taken for nothing.
     */
    await appendAll(pieces, temp);
    await Promise.all(pieces.map((piece) => rm(piece, { force: true })));
  }

  /*
   * A SEGMENT WITH NOTHING IN IT IS WORSE THAN BLACK.  [§7]
   *
   * ffmpeg can exit successfully having written no packets — the commonest
   * cause is reading a live buffer past its end, which happens whenever the
   * camera falls behind the delay, and it will happen. A player handed a
   * zero-byte segment does not show black, it stalls and often gives up on
   * the stream; a player handed four seconds of black carries on and
   * recovers when the feed does.
   *
   * So the length is checked rather than assumed. This is the last thing
   * between the engine and the wire, and it is the one place that can promise
   * every segment is playable.
   */
  const made = await stat(temp).catch(() => null);
  if (!made || made.size < 1024) {
    await rm(temp, { force: true });
    await black((SEGMENT_MS / 1000).toFixed(3), temp, 0, marks, opts);
    /*
     * AND THIS COUNTS. ffmpeg exiting successfully having written no
     * packets is the commonest way a channel goes quietly black —
     * the fallback above catches errors, and this catches silence.
     * An as-run that recorded only the loud failures would miss the
     * ones that matter most. [C-24, C-32]
     */
    fellBackHere = true;
  }
  await rename(temp, target);

  /*
   * WHAT WENT OUT, named as it was named at the time. Titles get
   * edited; an as-run row says what the thing was called when it
   * was broadcast, which is the question a rights holder asks.
   */
  const on = whatIsOn(channel, fromAt);
  return {
    index,
    source: on.kind === 'off' ? null : on.source,
    title: on.kind === 'off' ? 'Off air' : onAirTitle(channel, on),
    fellBack: fellBackHere,
  };
}

/** Byte-append, in order, through a stream so a long segment is not buffered. */
async function appendAll(pieces: string[], out: string): Promise<void> {
  const { createReadStream, createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const sink = createWriteStream(out);
  try {
    for (const piece of pieces) {
      await pipeline(createReadStream(piece), sink, { end: false });
    }
  } finally {
    await new Promise<void>((resolve) => { sink.end(resolve); });
  }
}

/**
 * The station's marks, as ffmpeg filters.  [§13]
 *
 * Exported for the test rather than for a caller: a wrong filter string does
 * not produce a wrong caption, it fails the segment and puts the channel to
 * black, and that is not a fault worth discovering from a black screen.
 *
 * The identity decides WHAT; this knows HOW. Text is escaped for drawtext,
 * which is a filter-graph language with its own opinions about colons and
 * apostrophes — an unescaped programme title called "Verse 1: the beginning"
 * would not produce a wrong caption, it would fail the whole segment and put
 * the channel to black.
 */
/**
 * THE COMPOSITOR'S FIRST CHOICE, AND WHY IT IS NOT `drawtext`.
 * [§13, D-16, C-24, C-40]
 *
 * An overlay drawn by the browser this product already uses beats
 * `drawtext` on every axis that matters: it is the same picture on
 * every build rather than whatever font the binary happened to
 * find, it can put a name over a role, and it works on the binary
 * that ships — which cannot draw a single character. One composite
 * instead of four text filters, too.
 *
 * `movie` loads the PNG inside a plain `-vf`, so the graph still has
 * ONE external input and one output and every `-map` below is
 * untouched. It is the idiom ffmpeg's own documentation uses for a
 * watermark, and both filters are present in the pinned build —
 * asked, by doing it, before any of this was written. [C-35's lesson]
 *
 * THE CHAINS ARE JOINED WITH `;` AND THE FILTERS WITH `,`, which is
 * the distinction that makes this one function rather than a list
 * the caller joins: a graph with a second source cannot be a comma
 * list, and a caller that forgot would produce a filtergraph ffmpeg
 * rejects whole — the exact failure C-24 is about.
 */
export function videoChain(
  filters: readonly string[], overlay?: string,
): string {
  const chain = filters.join(',');
  if (!overlay) return chain;
  /*
   * THE PATH IS ESCAPED FOR A FILTERGRAPH, where a colon separates
   * options and a backslash escapes. Ours are hex names under
   * `var/` and contain neither — escaped anyway, because the day one
   * does is the day the whole graph is rejected and the picture goes
   * black.
   */
  const named = overlay.replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:').replace(/'/g, "\\'");
  return `${chain}[bv_bg];movie=${named}[bv_marks];`
    + '[bv_bg][bv_marks]overlay=0:0';
}

export function markFilters(marks: Mark[], canDrawText: boolean): string[] {
  /*
   * NOTHING, WHEN THE BINARY CANNOT DRAW TEXT.  [C-24]
   *
   * `drawtext` needs freetype and the pinned `ffmpeg-static` is built
   * without it. A filtergraph naming a filter that is not there is
   * REJECTED WHOLE — so the station bug did not quietly fail to
   * appear, it took the segment with it, and `encodePiece`'s fallback
   * put four seconds of black on the wire. Every segment. For as long
   * as the channel had an identity.
   *
   * A channel with no bug is a working channel. A black one is not.
   * So where the text cannot be drawn, none of it is emitted — and
   * the operator is told why, by the failure the health store now
   * records, rather than by watching their own transmission.
   *
   * AND THE PLATE GOES WITH IT. A box is drawable without freetype,
   * and a black rectangle where a name should be is worse than clean
   * video: it looks deliberate.
   */
  /*
   * REQUIRED, NOT DEFAULTED. A default of `true` passed the sweep only
   * because nothing exercised it, and a default of `true` is exactly
   * the assumption that cost the product its picture. Every caller
   * states what it found out.
   */
  if (!canDrawText) return [];
  const pad = 28;
  /* The lower marks stack upward, so NEXT sits under the title. */
  let lowerLeft = 0;
  let inRegion = 0;
  return marks.map((mark) => {
    const size = Math.round((mark.size / 720) * STREAM.height);
    const box = mark.plate
      ? `:box=1:boxcolor=black@0.55:boxborderw=${Math.round(size * 0.45)}`
      : '';
    let x = `${pad}`;
    let y = `${pad}`;
    /*
     * A REGION BEATS A CORNER.  [CHANNEL §27, C-20]
     *
     * The set drew a rectangle where its furniture is not, and the
     * whole reason it exists is that `bottom-left` is the front of
     * the desk. Fractions of the frame, turned into pixels here and
     * nowhere else — `STREAM` is the only place that knows how big a
     * frame is.
     *
     * NO EXTRA INSET. The rectangles already carry their own margin
     * (every set's is x: 0.04 or wider), and padding a padded
     * rectangle would move the caption off the strip it was drawn to
     * sit on.
     *
     * The stack still runs upward from the bottom of the region, so
     * a title and its NEXT keep the order they have in a corner —
     * counted separately, because a mark in a region and a mark in a
     * corner are not in each other's way.
     */
    if (mark.at) {
      const left = Math.round(mark.at.x * STREAM.width);
      const floor = Math.round((mark.at.y + mark.at.h) * STREAM.height);
      x = `${left}`;
      y = `${floor - inRegion}-th`;
      inRegion += size * 2;
      return `drawtext=text='${escapeDrawText(mark.text)}'`
        + `:fontcolor=${mark.ink}@${mark.opacity.toFixed(2)}`
        + `:fontsize=${size}:x=${x}:y=${y}${box}`;
    }
    if (mark.corner === 'top-right' || mark.corner === 'bottom-right') {
      x = `w-tw-${pad}`;
    }
    if (mark.corner === 'bottom-left' || mark.corner === 'bottom-right') {
      const lift = pad + lowerLeft;
      y = `h-th-${lift}`;
      lowerLeft += size * 2;
    }
    return `drawtext=text='${escapeDrawText(mark.text)}'`
      + `:fontcolor=${mark.ink}@${mark.opacity.toFixed(2)}`
      + `:fontsize=${size}:x=${x}:y=${y}${box}`;
  });
}

/**
 * drawtext's escaping, which is not a string's escaping.
 *
 * A colon separates the filter's own options and a single quote ends the
 * text; both appear in ordinary programme titles. A backslash has to go first
 * or it escapes the escapes.
 */
function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\u2019")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .slice(0, 120);
}

/** One read, encoded into the house stream format. */
async function encodePiece(
  channel: Channel, read: Read, out: string,
  factsOf: (path: string) => SourceFacts | undefined,
  offsetMs: number,
  marks: Mark[],
  canText: boolean,
  /** The marks as a transparent PNG, when one has been drawn. [C-40] */
  overlay: string | undefined,
  /** The item's measured level correction, if anybody has one. [C-33] */
  gain: string | null,
  /** How to dip in and out of this piece, if either end is a join. [C-34] */
  dip: Dip,
  opts: RunOptions,
/**
 * TRUE WHEN IT PUT BLACK OUT INSTEAD OF WHAT WAS ASKED FOR.
 *
 * Reported rather than merely survived, because the as-run has to
 * say so: those four seconds were black on the wire and perfect in
 * the document, which is exactly the gap a log derived from the
 * schedule could not show. [C-24, C-32]
 */
): Promise<boolean> {
  let broke = false;
  const seconds = (read.durationMs / 1000).toFixed(3);
  const path = read.offAir ? undefined : pathFor(channel, read.source);
  const facts = path ? factsOf(path) : undefined;
  /*
   * A STILL IS HELD, NOT PLAYED.  [§3]
   *
   * A caption card has no duration of its own, so `-loop 1` holds the one
   * frame for the slot and silence rides underneath it. Its own branch
   * because everything below assumes a file with a clock in it — seeking a
   * JPEG to four seconds in produces nothing at all, which on air is black
   * where a station ident should be.
   */
  if (path && read.source.kind === 'media' && read.source.form === 'image') {
    await ffmpeg([
      '-y',
      '-loop', '1', '-framerate', String(STREAM.fps), '-i', path,
      '-f', 'lavfi', '-i',
      `anullsrc=channel_layout=stereo:sample_rate=${HOUSE.audioSampleRate}`,
      '-t', seconds,
      /*
       * AND A STILL CARRIES THE CHANNEL'S MARKS TOO.  [§13, C-40]
       *
       * This branch drew none. A slide, a caption card or a station
       * ident went out with no bug and no LIVE lamp — on the one
       * kind of picture where there is nothing else to tell a viewer
       * whose channel this is. It was not a decision; the branch was
       * written before the identity existed and never caught up.
       */
      '-vf', videoChain([
        `scale=${STREAM.width}:${STREAM.height}`
          + ':force_original_aspect_ratio=decrease',
        `pad=${STREAM.width}:${STREAM.height}:(ow-iw)/2:(oh-ih)/2`,
        'setsar=1',
        ...markFilters(marks, canText),
      ], overlay),
      '-map', '0:v:0', '-map', '1:a:0',
      ...encodeArgs(offsetMs),
      out,
    ], opts).catch(async (error: unknown) => {
      await fellBack(channel.id, error);
      await black(seconds, out, offsetMs, marks, opts);
      broke = true;
    });
    return broke;
  }

  /*
   * OFF AIR IS SOMETHING, NOT NOTHING.
   *
   * A channel with a hole in its schedule must still put four seconds on the
   * wire, or every player treats the gap as the end of the stream and stops.
   * Black and silence, generated — which is also the honest picture: the
   * channel has nothing to show and says so by showing nothing.
   *
   * A missing render takes this path too. A programme whose media has been
   * deleted goes out as black rather than taking the channel off the air,
   * and INV-17's second half is what tells somebody why. A source we could
   * not probe is treated the same, because a file we cannot measure is a file
   * we cannot cut four seconds out of with any confidence.
   */
  /*
   * A LIVE FEED IS NOT MEASURED, IT IS FOLLOWED. A growing file has no
   * duration to probe and probing one would cache whatever length it happened
   * to have a minute ago — so live skips the facts check entirely and is read
   * at the offset the engine computed, which is the delay's whole purpose.
   */
  const following = read.source.kind === 'live' && !read.notYet;
  if (!path || (!facts && !following)) {
    /*
     * NOT A FALLBACK. A channel with nothing scheduled is black by
     * design (`whyDark`, C-28's `expectsPicture`), and counting it
     * as a render failure would fill the as-run's black column with
     * every gap between two programmes. The other kind — a source
     * that existed and could not be rendered — is below. [C-24]
     */
    await black(seconds, out, offsetMs, marks, opts);
    return false;
  }

  /*
   * `-ss` BEFORE `-i`, which seeks by keyframe and is the only form fast
   * enough to keep up with real time — a channel that decoded from the start
   * of a forty-minute film for every four seconds of output would fall behind
   * within one programme. The cost is landing on the nearest keyframe, which
   * the house format puts one second apart (HOUSE.gopSeconds).
   *
   * WHERE THE AUDIO COMES FROM is decided here, from a measurement, rather
   * than with a `?` on a map. A source with no audio track gets generated
   * silence, so every piece carries both streams and the concatenation has
   * nothing to reconcile — and `-map 0:a:0?`, which looks like it does this,
   * silently produces a piece with no audio instead, which is a stream whose
   * audio track appears and disappears at programme boundaries.
   */
  const silence = [
    '-f', 'lavfi', '-i',
    `anullsrc=channel_layout=stereo:sample_rate=${HOUSE.audioSampleRate}`,
  ];
  await ffmpeg([
    '-y',
    '-accurate_seek', '-ss', (read.fromMs / 1000).toFixed(3),
    '-t', seconds,
    '-i', path,
    /* A live feed always carries the microphone; a file says whether it does. */
    ...((facts?.hasAudio ?? following) ? [] : silence),
    '-vf',
    videoChain([
      `scale=${STREAM.width}:${STREAM.height}:force_original_aspect_ratio=decrease`,
      `pad=${STREAM.width}:${STREAM.height}:(ow-iw)/2:(oh-ih)/2`,
      `fps=${STREAM.fps}`,
      'setsar=1',
      /*
       * THE DIP, BEFORE THE MARKS AND NOT AFTER.  [§13, D-16, C-34]
       *
       * The bug and the lower third are composited onto the
       * outgoing frame by this same chain, and a fade applied
       * after them takes the station's own identity down with the
       * picture. A viewer watching a channel dip between
       * programmes sees the picture go and the bug stay, because
       * the bug is the channel and the channel did not go
       * anywhere.
       */
      ...fadeFilters(dip, read.durationMs),
      /* The identity, over the picture and never inside it. [§13, D-16] */
      ...markFilters(marks, canText),
    ], overlay),
    '-map', '0:v:0',
    '-map', (facts?.hasAudio ?? following) ? '0:a:0' : '1:a:0',
    /*
     * THE ITEM'S OWN LEVEL, CORRECTED.  [§5, §10, C-33]
     *
     * One constant gain, measured over the whole item somewhere
     * else and applied here — not `loudnorm`, which over four
     * seconds normalises each segment to its own contents and makes
     * the programme breathe at every boundary. Absent until
     * somebody has measured the file, and absent for ever on
     * generated silence, which has nothing to correct.
     */
    ...((() => {
      const sound = [
        ...(gain ? [gain] : []),
        ...afadeFilters(dip, read.durationMs),
      ];
      return sound.length ? ['-af', sound.join(',')] : [];
    })()),
    '-t', seconds,
    ...encodeArgs(offsetMs),
    out,
  ], opts).catch(async (error: unknown) => {
    /*
     * A source that cannot be read is black, not a dead channel. The stream's
     * job at that moment is to keep going.
     *
     * AND IT SAYS SO NOW. Keeping going is right; keeping quiet was
     * not — the fallback succeeds, so a channel rendering black four
     * seconds at a time read as healthy for as long as it did it.
     * [C-24]
     */
    await fellBack(channel.id, error);
    await black(seconds, out, offsetMs, marks, opts);
    broke = true;
  });
  return broke;
}

/**
 * The engine had a source, asked for it, and was refused.
 *
 * Narrower than "a black segment" on purpose: a channel with nothing
 * scheduled is black by design and `whyDark` already explains that.
 * This is the other kind, and it had no signal at all.
 */
async function fellBack(channelId: string, error: unknown): Promise<void> {
  const said = error instanceof FfmpegError ? error.stderr : String(error);
  await noteFailure(channelId, reasonFrom(said));
}

/** Four seconds of nothing, which is what a channel shows when it has none. */
async function black(
  seconds: string, out: string, offsetMs: number, marks: Mark[], opts: RunOptions,
): Promise<void> {
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i',
    `color=c=black:s=${STREAM.width}x${STREAM.height}:r=${STREAM.fps}`,
    '-f', 'lavfi', '-i',
    `anullsrc=channel_layout=stereo:sample_rate=${HOUSE.audioSampleRate}`,
    '-t', seconds,
    ...encodeArgs(offsetMs),
    out,
  ], opts);
}

/**
 * The house stream format, identical for every piece.
 *
 * A keyframe at the start of every segment (`-g` equal to the segment, and
 * `-force_key_frames` at zero) so a player joining mid-window can start
 * decoding immediately rather than showing grey until the next one.
 */
function encodeArgs(offsetMs = 0): string[] {
  return [
    /*
     * Where this piece sits inside its segment. Without it two appended
     * pieces both start at zero and a player sees the second half of the
     * segment jump backwards in time — which is a stall at every programme
     * boundary and at every turn of a loop.
     */
    '-output_ts_offset', (offsetMs / 1000).toFixed(3),
    '-c:v', HOUSE.videoCodec, '-profile:v', 'main', '-preset', 'veryfast',
    '-b:v', STREAM.videoBitrate, '-maxrate', STREAM.videoBitrate,
    '-bufsize', '5000k', '-pix_fmt', HOUSE.pixelFormat,
    '-g', String(STREAM.fps * (SEGMENT_MS / 1000)),
    '-force_key_frames', 'expr:eq(n,0)',
    '-c:a', HOUSE.audioCodec, '-b:a', STREAM.audioBitrate,
    '-ar', String(HOUSE.audioSampleRate), '-ac', String(HOUSE.audioChannels),
    '-muxdelay', '0', '-muxpreload', '0',
    '-f', 'mpegts',
  ];
}

/** Where the stream's files live, for the sweeper and the route. */
export function streamDir(channelId: string): string {
  return paths.channelStream(channelId);
}

export function segmentName(index: number): string {
  return join(`${index}.ts`);
}
