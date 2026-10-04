import { isOwner } from '../../../../../../../src/auth/request.js';
import { isPublished } from '../../../../../../../src/domain/channel.js';
import { livePlaylist } from '../../../../../../../src/domain/playout.js';
import { loadChannel } from '../../../../../../../src/store/channels.js';
import { producingAudio } from '../../../../../../../src/store/audioRenditions.js';
import { fail } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; language: string }> };

/**
 * One alternate audio rendition's playlist.  [CHANNEL §7, N-10]
 *
 * THE SAME WINDOW ARITHMETIC AS THE VIDEO, deliberately: an
 * audio rendition that computed its own window would drift from
 * the variant it accompanies, and a player holding two playlists
 * whose media sequences disagree is a player that stalls at
 * every segment boundary. `livePlaylist` is the one function
 * that decides what a window is. [D-19]
 *
 * A LANGUAGE NOBODY IS WRITING IS A 404, not an empty playlist.
 * An empty one is a player waiting for segments that will never
 * come; a 404 is a player falling back to the audio it already
 * has.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, language } = await params;
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'not found');
  }
  if (!isPublished(channel) && !(await isOwner(request))) return fail(404, 'not found');

  const made = await producingAudio(channel.id);
  if (!made.includes(language.toLowerCase())) return fail(404, 'not found');

  const body = livePlaylist(
    Date.now(),
    (index) => `/api/channels/${channel.id}/audio/`
      + `${language.toLowerCase()}/stream/${index}`);
  return new Response(body, {
    headers: {
      'content-type': 'application/vnd.apple.mpegurl',
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}
