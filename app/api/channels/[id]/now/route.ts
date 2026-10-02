import { isOwner } from '../../../../../src/auth/request.js';
import {
  isPublished, nextAfter, programmeStart, whatIsOn,
} from '../../../../../src/domain/channel.js';
import type { Channel, OnAir } from '../../../../../src/domain/channel.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import { newestSegmentAt } from '../../../../../src/store/playoutHealth.js';
import { healthSentence, streamState } from '../../../../../src/domain/health.js';
import { captionFor } from '../../../../../src/domain/caption.js';
/* The viewer's answer to "what is on", which lived here and is
   needed by the directory, the guide, the station page and every
   client that follows. [D-19, N-2] */
import { viewerTitle } from '../../../../../src/domain/onAir.js';
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
  const stream = streamState(await newestSegmentAt(id), at);
  const on = whatIsOn(channel, at);
  const coming = nextAfter(channel, at);

  /*
   * NEXT IS RARELY THE NEXT FIXED SLOT, in a channel with a loop: it is
   * whichever comes sooner, the programme that pre-empts or the turn of the
   * rotation after this one. The same arithmetic the control room does, for
   * the same reason — a listing that skipped the loop would be wrong most of
   * the day. [§4]
   */
  let next: string | null = coming?.title ?? null;
  let nextAt: number | null = coming ? programmeStart(coming) : null;
  if (on.kind === 'rotation' && channel.rotation.length > 0) {
    const index = channel.rotation.findIndex((entry) => entry.id === on.entry.id);
    const after = channel.rotation[(index + 1) % channel.rotation.length]!;
    const soonest = coming ? programmeStart(coming) : Infinity;
    if (on.untilMs <= soonest) {
      /*
       * AND NOT THE CHANNEL'S NAME.  [C-42, C-43]
       *
       * This fell back to it, so a loop of untitled items listed
       * "NEXT REdemption TV" — the station announcing itself as its
       * own next programme. An untitled item has no title and the
       * listing says nothing rather than something false.
       */
      next = after.title ?? null;
      nextAt = on.untilMs;
    }
  }

  /*
   * WHAT IS ON, SAID THE SAME WAY THE PICTURE SAYS IT.  [§13, C-42, C-43]
   *
   * This route had its own `titleOf`, with the same fallback to the
   * channel's name, so the page under the player read
   *
   *     NOW PLAYING
   *     REdemption TV
   *
   * beside a header that already said REdemption TV. The lower third
   * had the identical fault and C-42 fixed it in `captionFor`; this
   * is that judgement reused rather than a second opinion about what
   * a programme is called.
   */
  const caption = captionFor(on, viewerTitle(channel, on), {}, channel.name);

  return json({
    name: channel.name,
    live: on.kind === 'live',
    title: caption?.lead ?? null,
    /** What kind of thing it is: "Studio Two · Performance". */
    kind: caption?.under ?? null,
    /* An instant, not a countdown: a cached countdown is wrong by its age. */
    untilMs: on.kind === 'programme' || on.kind === 'rotation' ? on.untilMs : null,
    next,
    nextAt,
    transmitting: stream === 'transmitting',
    says: healthSentence('running', stream, 'viewer'),
    ...(channel.publication?.author ? { author: channel.publication.author } : {}),
  }, { headers: { 'cache-control': 'no-store' } });
}
