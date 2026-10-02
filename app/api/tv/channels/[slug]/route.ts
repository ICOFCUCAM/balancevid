import { bySlug, listingFor } from '../../../../../src/domain/channelListing.js';
import { nowAndNext } from '../../../../../src/domain/onAir.js';
import { listChannels } from '../../../../../src/store/channels.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * One station, by the address it answers to.
 *   [Doctrine CHANNEL §2, D-03, TV-NETWORK N-4]
 *
 * THE CHANNEL'S ID IS IN THE ANSWER, deliberately. It is already
 * public — `/t/<id>/watch`, the playlist and the segments are all
 * open — and the player on the station page cannot ask for a
 * playlist without it. Withholding it here while serving it there
 * would be a secret that is not one.
 *
 * ONE ANSWER FOR EVERY WAY OF BEING WRONG, which is the rule the
 * Take link already follows: a slug nobody holds, a channel that is
 * private and a channel that is offline all answer 404. *"A 403
 * would confirm that something is there to guess at."* [D-03]
 *
 * AN UNLISTED CHANNEL ANSWERS, because that is the whole of what
 * unlisted means — *"works through direct link/domain but doesn't
 * appear in the directory."* It is absent from `/api/tv/channels`
 * and present here. [§10]
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const channel = bySlug(await listChannels().catch(() => []), slug);
  if (!channel) return fail(404, 'no channel at that address');
  const listing = listingFor(channel);
  if (!listing) return fail(404, 'no channel at that address');
  return json({
    id: channel.id,
    channel: listing,
    on: nowAndNext(channel, Date.now()),
  });
}
