/**
 * One segment of an ALTERNATE audio rendition.
 *   [Doctrine CHANNEL §7, §17, D-19, TV-NETWORK N-10]
 *
 * > *"i plan for multitrack audio which is wise to include so it
 * > would not complecate in feature. however subscribers would
 * > have to pay extra for this special feature"*
 *
 * THE BYTES THE MASTER PLAYLIST HAS BEEN WAITING FOR. `hls.ts`
 * builds the `EXT-X-MEDIA` lines, the routes serve them and the
 * player draws the picker — and all three have been correct and
 * inert, because nothing wrote a second audio stream to disk.
 * `renditions()` refuses to advertise a language the engine is
 * not producing, so the whole feature has been one function
 * short of working. This is that function.
 *
 * THE SAME WALK, A DIFFERENT ENCODER, AND THAT IS THE DIVISION
 * THAT MATTERS. `playoutWindow` decides what is on air across a
 * segment — the loop, the programme boundaries, the clipping,
 * the live feed — and a second opinion about any of that would
 * be a rendition that drifts out of step with the picture it
 * accompanies. So the walk is imported, not rewritten. What is
 * NOT shared is `encodePiece`, and deliberately: that function
 * scales, pads, composites the station's marks, holds a still
 * for its slot and fades the PICTURE between programmes. An
 * audio rendition does none of those, and threading an
 * `audioOnly` flag through all of it would make the one
 * function on the wire's critical path harder to read for the
 * benefit of the one that is not. [D-19]
 *
 * WHICH SOURCE STREAM IS WHICH LANGUAGE.  `station.audio` is an
 * ORDERED list and its order IS the mapping: the first entry is
 * the track already muxed into the picture, the second is
 * `0:a:1`, the third `0:a:2`. A broadcaster who schedules media
 * with its languages in a different order gets the wrong one,
 * which is why `setStation` keeps the list the broadcaster
 * wrote rather than sorting it — their order is the fact being
 * recorded.
 *
 * A SOURCE WITHOUT THAT STREAM GETS SILENCE, NOT A HOLE. A
 * channel carrying three languages will schedule media that has
 * one, because most media has one. The alternatives are a
 * segment that 404s — which stalls a player and reads to a
 * viewer as a broken connection — or four seconds of quiet,
 * which is true: the broadcaster scheduled something with no
 * French on it. [U-19, D-21]
 */

import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Channel } from '../domain/channel.js';
import type { AudioTrack } from '../domain/station.js';
import { SEGMENT_MS, type Read, playoutWindow, segmentStart } from '../domain/playout.js';
import { volumeFilter } from '../domain/loudness.js';
import { HOUSE } from '../render/ingest.js';
import { type RunOptions, ffmpeg } from '../render/ffmpeg.js';
import { pathFor } from '../store/playoutSources.js';
import { paths } from '../store/paths.js';
import { streamQuality } from '../domain/quality.js';
import { kbps } from '../domain/quality.js';
import type { SourceFacts } from './segment.js';

/** What an alternate rendition is encoded at. */
const WIRE = streamQuality();

/**
 * The alternates a channel is meant to be writing.
 *
 * THE FIRST ENTRY IS NEVER ONE. It is the track muxed into the
 * picture, which the master playlist describes with no `URI` —
 * the whole reason a channel gains languages without a second
 * video encode. Writing it again would be the same audio on the
 * disk twice and in the playlist twice.
 *
 * THE DEFAULT IS THE FIRST ENTRY OR THE ONE MARKED, which is
 * the same rule `renditions()` applies on the way out. Two
 * places deciding which track is the default is two places that
 * can disagree about which language a viewer hears.
 */
export function alternatesOf(channel: Channel): { language: string; stream: number }[] {
  const tracks: AudioTrack[] = channel.station?.audio ?? [];
  /*
   * NO `tracks.length < 2` SHORTCUT, AND THAT IS NOT AN
   * OVERSIGHT. It read well and no mutation could kill it: a
   * station with one track yields the one stream the filter
   * below removes, and a station with none yields nothing to
   * filter. An untested guard against a case the next three
   * lines forbid is a guard nobody can check — the lesson
   * `piecesOf` and `withBookings` both learned. [the twenty-first]
   */
  const first = Math.max(0, tracks.findIndex((one) => one.default === true));
  /*
   * NOT FOLDED HERE, BECAUSE IT IS ALREADY FOLDED. The directory
   * on disk, the `EXT-X-MEDIA` line and the route that serves it
   * all spell the language in lower case, and `FR` written into
   * `audio/FR/` while the route reads `audio/fr/` is a 404 per
   * segment behind a picker that offers the language. But
   * `setStation` folds and validates the tag on the way IN —
   * `/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/` after `.toLowerCase()`
   * — so a saved channel cannot carry `FR` at all. A
   * `.toLowerCase()` here survived every mutation for that
   * reason, and two places folding is two places that can
   * disagree about which one is responsible. The end-to-end
   * property is asserted in the test instead, where a change to
   * `setStation` that stopped folding would be caught. [D-19]
   */
  return tracks
    .map((one, stream) => ({ language: one.language, stream }))
    .filter((one) => one.stream !== first);
}

