import { loadTranscript } from '../../../../../src/store/transcripts.js';
import { loadConversation } from '../../../../../src/store/repository.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The source transcript.  [Doctrine U-03, §16]
 *
 * Part of the Conversation's knowledge layer, not a representation -- the
 * captions, the article and the claim cards are all rendered from this.
 *
 * Served separately from the document because it is large and changes on a
 * different cadence: the document changes every time the user speaks, the
 * transcript once per source.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  try {
    await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const requested = new URL(request.url).searchParams.get('version');
  const loaded = await loadTranscript(id, requested ? Number(requested) : undefined);
  if (!loaded) return json({ transcript: null, version: null });

  return json({ version: loaded.version, transcript: loaded.transcript });
}
