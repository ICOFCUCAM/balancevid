import { isOwner } from '../../../../../../src/auth/request.js';
import { paths } from '../../../../../../src/store/paths.js';
import { loadChannel } from '../../../../../../src/store/channels.js';
import { fail, serveFile } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * One segment of the wire.  [Doctrine CHANNEL §7, U-23, D-18]
 *
 * Serves a file the playout process wrote, exactly as the render routes serve
 * a file the worker wrote. The web tier does not produce segments and must
 * not be tempted to: a request that triggered an encode would put four
 * seconds of ffmpeg on a request thread, which is the thing U-23 exists to
 * prevent, and it would do it once per viewer.
 *
 * A 404 here is ordinary and correct. The window is a few segments wide and
 * moving; a player asking for one that has been swept, or one not yet made,
 * is asking for something that does not exist, and saying so is how it knows
 * to ask for the playlist again.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, index } = await params;
  if (!/^\d{1,15}$/.test(index)) return fail(404, 'not found');
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'not found');
  }
  const published = channel.publication && !channel.publication.unpublishedAt;
  if (!published && !(await isOwner(request))) return fail(404, 'not found');

  return serveFile(
    request, paths.channelSegment(channel.id, Number(index)), 'video/mp2t');
}
