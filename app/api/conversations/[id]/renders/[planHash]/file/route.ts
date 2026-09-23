import { join } from 'node:path';
import { paths } from '../../../../../../../src/store/paths.js';
import { accessTo } from '../../../../../../../src/auth/request.js';
import { loadConversation } from '../../../../../../../src/store/repository.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; planHash: string }> };

/**
 * Serve a render output: the MP4 or either caption sidecar.
 *
 * The sidecars are not an extra -- every export ships them (INV-07), so they
 * are addressable from the same place as the video.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, planHash } = await params;
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

  const kind = new URL(request.url).searchParams.get('kind') ?? 'mp4';
  const dir = paths.render(id, planHash);

  switch (kind) {
    case 'srt': return serveFile(request, join(dir, 'FINAL.mp4.srt'), 'application/x-subrip');
    case 'vtt': return serveFile(request, join(dir, 'FINAL.mp4.vtt'), 'text/vtt');
    default: return serveFile(request, join(dir, 'FINAL.mp4'), 'video/mp4');
  }
}
