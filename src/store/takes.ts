/**
 * Take assembly.  [Doctrine U-04, U-06, D-07]
 *
 * Worker-only: this module can reach ffmpeg, so nothing in the web tier may
 * import it (U-23).
 *
 * A take arrives as an ordered set of self-contained WebM segments. The first
 * few are PRE-ROLL -- captured before the user pressed the key, because people
 * react and then press, and `getUserMedia` plus `MediaRecorder` need a moment
 * to produce a usable frame. Those segments are kept, not discarded: the
 * default trim hides them, and the user can always recover the words they said
 * before deciding to speak.
 *
 * "Users will not know this feature exists. They will notice immediately when
 *  it does not."  [Doctrine Part 0, principle 5]
 */

import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetId, Take, TakeId } from '../domain/document.js';
import { newId } from '../domain/ids.js';
import { secondsToFrames, type Frames } from '../domain/time.js';
import { ingestSegments } from '../render/ingest.js';
import { measureDurationSeconds } from '../render/probe.js';
import { paths, safe } from './paths.js';

export interface AssembledTake {
  take: Take;
  mezzaninePath: string;
  segments: number;
  synthesisedVideo: boolean;
}

export async function assembleTake(
  conversationId: string,
  takeId: string,
  options: {
    /** How many leading segments were captured before the key press. */
    prerollSegments?: number;
    captureMimeType?: string;
    recovered?: boolean;
  } = {},
): Promise<AssembledTake> {
  const dir = paths.chunks(conversationId, takeId);
  const names = (await readdir(dir)).filter((n) => n.endsWith('.part')).sort();
  if (names.length === 0) throw new Error(`take ${takeId} has no segments`);
  const segmentPaths = names.map((n) => join(dir, n));

  // The pre-roll length is MEASURED from the segments, never assumed from a
  // nominal segment duration -- MediaRecorder's segments are not exactly the
  // length you asked for, and an assumed pre-roll would misplace the trim.
  const prerollCount = Math.min(options.prerollSegments ?? 0, segmentPaths.length);
  let prerollSeconds = 0;
  for (const path of segmentPaths.slice(0, prerollCount)) {
    try {
      prerollSeconds += await measureDurationSeconds(path);
    } catch {
      // An unreadable segment contributes nothing rather than failing the take.
    }
  }

  const assetId = newId('asset');
  await mkdir(paths.assets(conversationId), { recursive: true });
  const mezzaninePath = paths.takeMezzanine(conversationId, assetId);
  const result = await ingestSegments(segmentPaths, mezzaninePath);

  const durationFrames = result.info.durationFrames;
  const prerollFrames: Frames = Math.min(secondsToFrames(prerollSeconds), durationFrames);

  const take: Take = {
    id: safe(takeId) as TakeId,
    assetId: assetId as AssetId,
    createdAt: new Date().toISOString(),
    durationFrames,
    prerollFrames,
    mediaInFrame: prerollFrames,
    mediaOutFrame: durationFrames,
    ...(options.captureMimeType ? { captureMimeType: options.captureMimeType } : {}),
    ...(options.recovered ? { recoveredFromCrash: true } : {}),
  };

  return { take, mezzaninePath, segments: segmentPaths.length, synthesisedVideo: result.synthesisedVideo };
}

export const takeMezzaninePath = paths.takeMezzanine;
