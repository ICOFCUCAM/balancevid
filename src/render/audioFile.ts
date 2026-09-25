/**
 * A finished render, as something to listen to.  [Doctrine U-22, U-17, INV-11]
 *
 * One pass over a video that already exists: its audio, re-mastered to where
 * spoken word is mastered, with chapters written into the file so a player
 * can jump to the moment the author interrupted.
 *
 * DERIVED, NOT COMPOSED. The shots were cut once and the sound was mixed once;
 * this takes that sound. An audio pipeline that assembled the takes itself
 * would be a second composition, and two compositions of one conversation
 * eventually disagree about where a cut is — inaudibly, until somebody notices
 * half a sentence missing. [INV-00]
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AudioChapter } from '../domain/audioExport.js';
import {
  PODCAST_BITRATE, PODCAST_LOUDNESS_LUFS, PODCAST_TRUE_PEAK_DB,
} from '../domain/audioExport.js';
import { ffmpeg, type RunOptions } from './ffmpeg.js';
import { measureLoudnorm } from './ingest.js';

/** The headroom the video master already asks for, and for the same reason. */
const TP_HEADROOM_DB = 0.3;

export interface AudioExport {
  outPath: string;
  chapters: number;
  /** What the two-pass measurement found, when it could measure. */
  measured: boolean;
}

/**
 * ID3 chapters, as ffmpeg's metadata format.
 *
 * Escaped as that format requires: `=`, `;`, `#`, `\` and newlines are
 * special, and a chapter titled with a quote somebody actually said is exactly
 * where an unescaped `=` turns up.
 */
export function chapterMetadata(chapters: AudioChapter[], title?: string): string {
  const lines = [';FFMETADATA1'];
  if (title) lines.push(`title=${escapeMeta(title)}`);
  for (const chapter of chapters) {
    lines.push(
      '', '[CHAPTER]', 'TIMEBASE=1/1000',
      `START=${Math.round(chapter.startMs)}`,
      `END=${Math.round(chapter.endMs)}`,
      `title=${escapeMeta(chapter.title)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function escapeMeta(value: string): string {
  return value.replace(/[=;#\\]/g, (character) => `\\${character}`)
    .replace(/\r?\n/g, ' ');
}

export async function exportAudio(options: {
  /** A finished render. Its audio is the conversation's sound. */
  from: string;
  outPath: string;
  chapters: AudioChapter[];
  /** For the file's own metadata, so a player has something to show. */
  title?: string;
  artist?: string;
  run?: RunOptions;
}): Promise<AudioExport> {
  const { from, outPath, chapters } = options;
  await mkdir(dirname(outPath), { recursive: true });

  const metaPath = join(dirname(outPath), 'chapters.ffmetadata');
  await writeFile(metaPath, chapterMetadata(chapters, options.title), 'utf8');

  /*
   * Two-pass, as the video master is. Spoken word is listened to against
   * traffic and a dishwasher, so it is mastered louder — and asking a limiter
   * for a ceiling rather than a target is how the delivered file stays under
   * it. [U-17 §4, INV-11]
   */
  const askTruePeak = PODCAST_TRUE_PEAK_DB - TP_HEADROOM_DB;
  const measurement = await measureLoudnorm(from, PODCAST_LOUDNESS_LUFS, askTruePeak);
  const loudnorm = measurement
    ? `loudnorm=I=${PODCAST_LOUDNESS_LUFS}:TP=${askTruePeak}:LRA=11`
      + `:measured_I=${measurement.measuredI}:measured_TP=${measurement.measuredTp}`
      + `:measured_LRA=${measurement.measuredLra}:measured_thresh=${measurement.measuredThresh}`
      + `:offset=${measurement.offset}:linear=true:print_format=summary`
    : `loudnorm=I=${PODCAST_LOUDNESS_LUFS}:TP=${askTruePeak}:LRA=11`;

  await ffmpeg([
    '-y', '-i', from, '-i', metaPath,
    // The chapters come from the metadata file; everything else about the
    // video is left behind.
    '-map_metadata', '1',
    '-map', '0:a:0',
    '-vn',
    '-af', loudnorm,
    '-c:a', 'libmp3lame', '-b:a', PODCAST_BITRATE, '-ar', '48000', '-ac', '2',
    ...(options.title ? ['-metadata', `title=${options.title}`] : []),
    ...(options.artist ? ['-metadata', `artist=${options.artist}`] : []),
    '-write_id3v2', '1',
    '-progress', 'pipe:1',
    outPath,
  ], options.run);

  return { outPath, chapters: chapters.length, measured: measurement !== null };
}
