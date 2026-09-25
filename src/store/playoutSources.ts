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
  /*
   * A BOOKED LIVE SLOT RESOLVES TO NOTHING, and that is correct rather than a
   * fault. It references an intention: at the hour, the channel shows whoever
   * is live, and if nobody is, it falls through to the loop. There is no file
   * behind it because nobody has made one yet. [§6]
   */
  if (source.kind === 'live_event') return undefined;
  if (source.kind === 'media') {
    /*
     * OTHER MEDIA lives in the library, not in the channel. A station ident
     * uploaded once is one file that every channel may schedule, so it sits
     * beside the two studios' work rather than inside whichever channel
     * happened to use it first — which is the same rule as everything else
     * here, applied to the one kind of asset that has no studio. [§3, D-18]
     */
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.assetId)) return undefined;
    return paths.libraryMedia(source.assetId, source.form === 'image' ? 'jpg' : 'mp4');
  }
  const ingest = ingestById(channel, source.ingestId);
  if (!ingest) return undefined;
  /*
   * WHILE IT IS LIVE, IT IS A BUFFER. Afterwards, if somebody kept it, it is
   * an asset — and a repeat of last night's live show reads the asset, not
   * the buffer, which by then has been swept. A session nobody kept resolves
   * to nothing at all once it is over, which is correct: there is nothing
   * left to play. [§7, §8]
   */
  return ingest.assetId
    ? paths.channelAsset(channel.id, ingest.assetId, 'webm')
    : paths.channelLiveBuffer(channel.id, ingest.bufferId);
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
