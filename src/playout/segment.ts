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

import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Channel } from '../domain/channel.js';
import {
  SEGMENT_MS, type Read, playoutWindow, segmentStart,
} from '../domain/playout.js';
import { HOUSE } from '../render/ingest.js';
import { ffmpeg, type RunOptions } from '../render/ffmpeg.js';
import { paths } from '../store/paths.js';
import { pathFor } from '../store/playoutSources.js';

/** What the stream looks like. Constant across every programme. */
export const STREAM = {
  width: 1280,
  height: 720,
  fps: HOUSE.fps,
  videoBitrate: '2500k',
  audioBitrate: '128k',
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
  opts: RunOptions = {},
): Promise<void> {
  const fromAt = segmentStart(index);
  const toAt = fromAt + SEGMENT_MS;
  const target = paths.channelSegment(channel.id, index);
  await mkdir(dirname(target), { recursive: true });

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
  for (const [ordinal, read] of reads.entries()) {
    const piece = `${target}.${ordinal}.part.ts`;
    /*
     * Each piece is written with its PTS already offset to where it lands
     * inside the segment, so the pieces are one continuous timeline before
     * they are joined rather than two clips that each start at zero.
     */
    await encodePiece(channel, read, piece, factsOf, read.atMs - fromAt, opts);
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
  await rename(temp, target);
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

/** One read, encoded into the house stream format. */
async function encodePiece(
  channel: Channel, read: Read, out: string,
  factsOf: (path: string) => SourceFacts | undefined,
  offsetMs: number,
  opts: RunOptions,
): Promise<void> {
  const seconds = (read.durationMs / 1000).toFixed(3);
  const path = read.offAir ? undefined : pathFor(channel, read.source);
  const facts = path ? factsOf(path) : undefined;

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
  if (!path || !facts) {
    await black(seconds, out, offsetMs, opts);
    return;
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
    ...(facts.hasAudio ? [] : silence),
    '-vf',
    `scale=${STREAM.width}:${STREAM.height}:force_original_aspect_ratio=decrease,`
      + `pad=${STREAM.width}:${STREAM.height}:(ow-iw)/2:(oh-ih)/2,`
      + `fps=${STREAM.fps},setsar=1`,
    '-map', '0:v:0',
    '-map', facts.hasAudio ? '0:a:0' : '1:a:0',
    '-t', seconds,
    ...encodeArgs(offsetMs),
    out,
  ], opts).catch(async () => {
    /*
     * A source that cannot be read is black, not a dead channel. The stream's
     * job at that moment is to keep going.
     */
    await black(seconds, out, offsetMs, opts);
  });
}

/** Four seconds of nothing, which is what a channel shows when it has none. */
async function black(
  seconds: string, out: string, offsetMs: number, opts: RunOptions,
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
