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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  type Connection, MOST_CONNECTIONS, readConnectionList,
} from '../../shared/src/connections.js';

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
