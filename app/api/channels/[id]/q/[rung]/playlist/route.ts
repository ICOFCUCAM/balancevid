import { isOwner } from '../../../../../../../src/auth/request.js';
import { isPublished } from '../../../../../../../src/domain/channel.js';
import { livePlaylist } from '../../../../../../../src/domain/playout.js';
import { loadChannel } from '../../../../../../../src/store/channels.js';
import { producingRungs } from '../../../../../../../src/store/videoRenditions.js';
import { fail } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; rung: string }> };

/**
 * One lower rung's playlist.  [CHANNEL §7, §23]
 *
 * THE SAME WINDOW ARITHMETIC AS THE HOUSE RENDITION, through
 * the same `livePlaylist`. A rung that computed its own window
 * would drift from the one it is an alternative to, and a
 * player switching between two ladders whose media sequences
 * disagree re-buffers at every switch — which is the exact
 * moment a ladder is supposed to help. [D-19]
 *
 * A RUNG NOBODY IS WRITING IS A 404, not an empty playlist. An
 * empty one is a player waiting for segments that will never
 * come; a 404 is a player staying on the rung it has.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, rung } = await params;
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'not found');
  }
  if (!isPublished(channel) && !(await isOwner(request))) return fail(404, 'not found');

  const made = await producingRungs(channel.id);
  if (!made.includes(rung)) return fail(404, 'not found');

  const body = livePlaylist(
    Date.now(),
    (index) => `/api/channels/${channel.id}/q/${rung}/stream/${index}`);
  return new Response(body, {
    headers: {
      'content-type': 'application/vnd.apple.mpegurl',
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}
