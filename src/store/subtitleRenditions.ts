/**
 * Whether a channel is actually writing captions.
 *   [Doctrine CHANNEL §7, §17, D-21, TV-NETWORK N-10]
 *
 * THE SAME ONE FACT `producingAudio` EXISTS FOR, asked about the
 * other rendition. Everything else about a live playlist is a
 * function of the clock; whether the words are on the disk is
 * not arithmetic, and the alternative to asking is advertising a
 * subtitle track whose segments 404 — which is a viewer turning
 * captions on, seeing nothing, and concluding the product does
 * not have them. [U-19]
 *
 * ONE DIRECTORY LISTING PER TUNE, not per segment: a master
 * playlist is fetched when a player starts.
 *
 * EMPTY IS THE HONEST ANSWER TO EVERY FAILURE — no directory, an
 * unreadable one, a permissions error. All of them mean *this
 * channel has no captions to offer*, which is what a viewer
 * should be told.
 */

import { readdir } from 'node:fs/promises';

import { paths } from './paths.js';

export async function producingSubtitles(channelId: string): Promise<string[]> {
  let held;
  try {
    held = await readdir(
      paths.channelSubtitleRoot(channelId), { withFileTypes: true });
  } catch {
    return [];
  }
  return held
    .filter((one) => one.isDirectory())
    .map((one) => one.name)
    .sort();
}
