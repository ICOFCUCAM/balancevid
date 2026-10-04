import { isOwner } from '../../../../../../../../src/auth/request.js';
import { isPublished } from '../../../../../../../../src/domain/channel.js';
import { loadChannel } from '../../../../../../../../src/store/channels.js';
import { paths } from '../../../../../../../../src/store/paths.js';
import { fail, serveFile } from '../../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; language: string; index: string }> };

/**
 * One segment of an alternate audio rendition.  [CHANNEL §7, N-10]
 *
 * THE SAME SHAPE AS THE VIDEO SEGMENT, including the 404 that is
 * ordinary rather than wrong: the window is a few segments wide
 * and moving, and a player asking for one that has been swept is
 * asking for something that does not exist.
 *
 * THE LANGUAGE IS NOT CHECKED AGAINST A LIST HERE, because
 * `channelAudio` refuses anything that is not a subtag by
 * building a path that holds no segments. One rule, in the
 * function that builds the path, rather than a second copy at
 * every door that takes a language. [D-19, D-06]
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, language, index } = await params;
  if (!/^\d{1,15}$/.test(index)) return fail(404, 'not found');
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'not found');
  }
  if (!isPublished(channel) && !(await isOwner(request))) return fail(404, 'not found');

  return serveFile(
    request,
    paths.channelAudioSegment(channel.id, language, Number(index)),
    'video/mp2t');
}
