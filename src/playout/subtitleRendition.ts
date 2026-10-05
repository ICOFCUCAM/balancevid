/**
 * One segment of a channel's SUBTITLE rendition.
 *   [Doctrine CHANNEL §7, §17, D-18, D-19, TV-NETWORK N-10]
 *
 * THE WORDS WERE ALWAYS THERE AND NEVER REACHED THE WIRE.
 * `compose.ts` writes `master.mp4.vtt` beside every render it
 * finishes — INV-07 says the sidecars ship whatever the burn-in
 * setting is — and the playout engine scheduled that render,
 * encoded its picture, mapped its sound, and walked past the
 * file with the words in it. A viewer watching with the sound
 * off got nothing, on a product that had already transcribed
 * every frame.
 *
 * THE SAME WALK, A THIRD READER. `playoutWindow` decides what is
 * on air across a segment — the loop, the boundaries, the
 * clipping, the live feed — and a captioner with a second
 * opinion about any of it would put last programme's line over
 * this one's picture. So the walk is imported, as the audio
 * rendition imports it. What is different is that there is no
 * encoder here at all: a caption segment is a few hundred bytes
 * of text, cut and rebased, which is arithmetic. [D-19, U-23]
 *
 * NOTHING IS INVENTED. No transcript is read, no cue is retimed
 * against anything, nobody is named who was not named by the
 * transcript. A second captioner — one that read the transcript
 * and built its own cues for the channel — would be a second
 * answer to *what was said*, and the two would disagree the
 * first time an author corrected a word in Studio One. [D-19]
 *
 * A PROGRAMME WITH NO SIDECAR GETS AN EMPTY SEGMENT, NOT A HOLE.
 * Most of a channel's day is the loop, dead air and media that
 * was never transcribed, and a rendition whose segments stopped
 * appearing is a player stalling on the track the viewer chose.
 * A WebVTT file with a header and no cues is valid and says the
 * true thing: nothing is being said. [U-19, D-21]
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Channel } from '../domain/channel.js';
import {
  SEGMENT_MS, type Read, playoutWindow, segmentStart,
} from '../domain/playout.js';
import {
  type TimedLine, linesAcross, readVtt, vttSegment,
} from '../domain/webvtt.js';
import { pathFor } from '../store/playoutSources.js';
import { paths } from '../store/paths.js';
import { SEGMENT_START_PTS, type SourceFacts } from './segment.js';

/**
 * WHERE A RENDER'S CAPTIONS ARE, which is beside the render.
 *
 * `${master}.vtt` is the name `compose.ts` chose, and it is read
 * here rather than recomputed: one function knows how a render
 * is laid out on disk and this asks it for the master first.
 * [D-19]
 *
 * ONLY A RENDER HAS ONE. Library media — an ident, a caption
 * card, a film somebody uploaded — came from outside this
 * product and carries no transcript, and a live feed has not
 * been said yet. Both get the empty segment above, which is
 * exactly true of them.
 */
export function captionsFor(
  channel: Channel, source: Read['source'],
): string | undefined {
  if (source.kind !== 'render') return undefined;
  const master = pathFor(channel, source);
  return master ? `${master}.vtt` : undefined;
}

/**
 * The one subtitle rendition a channel offers, or nothing.
 *
 * ONE, AND LABELLED WITH THE CHANNEL'S OWN LANGUAGE. A render's
 * captions are in whatever was spoken into it; `station.language`
 * is the broadcaster's statement about what their channel is in,
 * and it is the only honest label available. A channel that
 * declared French captions over an English transcript would be
 * the fault `renditions` refuses for audio, committed in the
 * one place a viewer cannot check by listening. [D-21]
 *
 * THE DEFAULT AUDIO TRACK'S LANGUAGE WHERE THERE IS NO
 * `station.language`, because a station that bothered to declare
 * its audio tracks has already answered the question; and `und`
 * where there is neither, which is the subtag that exists for
 * precisely this and is better than guessing English at a
 * product used in every country.
 */
export function subtitleOf(channel: Channel): { language: string } | null {
  if (channel.station?.subtitles !== true) return null;
  const tracks = channel.station.audio ?? [];
  const spoken = tracks.find((one) => one.default === true) ?? tracks[0];
  const language = channel.station.language ?? spoken?.language ?? 'und';
  return { language: language.toLowerCase() };
}

/**
 * Produce this segment's captions.
 *
 * AFTER THE PICTURE AND AFTER THE AUDIO, and never before. The
 * picture is what a channel IS; an engine that spent its four
 * seconds assembling text and missed the frame would have the
 * priority exactly backwards. Returns the language it wrote, so
 * the caller can say nothing where it wrote nothing.
 */
export async function produceSubtitle(
  channel: Channel, index: number,
  factsOf: (path: string) => SourceFacts | undefined,
): Promise<string | null> {
  const offers = subtitleOf(channel);
  if (!offers) return null;

  const fromAt = segmentStart(index);
  const toAt = fromAt + SEGMENT_MS;
  const reads = playoutWindow(channel, fromAt, toAt, (source) => {
    const path = pathFor(channel, source);
    return path ? factsOf(path)?.durationMs : undefined;
  });

  try {
    const lines: TimedLine[] = [];
    for (const read of reads) {
      if (read.offAir) continue;
      const sidecar = captionsFor(channel, read.source);
      if (!sidecar) continue;
      /*
       * READ PER SEGMENT AND NOT CACHED, which is a cost worth
       * naming: a caption file for a forty-minute film is a few
       * hundred kilobytes and this reads it four times a second.
       * It is the same shape as `factsFor`'s cache one layer up
       * and belongs there rather than here — a module-level map
       * in a function the engine calls per channel per segment
       * is a map that grows with every programme a station ever
       * scheduled. Left as a read until a profile says
       * otherwise, and said out loud so the next reader does not
       * have to measure it to find out it was considered.
       */
      const text = await readFile(sidecar, 'utf8').catch(() => null);
      if (text === null) continue;
      /*
       * THE SOURCE FILE'S OWN CLOCK, WHICH IS WHERE THE READ IS
       * POINTING. `fromMs` is how far into the film this four
       * seconds begins — the loop's modulus already applied —
       * so the cues wanted are the ones across that stretch,
       * and they are rebased to the read rather than to the
       * segment.
       */
      const across = linesAcross(
        readVtt(text), read.fromMs, read.fromMs + read.durationMs);
      /*
       * AND THEN SHIFTED TO WHERE THE READ SITS IN THE SEGMENT,
       * which is zero for everything but the second half of a
       * segment that crosses a programme boundary. The picture
       * carries the same number as `-output_ts_offset`.
       */
      const offset = read.atMs - fromAt;
      for (const line of across) {
        lines.push({
          fromMs: line.fromMs + offset,
          toMs: line.toMs + offset,
          text: line.text,
        });
      }
    }

    const target = paths.channelSubtitleSegment(
      channel.id, offers.language, index);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.tmp`;
    /*
     * WRITTEN TO A TEMPORARY NAME AND RENAMED, the same way the
     * picture is. A player that fetched a caption segment
     * halfway through its write would get a truncated cue, and
     * the rename is atomic on every filesystem this runs on.
     */
    await writeFile(temp, vttSegment(lines, 0, SEGMENT_START_PTS), 'utf8');
    await rename(temp, target);
    return offers.language;
  } catch {
    /*
     * A SEGMENT OF CAPTIONS IS NEVER WORTH THE PICTURE. Whatever
     * went wrong here — an unreadable sidecar, a full disk — the
     * channel carries on and this rendition has a gap, which a
     * player rides out by holding the last line. [U-19]
     */
    return null;
  }
}
