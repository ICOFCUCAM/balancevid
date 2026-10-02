/**
 * Where a stream key lives, which is not in the document.
 * [Doctrine CHANNEL §15, D-21, D-06, U-25]
 *
 * D-21, in its own words:
 *
 *   *"No credentials in the document. A destination names its
 *   settings; what they are is the connector's business and where
 *   they are kept is not the document's. A conversation directory is
 *   a portable archive (U-25), and a stream key in one is a stream
 *   key in somebody's backup."*
 *
 * So the channel document holds a `settingsRef` and this holds what
 * it refers to. The two are separated for a reason that is easy to
 * state and easy to forget: a channel document is exported, copied,
 * attached to a support e-mail and committed to somebody's git
 * repository, and every one of those is a place a live stream key
 * must not be. A key in here goes nowhere unless this module is
 * asked for it by name.
 *
 * OUTSIDE THE ACCOUNT TREE, for the same reason. `var/accounts/…` is
 * the thing a backup walks; this sits beside `playout.json` under
 * `var/keys`, which is liveness-and-credentials territory and is not
 * part of anybody's archive.
 *
 * 0600 ON THE FILE AND 0700 ON THE DIRECTORY. Not because the threat
 * model has other users on the box today, but because the day it does
 * is not the day anybody will remember to come back and set them.
 *
 * AND IT IS NEVER SERVED. There is no route that returns a key. The
 * control room is told whether one EXISTS and what its server address
 * is; the key itself leaves this process only as an argument to
 * ffmpeg. A product that can show you your own stream key is a
 * product that can show it to whoever is looking over your shoulder,
 * and there is nothing you can do with it on screen that you cannot
 * do by pasting a new one.
 */

import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Target } from '../domain/rtmp.js';
import { VAR_ROOT, safe } from './paths.js';

const KEYS = join(VAR_ROOT, 'keys');

function fileFor(ref: string): string {
  return join(KEYS, `${safe(ref)}.json`);
}

/**
 * Put a key away.
 *
 * Written through a temp file and renamed like every other write in
 * this codebase — and the temp file is created with the restrictive
 * mode BEFORE anything is written into it, because a file that is
 * world-readable for the microseconds between `writeFile` and
 * `chmod` is a file that was world-readable.
 */
export async function putKey(ref: string, target: Target): Promise<void> {
  await mkdir(KEYS, { recursive: true });
  /*
   * TIGHTENED EVERY TIME, because `mkdir`'s own mode does nothing when
   * the directory is already there — and the directory that is
   * already there is the one from before anybody thought about this,
   * or the one a restore recreated with whatever the tar had. A mode
   * on the `mkdir` as well would be unobservable: it survived every
   * mutation, which is what belt-and-braces does.
   */
  await chmod(KEYS, 0o700).catch(() => undefined);
  const path = fileFor(ref);
  const temp = `${path}.${process.pid}.tmp`;
  /*
   * THE MODE IS ON THE CREATE, not a `chmod` afterwards. A file that
   * is world-readable for the microseconds between `writeFile` and a
   * following `chmod` is a file that was world-readable, and the
   * rename below carries the mode across.
   */
  await writeFile(temp, JSON.stringify({
    server: target.server.trim(),
    key: target.key.trim(),
  }), { encoding: 'utf8', mode: 0o600 });
  await rename(temp, path);
}

/** Read one back, or nothing. Only the sender and the door call this. */
export async function getKey(ref: string): Promise<Target | null> {
  try {
    const body = JSON.parse(await readFile(fileFor(ref), 'utf8')) as Target;
    return typeof body?.server === 'string' && typeof body?.key === 'string'
      ? body : null;
  } catch {
    return null;
  }
}

/**
 * What the control room may know: that there is one, and where it
 * points. Never the key.
 */
export async function keyNote(
  ref: string | undefined,
): Promise<{ server: string; has: boolean } | null> {
  if (!ref) return null;
  const target = await getKey(ref);
  if (!target) return null;
  return { server: target.server, has: target.key.length > 0 };
}

/**
 * Forget one.
 *
 * CALLED WHEN THE DESTINATION GOES, which is the part that is easy to
 * leave out: a key whose destination was deleted is a live credential
 * in a file nothing references, and nothing will ever remove it
 * because nothing remembers it is there.
 */
export async function forgetKey(ref: string): Promise<void> {
  await rm(fileFor(ref), { force: true });
}
