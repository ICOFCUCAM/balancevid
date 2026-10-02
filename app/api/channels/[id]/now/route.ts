import { isOwner } from '../../../../../src/auth/request.js';
import {
  isPublished, nextAfter, programmeStart, whatIsOn,
} from '../../../../../src/domain/channel.js';
import type { Channel, OnAir } from '../../../../../src/domain/channel.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import { newestSegmentAt } from '../../../../../src/store/playoutHealth.js';
import { healthSentence, streamState } from '../../../../../src/domain/health.js';
import { captionFor } from '../../../../../src/domain/caption.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * What is on, for somebody watching.  [Doctrine CHANNEL §17, D-03, U-31]
 *
 * A viewer's page needs two sentences — what this is, and what is next — and
 * a channel page without them is a black rectangle with a play button.
 *
 * IT IS NOT THE CHANNEL DOCUMENT. Serving that to a viewer would hand out the
 * live ingest ids, the destinations, the recordings and every reference in
 * the schedule, which is the broadcaster's working material in exactly the
 * sense a performance's takes are (STUDIO-TWO §14). This returns titles and
 * clock times and nothing that names a file.
 *
 * A SLOT WITH NO TITLE IS THE CHANNEL'S NAME, not the document id behind it.
 * Falling back to `render conv_a1b2c3…` would leak an identifier through the
 * one hole a careful route left open, and "BalanceVid TV" is what a listing
 * without a title says anyway.
 */
function titleOf(channel: Channel, on: OnAir): string {
  switch (on.kind) {
    case 'off': return 'Off air';
    case 'live': return on.session.segment ? channel.name : 'Live';
    case 'programme': return on.programme.title ?? channel.name;
    case 'rotation': return on.entry.title ?? channel.name;
    /*
     * An emergency or a failover is not announced. The viewer is being shown
     * a caption card because something went wrong behind it, and a channel
     * that captioned its own fault "BACKUP" would be telling them about a
     * problem they cannot do anything about. [§9]
     */
    default: return channel.name;
  }
}

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
  const caption = captionFor(on, titleOf(channel, on), {}, channel.name);

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
