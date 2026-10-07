/**
 * When somebody last had a channel open.  [CHANNEL §7, §18; D-18, U-16]
 *
 * WHY THIS EXISTS. `needsSegments` lets the engine skip a channel
 * no viewer can reach — not published, not live. That is right for
 * the public and wrong for the one person who still needs a
 * picture from it: its owner, deciding whether it is ready to
 * publish. The control room's monitor reads the same segments
 * everybody else does, so an engine that skipped every unpublished
 * channel would hand the operator a black preview and no way to
 * get one.
 *
 * SO THE CONTROL ROOM SAYS IT IS THERE, by being there. It already
 * re-reads the channel every ten seconds; this records that, and
 * the engine keeps the channel warm for ninety. Nothing new is
 * polled and nothing new is asked of the browser.
 *
 * AN EMPTY FILE, AND THE CLOCK IS ITS MTIME. There is nothing to
 * store but a time, and the filesystem is already keeping one. No
 * JSON to parse, no write that can half-land, no format to
 * migrate — and a partial write of nothing is still nothing.
 *
 * NOT IN THE CHANNEL DOCUMENT, which matters more than it looks.
 * A document written every ten seconds per open studio would put a
 * lock and a rewrite of the whole schedule on the path of a page
 * doing nothing but looking, and `mutateChannel` holds that
 * document while the engine is reading it. Attention is not part
 * of what a channel IS. [D-18]
 */

import { mkdir, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { VAR_ROOT } from './paths.js';

/** Beside the heartbeats, for the same reason: it is engine weather. */
const WATCHED_DIR = join(VAR_ROOT, 'watching');

function markFor(channelId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(channelId)) {
    throw new Error(`unsafe channel id: ${JSON.stringify(channelId)}`);
  }
  return join(WATCHED_DIR, channelId);
}

/**
 * Somebody is looking at this channel.
 *
 * TOUCHED RATHER THAN REWRITTEN once the file exists. `utimes` on
 * an existing inode is cheaper than a create, and this is called
 * on a ten-second poll for every studio anybody has open.
 *
 * IT NEVER THROWS AT ITS CALLER. This is bookkeeping on the side
 * of a read: a volume that is briefly unwritable must not turn
 * loading a control room into an error. The cost of losing one of
 * these is that the channel goes cold ninety seconds later and
 * the next poll warms it again. [D-21]
 */
export async function noteWatching(channelId: string): Promise<void> {
  let file;
  try {
    file = markFor(channelId);
  } catch {
    return;
  }
  const now = new Date();
  try {
    await utimes(file, now, now);
    return;
  } catch { /* Not there yet, which is the first poll of a session. */ }
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, '', 'utf8');
  } catch { /* Said above: never the caller's problem. */ }
}

/**
 * When it was last looked at, or nothing.
 *
 * NOTHING IS NOT ZERO. A channel nobody has ever opened and a
 * channel whose mark could not be read mean the same thing to
 * `needsSegments` — no evidence of attention — and both are
 * `undefined` rather than a time in 1970 that would read as
 * "looked at, very long ago". The two happen to behave alike here;
 * saying the true one costs nothing and survives the next reader.
 */
export async function watchedAt(channelId: string): Promise<number | undefined> {
  try {
    return (await stat(markFor(channelId))).mtimeMs;
  } catch {
    return undefined;
  }
}
