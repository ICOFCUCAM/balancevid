/**
 * Which rungs of the ladder a channel is actually writing.
 *   [Doctrine CHANNEL §7, §23, D-21]
 *
 * THE SAME ONE FACT `producingAudio` EXISTS FOR, asked about the
 * picture. Everything else about a live playlist is a function
 * of the clock; whether a rung is on the disk is not arithmetic.
 * A master naming a 360p variant whose segments 404 is worse
 * than naming none: a player that drops to it when the line gets
 * tight finds nothing there, and the viewer sees the stream fail
 * at exactly the moment the ladder existed to rescue it. [U-19]
 *
 * ONE DIRECTORY LISTING PER TUNE, because a master playlist is
 * fetched when a player starts.
 *
 * EMPTY IS THE HONEST ANSWER TO EVERY FAILURE — no directory, an
 * unreadable one, a permissions error. All of them mean *this
 * channel transmits one size*, which is what the product did
 * before the ladder and is never wrong to say.
 */

import { readdir } from 'node:fs/promises';

import { paths } from './paths.js';

export async function producingRungs(channelId: string): Promise<string[]> {
  let held;
  try {
    held = await readdir(paths.channelRungRoot(channelId), { withFileTypes: true });
  } catch {
    return [];
  }
  return held
    .filter((one) => one.isDirectory())
    .map((one) => one.name)
    .sort();
}
