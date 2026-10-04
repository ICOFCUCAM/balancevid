/**
 * Which alternate audio a channel is actually producing.
 *   [Doctrine CHANNEL §7, D-21, TV-NETWORK N-10]
 *
 * THE ONE FACT THE PLAYLIST CANNOT COMPUTE. Everything else
 * about a live playlist is a function of the clock — that is the
 * decision §7 is built on, and it is why the web tier never
 * touches the stream directory per segment. This is different:
 * whether a language is being WRITTEN is not arithmetic, it is a
 * thing about the disk, and the alternative to asking is
 * advertising a rendition that 404s.
 *
 * ONE DIRECTORY LISTING, NOT A FILE READ. The master playlist is
 * fetched once when a player starts, not four times a second
 * like a segment, so the cost is one `readdir` per viewer per
 * tune — and the thing it buys is a player that never offers a
 * language that goes silent. [U-19]
 *
 * EMPTY IS THE HONEST ANSWER TO EVERY FAILURE. A channel with no
 * `audio/` directory, an unreadable one, a permissions error:
 * all of them mean *this channel has no alternate audio to
 * offer*, which is true and is what a viewer should be told.
 */

import { readdir } from 'node:fs/promises';

import { paths } from './paths.js';

export async function producingAudio(channelId: string): Promise<string[]> {
  let held;
  try {
    held = await readdir(
      paths.channelAudioRoot(channelId), { withFileTypes: true });
  } catch {
    return [];
  }
  return held
    .filter((one) => one.isDirectory())
    .map((one) => one.name)
    .sort();
}
