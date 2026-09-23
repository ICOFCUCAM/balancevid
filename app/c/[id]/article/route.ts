import { generateArticle } from '../../../../src/article/generate.js';
import { renderHtml } from '../../../../src/article/html.js';
import { accessTo } from '../../../../src/auth/request.js';
import { loadRepresentationContext } from '../../../../src/web/context.js';
import { fail } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The article, as a page.  [Doctrine U-14]
 *
 * A complete, standalone document: indexable, screen-reader accessible,
 * quotable in text, readable in two minutes where the video takes forty, and
 * printable. Served as its own HTML rather than wrapped in application chrome,
 * because what it is for is being read and cited elsewhere.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let context;
  try {
    context = await loadRepresentationContext(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  // The article of a published conversation is meant to be read and cited
  // elsewhere (U-14). The article of a draft is the draft, in prose.
  if (await accessTo(request, context.conversation) === 'denied') {
    return fail(404, 'conversation not found');
  }

  const article = generateArticle({
    conversation: context.conversation,
    sourceTranscript: context.sourceTranscript ?? null,
    ...(context.transcriptVersion ? { transcriptVersion: context.transcriptVersion } : {}),
    ...(context.takeTranscripts ? { takeTranscripts: context.takeTranscripts } : {}),
    generatedAt: context.generatedAt,
  });

  return new Response(
    renderHtml(article, { conversationHref: (frame) => `/c/${id}?t=${frame}` }),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
