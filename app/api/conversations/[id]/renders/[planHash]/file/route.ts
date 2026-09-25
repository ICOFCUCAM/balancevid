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
  const access = await accessTo(request, conversation);
  if (access === 'denied') return fail(404, 'conversation not found');

  /*
   * AND ONLY THE RENDER THAT WAS PUBLISHED.  [U-31, D-03]
   *
   * Publishing a conversation publishes ONE video: the one the publication
   * names, which is what a responder is answering. Every other render on disk
   * is the author's working material — a draft made before they cut something,
   * a shape they exported and thought better of — and serving those to anyone
   * who has the link and a hash is publishing what nobody pressed publish on.
   *
   * Found by a review, after the same hole was found in the other studio's
   * copy of this route. The two were written a month apart and had the same
   * gap in the same place, which is what a shared rule with two
   * implementations does.
   */
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(planHash)) return fail(404, 'not found');
  if (access !== 'owner' && conversation.publication?.planHash !== planHash) {
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
