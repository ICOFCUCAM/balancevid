/**
 * What each destination is actually doing.  [CHANNEL §15, §18, D-20, D-21]
 *
 * D-21: *"`enabled` is the operator's switch and the connector's
 * state is a separate answer. A destination showing 'on' with nothing
 * arriving is the screen that loses a broadcast."*
 *
 * This is the connector's answer. It is written by the playout
 * process, which is the only thing that knows, and read by the web
 * tier, which is the only thing that can show it — so it goes on the
 * filesystem like every other fact those two share (§11, D-20), and
 * NOT into the channel document, because a document is the thing that
 * survives a restart and this is the thing that must not.
 *
 * ONE FILE PER CHANNEL, overwritten. Not history: nothing here is
 * worth keeping and a record that grew is a record somebody has to
 * delete.
 *
 * AND NO KEY EVER REACHES IT. The sentences stored here are built by
 * `redact` and `without`, and this module takes whatever it is given
 * — so the test that matters is over there, on the two functions that
 * can see a credential.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DestinationState } from '../domain/distribution.js';
import { VAR_ROOT, safe } from './paths.js';

export interface SenderNote {
  state: DestinationState;
  says: string;
  at: string;
}

const DIR = join(VAR_ROOT, 'senders');

function fileFor(channelId: string): string {
  return join(DIR, `${safe(channelId)}.json`);
}

export async function readSenders(
  channelId: string,
): Promise<Record<string, SenderNote>> {
  try {
    const body = JSON.parse(await readFile(fileFor(channelId), 'utf8'));
    return (body && typeof body === 'object' ? body : {}) as
      Record<string, SenderNote>;
  } catch {
    return {};
  }
}

/** Record one destination's state, leaving the others alone. */
export async function noteSender(
  channelId: string, destinationId: string, note: SenderNote,
): Promise<void> {
  const all = await readSenders(channelId);
  /*
   * NOTHING IS WRITTEN FOR A STATE THAT HAS NOT CHANGED. The engine
   * reconciles every pass — every few seconds, for the length of a
   * broadcast — and a file rewritten that often for no reason is
   * disk churn and a `mtime` that tells a reader nothing.
   */
  const was = all[destinationId];
  if (was && was.state === note.state && was.says === note.says) return;
  all[destinationId] = note;
  await mkdir(DIR, { recursive: true });
  const path = fileFor(channelId);
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(all), 'utf8');
  await rename(temp, path);
}

/** Forget a destination that no longer exists. */
export async function forgetSender(
  channelId: string, destinationId: string,
): Promise<void> {
  const all = await readSenders(channelId);
  if (!(destinationId in all)) return;
  delete all[destinationId];
  await mkdir(DIR, { recursive: true });
  const path = fileFor(channelId);
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(all), 'utf8');
  await rename(temp, path);
}
