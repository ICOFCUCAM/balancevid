import { evidenceCapture } from '../../../../../../../src/domain/document.js';
import { paths } from '../../../../../../../src/store/paths.js';
import { loadConversation } from '../../../../../../../src/store/repository.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; evId: string }> };

/**
 * The archived capture, for placing the region box and for the render.
 *
 * `?page=` picks one page of a paged document. Without it the page the
 * locator names is served, which is the one being cited — so the editor and
 * the render show the same page without either having to ask twice.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, evId } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  for (const intervention of conversation.interventions) {
    const evidence = intervention.evidence?.find((e) => e.id === evId);
    if (!evidence) continue;
    const wanted = Number(new URL(request.url).searchParams.get('page'));
    const pages = evidence.pageAssetIds ?? [];
    const asset = Number.isInteger(wanted) && wanted >= 1 && wanted <= pages.length
      ? pages[wanted - 1]
      : evidenceCapture(evidence);
    if (!asset) return fail(409, 'this evidence has no visual capture');
    return serveFile(request, paths.evidenceCapture(id, asset), 'image/png');
  }
  return fail(404, 'no such evidence');
}
