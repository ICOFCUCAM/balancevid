import { paths } from '../../../../../../../src/store/paths.js';
import { loadConversation } from '../../../../../../../src/store/repository.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; evId: string }> };

/** The archived capture, for placing the region box and for the render. */
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
    if (!evidence.captureAssetId) return fail(409, 'this evidence has no visual capture');
    return serveFile(request, paths.evidenceCapture(id, evidence.captureAssetId), 'image/png');
  }
  return fail(404, 'no such evidence');
}
