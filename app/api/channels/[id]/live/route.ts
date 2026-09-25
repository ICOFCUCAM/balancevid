import { appendFile, mkdir } from 'node:fs/promises';

import { isOwner } from '../../../../../src/auth/request.js';
import { ingestById } from '../../../../../src/domain/channel.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import { paths } from '../../../../../src/store/paths.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * THE PIPE.  [Doctrine CHANNEL §7, §8, U-23, D-18]
 *
 *     Camera → Microphone → Live ingest → Broadcast encoder → Online TV
 *                             ^^^^^^^^^
 *
 * Everything downstream of this route was built and tested before this route
 * existed, which was the honest gap: a live session that was modelled,
 * scheduled, pre-empted, swept and invariant-checked, with nothing actually
 * arriving. This is what arrives.
 *
 * IT APPENDS, IT DOES NOT ASSEMBLE. The other two studios collect numbered
 * chunks and join them afterwards, because a take is finished before anybody
 * watches it. A broadcast is not: the playout engine is reading this file
 * four seconds behind the camera, so what it needs is ONE file that keeps
 * getting longer, not a directory that becomes a file later.
 *
 * That works because of what MediaRecorder writes. The first chunk carries
 * the WebM header and the ones after it are continuation clusters, so
 * appending them in order produces a stream a decoder can follow from the
 * start — which is exactly the shape a growing live file has to be.
 *
 * THE ORDER IS THE WIRE'S ORDER. There is no index parameter and there is
 * deliberately no reordering: a chunk that arrives late has missed the
 * broadcast, and inserting it would corrupt a file something is reading right
 * now. Live media is the one place in this product where "later" means
 * "never".
 *
 * NO FFMPEG HERE (U-23). The bytes are appended as they arrive; the playout
 * process does the encoding, exactly as the worker does for renders.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'channel not found');

  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'channel not found');
  }

  const live = channel.live;
  if (!live || live.phase === 'ended') {
    /*
     * 409 rather than 404: the channel is there and the encoder is not wrong
     * to be trying, it is just late — the operator ended the broadcast while
     * a chunk was in flight. The browser stops on this.
     */
    return fail(409, 'this channel is not live');
  }
  const ingest = ingestById(channel, live.ingestId);
  if (!ingest) return fail(409, 'this channel is not live');

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, 'that chunk is empty');
  /*
   * A ceiling per chunk, not per broadcast. A two-second slice of 720p is
   * a few hundred kilobytes; anything at this size is a bug or an attempt.
   */
  if (bytes.byteLength > 32 * 1024 * 1024) return fail(413, 'that chunk is too big');

  await mkdir(paths.channelLive(id), { recursive: true });
  await appendFile(paths.channelLiveBuffer(id, ingest.bufferId), bytes);

  return json({ ok: true, bytes: bytes.byteLength });
}
