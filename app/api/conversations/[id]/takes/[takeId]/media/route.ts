import { accessTo } from '../../../../../../../src/auth/request.js';
import { paths } from '../../../../../../../src/store/paths.js';
import { loadConversation } from '../../../../../../../src/store/repository.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; takeId: string }> };

/**
 * A take's own media, for auditioning it in Studio Mode.
 *
 * Serves the normalised take, so the frames the user scrubs while trimming are
 * the frames the renderer will cut — the same parity the source proxy keeps
 * (U-39). Byte ranges are supported, because trimming without scrubbing is
 * guesswork.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, takeId } = await params;
  /*
   * Media of a published conversation is public; media of a draft is not.
   * 404 rather than 403 for a stranger: 403 confirms the draft exists, and
   * that a draft exists is itself private (D-03).
   */
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  if (await accessTo(request, conversation) === 'denied') {
    return fail(404, 'conversation not found');
  }

  const kind = new URL(request.url).searchParams.get('kind');

  for (const intervention of conversation.interventions) {
    const take = intervention.takes.find((t) => t.id === takeId);
    if (!take) continue;

    // The still for the conversation timeline. Absent until the take has
    // been assembled, which is a 404 rather than an error.
    if (kind === 'poster') {
      return serveFile(request, paths.takePoster(id, take.assetId), 'image/jpeg');
    }
    if (take.durationFrames === 0) return fail(409, 'this take is still being assembled');
    if (new URL(request.url).searchParams.get('kind') === 'proxy') {
      return serveFile(request, paths.takeProxy(id, take.assetId), 'video/webm');
    }
    return serveFile(request, paths.takeMezzanine(id, take.assetId), 'video/mp4');
  }
  return fail(404, 'no such take');
}
