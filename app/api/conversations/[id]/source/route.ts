import { loadConversation } from '../../../../../src/store/repository.js';
import { paths } from '../../../../../src/store/paths.js';
import { fail, serveFile } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Serve the source for playback.
 *
 * By default this is the editing PROXY, not the mezzanine: small, quick to
 * seek, and decodable everywhere. Both are produced from the same normalised
 * media and carry the same frame count at the same rate, so the frame the user
 * sees while choosing where to interrupt is the frame the renderer cuts. A
 * player disagreeing with the renderer about which frame is frame N would make
 * frame-exactness true of the file and false of the experience.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  const assetId = conversation.source.mezzanineAssetId;
  if (!assetId) return fail(409, 'source is still being normalised');

  if (new URL(request.url).searchParams.get('kind') === 'mezzanine') {
    return serveFile(request, paths.asset(id, `${assetId}mezz`, 'mp4'), 'video/mp4');
  }
  return serveFile(request, paths.sourceProxy(id, assetId), 'video/webm');
}