/**
 * Produce every alternate rendition for this segment.
 *
 * ALL OF THEM OR NONE OF THE PICTURE'S TIME. Called AFTER the
 * video segment is written and never before: the picture is
 * what a channel is, and an engine that spent its four seconds
 * on a French audio track and missed the frame would have got
 * the priority exactly backwards.
 *
 * ONE FAILURE DOES NOT TAKE THE OTHERS. A language whose encode
 * fails is a language with a missing segment for four seconds,
 * which a player rides out; stopping would lose every language
 * including the ones that worked.
 */
export async function produceRenditions(
  channel: Channel, index: number,
  factsOf: (path: string) => SourceFacts | undefined,
  gainOf: (path: string) => number | undefined = () => undefined,
  opts: RunOptions = {},
  /* The same measurement the picture walks with, so the alternate
     audio cannot be reading a different instant of the same live
     buffer. [segment.ts, playout.ts `liveReachMs`] */
  liveReachMs?: number,
): Promise<string[]> {
  const alternates = alternatesOf(channel);
  if (alternates.length === 0) return [];

  const fromAt = segmentStart(index);
  const toAt = fromAt + SEGMENT_MS;
  const reads = playoutWindow(channel, fromAt, toAt, (source) => {
    const path = pathFor(channel, source);
    return path ? factsOf(path)?.durationMs : undefined;
  }, () => liveReachMs);

  const made: string[] = [];
  for (const alternate of alternates) {
    const ok = await produceOne(
      channel, index, alternate, reads, factsOf, gainOf, opts)
      .catch(() => false);
    if (ok) made.push(alternate.language);
  }
  return made;
}

