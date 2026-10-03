/**
 * Where this machine remembers things.  [TAKE-DESKTOP T-2]
 *
 * ONE FILE BESIDE THE APPLICATION'S OWN SETTINGS, in the
 * directory the operating system gives an application for exactly
 * this. Not `localStorage` in the window: a capture station's
 * list of studios should survive a cache clear, and a window with
 * no Node has no business owning the only copy of anything.
 *
 * WRITTEN THE WAY EVERY OTHER RECORD IN THIS PRODUCT IS: to a
 * temporary name, then renamed over the target. `store/lineup.ts`
 * does the same on the installation side and for the same reason
 * — a half-written file is a file that reads as empty, and a
 * capture station that forgot where to submit because it was
 * closed mid-write is a capture station somebody has to set up
 * again.
 *
 * A LIST THAT CANNOT BE READ IS AN EMPTY ONE, never a thrown
 * error. This is on the path to the first screen. [D-21]
 */

import { app } from 'electron';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  type Connection, MOST_CONNECTIONS, readConnectionList,
} from '../../shared/src/connections.js';
import type { Destination } from './submit.js';
import { destinationFrom } from './recordings.js';

function where(): string {
  return join(app.getPath('userData'), 'connections.json');
}

export async function readStored(): Promise<Connection[]> {
  try {
    return readConnectionList(await readFile(where(), 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Write the list, and answer what was actually written.
 *
 * THE LIST IS READ BACK THROUGH THE SAME DOOR IT CAME IN BY, so
 * the window is told what is on disk rather than what it asked
 * for. A renderer that believed its own request would show a
 * connection that the shared rules had refused.
 */
export async function writeStored(list: unknown): Promise<Connection[]> {
  const kept = readConnectionList(JSON.stringify(list))
    .slice(0, MOST_CONNECTIONS);
  const target = where();
  try {
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(kept, null, 2), 'utf8');
    await rename(temp, target);
  } catch {
    /* Kept for this run and not beyond it. A studio that cannot
       be remembered can still be recorded to. */
  }
  return kept;
}

/**
 * The call this station is recording for.  [TAKE-DESKTOP T-5, D-21]
 *
 * ONE, NOT A LIST, and that is the difference between a
 * credential a station holds and an index of credentials. A
 * capture station is pointed at a job and records it; the
 * twenty things it remembers are STUDIOS, which carry no
 * secret, and this one thing is a CALL, which does. The
 * installation's own store refuses to build the list version
 * of this for the same reason: *"a list of every credential in
 * the installation in one place."* [src/store/requests.ts]
 *
 * IT SURVIVES THE APPLICATION CLOSING, because a station set
 * up on Monday in a hall with no connection must still know
 * where Tuesday's capture goes. That is the whole of T-5's
 * judging criterion — *"recorded offline, then submitted when a
 * connection returns"* — and a choice held in a variable would
 * not survive the walk to the office.
 *
 * AND THE WINDOW IS NEVER TOLD IT. `callSeen` below is what
 * crosses the bridge: the name and the origin, so a person can
 * read where their work is going, and not the secret that
 * authorises it. [T-1]
 */
function callWhere(): string {
  return join(app.getPath('userData'), 'call.json');
}

export async function readCall(): Promise<Destination | null> {
  try {
    return destinationFrom(JSON.parse(await readFile(callWhere(), 'utf8')));
  } catch {
    return null;
  }
}

/** Point the station at a call, and answer what was kept. */
export async function writeCall(said: unknown): Promise<Destination | null> {
  const kept = destinationFrom(said);
  const target = callWhere();
  try {
    await mkdir(dirname(target), { recursive: true });
    if (!kept) {
      await rm(target, { force: true });
      return null;
    }
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(kept, null, 2), 'utf8');
    await rename(temp, target);
  } catch {
    /* Pointed for this run and not beyond it. A station that
       cannot remember where to send can still record. */
  }
  return kept;
}

/** What the window may know about the call: never the credential. */
export function callSeen(
  call: Destination | null,
): { origin: string; name: string } | null {
  return call ? { origin: call.origin, name: call.name } : null;
}
