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
import { ffmpegCapture } from '../render/ffmpeg.js';

/**
 * HOW MUCH MEDIA IS ACTUALLY IN THE BUFFER.  [§7, §9, U-02, D-14]
 *
 * THE QUESTION NOTHING ASKED. `watchTheFeed` watches the file's
 * SIZE and answers "is it still growing" — which it has to, since a
 * connection that is up and sending nothing is a failure with a
 * green light on it. But the engine does not read bytes, it reads
 * SECONDS, at a point on the clock twelve seconds behind now; and
 * a buffer that is growing steadily can still be short of that
 * point, for ever, because every dropped chunk is two seconds the
 * clock keeps and the file never gets. Measured, reading past the
 * end produces a ZERO-BYTE SEGMENT: the viewer's picture stops and
 * every instrument stays green.
 *
 * DEMUXED, NOT DECODED. `-c copy -f null -` walks the container and
 * reports where the last packet lands without turning a single
 * frame into pixels. Measured on a twenty-minute live WebM: **0.32s
 * demuxed against 6.2s decoded**, for the same answer to the
 * millisecond. A decode here would cost more than the segment the
 * engine is trying to make.
 *
 * AND NOT `ffprobe -show_format`, which reads the duration out of
 * the header. A browser's MediaRecorder writes its header before it
 * knows the duration and never goes back — the field is absent or
 * zero for exactly the files this is about. The question has to be
 * asked of the packets. [U-02]
 *
 * A FILE IT CANNOT READ ANSWERS `undefined` rather than zero,
 * because the two mean opposite things to the caller: zero is "the
 * buffer is empty, put a slate up", and nothing is "I could not
 * find out, carry on as before". Guessing zero here would take a
 * working channel off the air on a transient read error. [D-21]
 */
export async function bufferReachMs(path: string): Promise<number | undefined> {
  let said;
  try {
    said = await ffmpegCapture(['-i', path, '-map', '0:v:0', '-c', 'copy',
      '-f', 'null', '-']);
  } catch {
    return undefined;
  }
  /*
   * ffmpeg's own running clock, last value, off stderr — the same
   * place `runCapture` exists to expose. It is the end of the last
   * packet it walked, which is precisely what "how far can I read"
   * means.
   */
  const times = said.stderr.match(/time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/g);
  const last = times?.[times.length - 1];
  if (!last) return undefined;
  const [, hours, minutes, seconds] = /time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/
    .exec(last) ?? [];
  if (hours === undefined || minutes === undefined || seconds === undefined) {
    return undefined;
  }
  const ms = Math.round(
    ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000);
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

/** Keep it: the buffer becomes an archived recording. */
export async function keepBuffer(
  channelId: string, bufferId: string, assetId: string,
): Promise<void> {
  await mkdir(paths.channelAssets(channelId), { recursive: true });
  await rename(
    paths.channelLiveBuffer(channelId, bufferId),
    paths.channelAsset(channelId, assetId, 'webm'),
  );
}

/** Do not keep it: the buffer goes. */
export async function discardBuffer(
  channelId: string, bufferId: string,
): Promise<void> {
  await rm(paths.channelLiveBuffer(channelId, bufferId), { force: true });
}
