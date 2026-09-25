import { accessTo } from '../../../../src/auth/request.js';
import { generateInteractive } from '../../../../src/interactive/generate.js';
import { renderInteractive } from '../../../../src/interactive/html.js';
import { loadRepresentationContext } from '../../../../src/web/context.js';
import { shareFor } from '../../../../src/web/share.js';
import { fail } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The conversation, to move around in.  [Doctrine D-16, U-14, U-31]
 *
 * Served as its own HTML rather than wrapped in application chrome, for the
 * same reason the article is: what it is for is being sent to somebody. It
 * carries its own head, its own link preview, and its own styling, and it
 * works saved to a disk.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let context;
  try {
    context = await loadRepresentationContext(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  if (await accessTo(request, context.conversation) === 'denied') {
    return fail(404, 'conversation not found');
  }

  const doc = generateInteractive({
    conversation: context.conversation,
    sourceTranscript: context.sourceTranscript ?? null,
    ...(context.transcriptVersion ? { transcriptVersion: context.transcriptVersion } : {}),
    ...(context.takeTranscripts ? { takeTranscripts: context.takeTranscripts } : {}),
    generatedAt: context.generatedAt,
  });

  const share = await shareFor(request, context.conversation, 'watch');

  return new Response(
    renderInteractive(doc, {
      ...(share ? { share } : {}),
      articleHref: `/c/${id}/article`,
      cardHref: (index) => `/api/conversations/${id}/cards/${index}`,
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