async function produceOne(
  channel: Channel, index: number,
  alternate: { language: string; stream: number },
  reads: Read[],
  factsOf: (path: string) => SourceFacts | undefined,
  gainOf: (path: string) => number | undefined,
  opts: RunOptions,
): Promise<boolean> {
  const target = paths.channelAudioSegment(channel.id, alternate.language, index);
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.tmp.ts`;
  const pieces: string[] = [];

  try {
    for (const [ordinal, read] of reads.entries()) {
      const piece = `${target}.${ordinal}.part.ts`;
      await encodeAudioPiece(
        channel, read, piece, alternate.stream, factsOf, gainOf,
        read.atMs - segmentStart(index), opts);
      pieces.push(piece);
    }

    if (pieces.length === 1) await rename(pieces[0]!, temp);
    else await appendAll(pieces, temp);

    /*
     * THE SAME FLOOR THE PICTURE HAS, and the same one no test
     * can reach. ffmpeg can exit successfully having written no
     * packets, and a player handed a zero-byte segment does not
     * fall back to the default audio — it stalls on the
     * rendition it chose. Four seconds of AAC is sixty-odd
     * kilobytes and there is no input this engine will accept
     * that makes it smaller, so a mutation removing this line
     * survives — exactly as it survives on `encodePiece`'s own
     * `< 1024` beside it. It is kept because it guards a
     * PRODUCTION fault rather than an input: an encoder that
     * succeeded and wrote nothing. Deleting one would mean
     * deleting both, on a wire where the symptom is silent.
     * [§7, segment.ts]
     */
    const written = await stat(temp).catch(() => null);
    if (!written || written.size < 512) {
      await rm(temp, { force: true });
      await silentSegment(temp, opts);
    }
    await rename(temp, target);
    return true;
  } finally {
    await Promise.all(pieces.map((one) => rm(one, { force: true })));
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

/**
 * One read, as audio alone.
 *
 * WHETHER THE STREAM IS THERE IS A QUESTION FOR THE
 * MEASUREMENT, NOT FOR ffmpeg.
 *
 * This was `-map 0:a:<n>? -map 1:a:0? -shortest`, on the belief
 * that the optional map falls through to a silence input. It
 * does not, in either direction, and both ways were wrong:
 *
 *   · where the file HAS the stream, both maps resolve and the
 *     segment goes out with TWO audio tracks, which is the
 *     second encode this design exists to avoid, on the
 *     rendition that was supposed to be cheap;
 *   · where it does NOT, the only stream left is `anullsrc`,
 *     which is infinite, and `-shortest` has nothing finite to
 *     be short of — so the encode never returns and the engine
 *     stops advancing the channel. A two-minute test timeout
 *     is how that was found; in production it is a dead stream.
 *
 * `SourceFacts` now COUNTS the audio streams instead of testing
 * for one, which the probe was walking the list to do anyway,
 * so the branch is decided before ffmpeg is asked. A file whose
 * facts are unknown is a file this engine could not read, and
 * claiming a French track on it would be the honest answer's
 * opposite. [U-19, D-21]
 */
async function encodeAudioPiece(
  channel: Channel, read: Read, out: string, stream: number,
  factsOf: (path: string) => SourceFacts | undefined,
  gainOf: (path: string) => number | undefined,
  offsetMs: number,
  opts: RunOptions,
): Promise<void> {
  const seconds = (read.durationMs / 1000).toFixed(3);
  /*
   * `encodePiece`'s OWN LINE, KEPT IDENTICAL. A reader checking
   * that the rendition and the picture agree about what is on
   * air should find the same sentence in both. Mutation shows
   * the measurement below would answer anyway — `playoutWindow`
   * gives an off-air read an empty filler source, which resolves
   * to no facts and so to no streams — but that is a fact about
   * `fillerRead` rather than about this function, and what this
   * line says is what the function IS: dead air is silent in
   * every language. [segment.ts]
   */
  const path = read.offAir ? undefined : pathFor(channel, read.source);

  /*
   * A STILL HAS NO AUDIO AT ALL, in any language. The picture
   * branch holds one frame for the slot; here there is nothing
   * to hold, so the slot is quiet — which is what the muxed
   * track is doing underneath it too.
   */
  const still = read.source.kind === 'media' && read.source.form === 'image';
  const streams = path ? (factsOf(path)?.audioStreams ?? 0) : 0;

  if (!path || still || stream >= streams) {
    await quiet(seconds, offsetMs, out, opts);
    return;
  }

  const gain = volumeFilter(gainOf(path) ?? 0);
  await ffmpeg([
    '-y',
    '-accurate_seek', '-ss', (read.fromMs / 1000).toFixed(3),
    '-t', seconds,
    '-i', path,
    '-map', `0:a:${stream}`,
    ...audioArgs(offsetMs, gain),
    out,
  ], opts);
}

/** As long as asked for, and nothing on it. */
async function quiet(
  seconds: string, offsetMs: number, out: string, opts: RunOptions,
): Promise<void> {
  await ffmpeg([
    '-y',
    '-f', 'lavfi', '-i',
    `anullsrc=channel_layout=stereo:sample_rate=${HOUSE.audioSampleRate}`,
    /*
     * BOUNDED, AND NOT BY `-shortest`. `anullsrc` runs for ever
     * and there is no other stream here to be shorter than it.
     */
    '-t', seconds,
    ...audioArgs(offsetMs, null), out,
  ], opts);
}

/** Four seconds of quiet, for a rendition with nothing to say. */
async function silentSegment(out: string, opts: RunOptions): Promise<void> {
  await quiet((SEGMENT_MS / 1000).toFixed(3), 0, out, opts);
}

/**
 * The house audio format, identical for every rendition and
 * identical to the one muxed into the picture.
 *
 * SAME CODEC, SAME RATE, SAME CHANNEL COUNT AS `encodeArgs`. A
 * player switching language mid-programme reconfigures its
 * audio pipeline if any of the three differs, which is an
 * audible gap at the moment somebody is deciding whether this
 * feature works. [segment.ts `encodeArgs`]
 *
 * NO `-vn`, AND THE PICTURE STILL DOES NOT COME THROUGH. It was
 * here, as the statement that a rendition carries no picture,
 * and mutation showed that removing it changes nothing: `-vn`
 * drops video from ffmpeg's AUTOMATIC stream selection, and
 * every branch below names its streams with `-map`, so there
 * was never an automatic selection to drop from. A flag that
 * cannot fire is a flag that reads as the reason something
 * works when it is not. The claim is asserted on the OUTPUT
 * instead, where it belongs: the format test probes a produced
 * rendition and requires no video stream in it. [D-21]
 */
function audioArgs(offsetMs: number, gain: string | null): string[] {
  return [
    '-output_ts_offset', (offsetMs / 1000).toFixed(3),
    ...(gain ? ['-af', gain] : []),
    '-c:a', HOUSE.audioCodec,
    '-b:a', kbps(WIRE.audioBitsPerSecond),
    '-ar', String(HOUSE.audioSampleRate),
    '-ac', String(HOUSE.audioChannels),
    '-muxdelay', '0', '-muxpreload', '0',
    '-f', 'mpegts',
  ];
}

/** Byte-append, in order — the same property MPEG-TS was chosen for. */
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
