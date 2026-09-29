/**
 * The Channel store.  [Doctrine CHANNEL §1, INV-00, INV-17, D-07, U-25]
 *
 * The third of three, written as its own module for the reason the second
 * was: three documents will migrate on three different days, and a shared
 * migration gate is a shared reason to be unable to ship any of them.
 *
 * WHAT IS DIFFERENT HERE is `channelAssetIds`. The other two stores have no
 * reason to enumerate their own assets; this one does, because INV-17 is a
 * claim about what a channel is holding and a claim about disk has to be
 * settled by looking at disk. It is the only reader in the codebase whose
 * purpose is to prove a negative.
 */

import {
  appendFile, mkdir, readFile, readdir, rename, rm, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { CHANNEL_SCHEMA_VERSION, type Channel } from '../domain/channel.js';
import type { AuditEntry } from './repository.js';
import { paths, safe } from './paths.js';
import { requireStudio } from './entitlement.js';

export async function saveChannel(channel: Channel): Promise<void> {
  await requireStudio('online-tv');
  const dir = paths.channel(channel.id);
  await mkdir(join(dir, 'assets'), { recursive: true });
  const target = paths.channelDocument(channel.id);
  const temp = `${target}.${process.pid}.tmp`;
  const body = JSON.stringify(
    { ...channel, updatedAt: new Date().toISOString() }, null, 2);
  await writeFile(temp, body, 'utf8');
  await rename(temp, target);
}

export async function loadChannel(id: string): Promise<Channel> {
  await requireStudio('online-tv');
  const raw = await readFile(paths.channelDocument(safe(id)), 'utf8');
  const parsed = JSON.parse(raw) as Channel;
  if (parsed.schemaVersion > CHANNEL_SCHEMA_VERSION) {
    // Forward-only (U-25 §1). Reading a newer document with older code is how
    // user work gets corrupted, so this refuses rather than tries.
    throw new Error(
      `channel ${id} is schema v${parsed.schemaVersion}; `
      + `this build understands v${CHANNEL_SCHEMA_VERSION}`);
  }
  return migrate(parsed);
}

/** Old documents, read by new code. In memory only. [U-25 §1] */
function migrate(channel: Channel): Channel {
  channel.programmes ??= [];
  channel.rotation ??= [];
  channel.blocks ??= [];
  channel.ingests ??= [];
  channel.recordings ??= [];
  channel.schemaVersion = CHANNEL_SCHEMA_VERSION;
  return channel;
}

export async function listChannels(): Promise<Channel[]> {
  await requireStudio('online-tv');
  let entries: string[];
  try {
    entries = await readdir(paths.channels());
  } catch {
    return [];
  }
  const loaded = await Promise.all(entries.map(
    (id) => loadChannel(id).catch(() => null)));
  return loaded
    .filter((channel): channel is Channel => channel !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function mutateChannel(
  id: string, change: (draft: Channel) => void | Promise<void>,
): Promise<Channel> {
  await requireStudio('online-tv');
  const channel = await loadChannel(id);
  await change(channel);
  await saveChannel(channel);
  return channel;
}

/**
 * Every media asset this channel is holding.  [INV-17]
 *
 * The evidence for the invariant. Returns asset IDS rather than filenames, so
 * the check compares like with like — a live ingest knows its asset id and
 * has no opinion about which container it ended up in.
 *
 * Anything that is not a file directly in `assets/` is ignored: the directory
 * may grow subdirectories for chunks the way the other studios' do, and a
 * chunk of an ingest belongs to that ingest rather than being a separate
 * asset to account for.
 */
export async function channelAssetIds(id: string): Promise<string[]> {
  await requireStudio('online-tv');
  let entries: string[];
  try {
    entries = await readdir(paths.channelAssets(safe(id)), { withFileTypes: true })
      .then((found) => found.filter((entry) => entry.isFile()).map((entry) => entry.name));
  } catch {
    return [];
  }
  const ids = new Set<string>();
  for (const name of entries) {
    /*
     * `asset_abc123.ts` and `asset_abc123.mp4` are one asset in two
     * containers, not two assets — the id is everything before the first dot.
     */
    const id_ = name.split('.')[0];
    if (id_) ids.add(id_);
  }
  return [...ids];
}

export async function auditChannel(
  id: string, entry: Omit<AuditEntry, 'at'>,
): Promise<void> {
  await requireStudio('online-tv');
  await requireStudio('online-tv');
  await mkdir(paths.channel(id), { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  await appendFile(paths.channelAudit(id), `${line}\n`, 'utf8');
}

export async function readChannelAudit(id: string): Promise<AuditEntry[]> {
  await requireStudio('online-tv');
  try {
    const raw = await readFile(paths.channelAudit(safe(id)), 'utf8');
    return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line) as AuditEntry);
  } catch {
    return [];
  }
}

/**
 * Throw a channel away.  [§19, CHANNEL §1, INV-17]
 *
 * NOTHING SCHEDULED DIES WITH IT, which is the whole point of D-18 arriving
 * at the end of a channel's life: the schedule was references, so deleting
 * it deletes a list of pointers and every film it pointed at is untouched.
 * Six months of programming removes no video from this machine.
 *
 * What DOES die is the only media a channel ever owns (INV-17): saved live
 * sessions, recordings somebody asked for, and the segment directory. The
 * segments are regenerated from the clock by definition and are not an
 * archive of anything; the recordings are, and the caller is told how many
 * before being asked.
 */
export async function deleteChannel(id: string): Promise<void> {
  await requireStudio('online-tv');
  await rm(paths.channel(safe(id)), { recursive: true, force: true });
}
