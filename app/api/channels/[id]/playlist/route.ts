import { isOwner } from '../../../../../src/auth/request.js';
import { livePlaylist } from '../../../../../src/domain/playout.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import { fail } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The live playlist.  [Doctrine CHANNEL §7, U-23]
 *
 * Computed, not read. The playlist is a function of the clock and nothing
 * else, so the web tier can produce it without touching the stream directory
 * — and, crucially, without running ffmpeg. What it names is what the playout
 * process has been writing; if that process is not running the segments 404
 * and the player says the channel is off air, which is true.
 *
 * NEVER CACHED. A live playlist that is a second old is a player a second
 * behind, and a CDN that holds one for a minute is a channel nobody can
 * watch.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'channel not found');
  }
  /*
   * A published channel is public; an unpublished one is the broadcaster's.
   * 404 rather than 403 for a stranger, for the reason every other route in
   * this product does it: that a draft exists is itself private. [D-03]
   */
  const published = channel.publication && !channel.publication.unpublishedAt;
  if (!published && !(await isOwner(request))) return fail(404, 'channel not found');

  const body = livePlaylist(
    Date.now(), (index) => `/api/channels/${channel.id}/stream/${index}`);
  return new Response(body, {
    headers: {
      'content-type': 'application/vnd.apple.mpegurl',
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}
