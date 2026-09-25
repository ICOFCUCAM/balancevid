import { accessTo } from '../../../../src/auth/request.js';
import { generatePresentation } from '../../../../src/present/generate.js';
import { renderPresentation } from '../../../../src/present/html.js';
import { loadRepresentationContext } from '../../../../src/web/context.js';
import { fail } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The conversation, performed live.  [Doctrine D-16, INV-00, U-31]
 *
 * Its own page rather than application chrome, like the article and the
 * interactive page — but for a different reason. Those are sent to people;
 * this is put on a projector, and what it must not have is a navigation bar,
 * a sidebar, or anything else belonging to a piece of software.
 *
 * NO LINK PREVIEW, and `noindex` in the head. A presentation is a control
 * surface for a room, not a thing to be shared: a card for it would invite
 * people to open somebody else's lectern. The article and the interactive
 * page are what a link should point at, and they have the cards.
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

  const presentation = generatePresentation({
    conversation: context.conversation,
    sourceTranscript: context.sourceTranscript ?? null,
    ...(context.takeTranscripts ? { takeTranscripts: context.takeTranscripts } : {}),
    generatedAt: context.generatedAt,
  });

  return new Response(
    renderPresentation(presentation, { articleHref: `/c/${id}/article` }),
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}
