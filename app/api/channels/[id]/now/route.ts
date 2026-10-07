import { isOwner } from '../../../../../src/auth/request.js';
import {
  isPublished, nextAfter, programmeStart, whatIsOn,
} from '../../../../../src/domain/channel.js';
import type { Channel, OnAir } from '../../../../../src/domain/channel.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import { newestSegmentAt, readBeat } from '../../../../../src/store/playoutHealth.js';
import { healthSentence, streamState } from '../../../../../src/domain/health.js';
/* The viewer's answer to "what is on", which lived here and is
   needed by the directory, the guide, the station page and every
   client that follows. [D-19, N-2] */
import { nowAndNext } from '../../../../../src/domain/onAir.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };


export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'channel not found');
  }
  if (!isPublished(channel) && !(await isOwner(request))) {
    return fail(404, 'channel not found');
  }

  const at = Date.now();
  /*
   * WHETHER ANYTHING IS ACTUALLY ARRIVING.  [§18]
   *
   * A viewer whose player never starts is owed a sentence rather than a
   * spinner. They get the fact about this channel and not a diagnosis of
   * somebody else's server: "not transmitting right now" is true, useful,
   * and says nothing about which process died.
   */
  /* The engine's round trip comes from its heartbeat: patience shorter
     than the cadence is a guaranteed false alarm, and this is the one
     surface a stranger reads. [streamPatience] */
  const [newest, beat] = await Promise.all([
    newestSegmentAt(id), readBeat().catch(() => null),
  ]);
  const stream = streamState(newest, at, beat?.roundTripMs ?? null);
  const on = whatIsOn(channel, at);
  const coming = nextAfter(channel, at);

  return json({
    name: channel.name,
    /*
     * THE TWO SENTENCES ARE COMPUTED IN THE DOMAIN NOW, because the
     * station page, the directory's LIVE NOW row and the guide all
     * ask the same question and four copies is four answers. This
     * route is what it always was: the public door onto them.
     * [D-19, N-4]
     */
    ...nowAndNext(channel, Date.now()),
    transmitting: stream === 'transmitting',
    says: healthSentence('running', stream, 'viewer'),
    ...(channel.publication?.author ? { author: channel.publication.author } : {}),
  }, { headers: { 'cache-control': 'no-store' } });
}
