/**
 * What happens to a live buffer when the broadcast ends.
 * [Doctrine CHANNEL §8, D-18, INV-17]
 *
 *     Camera → Microphone → Live ingest → Broadcast encoder → Online TV
 *
 * "If you choose Save this live session, then it becomes an archived
 *  recording. If you don't choose that, the temporary live buffers are
 *  discarded after the broadcast."
 *
 * Two functions, named for the two outcomes, and nothing in between. There is
 * deliberately no "archive everything" path and no configuration that would
 * produce one: a channel that kept every second it ever transmitted is the
 * duplication rule broken from the other end, and the way that fault arrives
 * is as a default nobody chose.
 *
 * PROMOTION IS A RENAME, NOT A COPY. The bytes do not move and are not
 * re-encoded; the file crosses from `live/` to `assets/` and acquires an
 * asset id. That is the whole difference between a buffer and an archive, and
 * it costs nothing — which matters, because the alternative is an hour of
 * video being copied at the exact moment somebody has just finished
 * presenting and wants to see whether it worked.
 */

import { mkdir, rename, rm } from 'node:fs/promises';
import { paths } from './paths.js';

/** Keep it: the buffer becomes an archived recording. */
export async function keepBuffer(
  channelId: string, bufferId: string, assetId: string,
): Promise<void> {
  await mkdir(paths.channelAssets(channelId), { recursive: true });
  await rename(
    paths.channelLiveBuffer(channelId, bufferId),
    paths.channelAsset(channelId, assetId, 'mp4'),
  );
}

/** Do not keep it: the buffer goes. */
export async function discardBuffer(
  channelId: string, bufferId: string,
): Promise<void> {
  await rm(paths.channelLiveBuffer(channelId, bufferId), { force: true });
}
