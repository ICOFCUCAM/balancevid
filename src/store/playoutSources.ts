/**
 * Where a reference actually is.  [Doctrine CHANNEL §3, §7, D-18, INV-17]
 *
 * THE ONE PLACE A PROGRAMME BECOMES A PATH. Everything above this — the
 * schedule, the engine, the listing — deals in references, and everything
 * below it deals in files. Keeping the crossing to one function is what makes
 * "a scheduled programme references an existing media asset" a property of
 * the system rather than a habit: there is exactly one place that could be
 * changed to copy instead of point at, and it is this one.
 *
 * It resolves to the render the OTHER studio already made, in that studio's
 * own directory. Nothing is moved, linked, or staged into the channel. A
 * programme scheduled thirty times resolves thirty times to the same path.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Channel, ProgrammeSource } from '../domain/channel.js';
import { ingestById } from '../domain/channel.js';
import { paths, safe } from './paths.js';

/**
 * The file a reference names, or nothing if it is not there.
 *
 * `undefined` rather than a throw, because a missing render is an ordinary
 * state of a schedule — somebody deleted a conversation last week and
 * Thursday's repeat now has nothing behind it — and the channel has to be
 * able to SHOW that rather than fail to load.
 */
export function pathFor(
  channel: Channel, source: ProgrammeSource,
): string | undefined {
  if (source.kind === 'render') {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.documentId)) return undefined;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.planHash)) return undefined;
    /*
     * In the studio that made it. This is the line that keeps the rule: the
     * channel's own directory is not consulted, so a schedule cannot even
     * accidentally be served from a copy it owns.
     */
    const dir = source.document === 'performance'
      ? paths.performanceRenders(source.documentId)
      : paths.renders(source.documentId);
    return join(dir, safe(source.planHash), 'master.mp4');
  }
  const ingest = ingestById(channel, source.ingestId);
  if (!ingest) return undefined;
  /*
   * A live feed IS the channel's, because the channel is what it arrived at.
   * This is the one path under `channelAssets`, and INV-17 allows it by name.
   */
  return paths.channelAsset(channel.id, ingest.assetId, 'mp4');
}

/** Which of these references have nothing behind them any more. */
export async function missingSources(
  channel: Channel, sources: readonly ProgrammeSource[],
): Promise<ProgrammeSource[]> {
  const missing: ProgrammeSource[] = [];
  for (const source of sources) {
    const path = pathFor(channel, source);
    if (!path) { missing.push(source); continue; }
    try {
      await stat(path);
    } catch {
      missing.push(source);
    }
  }
  return missing;
}

/** Whether one reference resolves to something that is on disk right now. */
export async function resolves(
  channel: Channel, source: ProgrammeSource,
): Promise<boolean> {
  return (await missingSources(channel, [source])).length === 0;
}
