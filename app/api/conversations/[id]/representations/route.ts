import { accessTo } from '../../../../../src/auth/request.js';
import { isPublicRepresentation } from '../../../../../src/auth/policy.js';
import { REPRESENTATIONS, findRepresentation } from '../../../../../src/representations/registry.js';
import { loadRepresentationContext } from '../../../../../src/web/context.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Every representation of a Conversation, from one endpoint.
 *
 * INV-00 says the Conversation is canonical and everything else is a
 * representation of it. This route is that sentence made operational: with no
 * `id` it lists what this Conversation can currently produce; with one, it
 * generates that representation on the spot. Nothing is stored, because
 * nothing needs to be -- a representation that cannot be regenerated is a
 * fork (D-16).
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;

  let context;
  try {
    context = await loadRepresentationContext(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  /*
   * A published conversation is readable by anyone (U-31) — but only the
   * artefact, not the working material. The render plan and the timeline
   * describe how it was made; the bundle is the author's own admin.
   */
  const access = await accessTo(request, context.conversation);
  if (access === 'denied') return fail(404, 'conversation not found');

  const wanted = new URL(request.url).searchParams.get('id');
  if (access === 'public' && wanted !== null && !isPublicRepresentation(wanted)) {
    return fail(404, `unknown representation: ${wanted}`);
  }
  if (!wanted) {
    return json({
      representations: REPRESENTATIONS
        .filter((r) => access === 'owner' || isPublicRepresentation(r.id))
        .map((representation) => ({
        id: representation.id,
        label: representation.label,
        mediaType: representation.mediaType,
        inputs: representation.inputs,
        available: representation.available(context),
      })),
    });
  }

  const representation = findRepresentation(wanted);
  if (!representation) return fail(404, `unknown representation: ${wanted}`);
  if (!representation.available(context)) {
    return fail(409, `${wanted} cannot be produced from this conversation yet`);
  }

  try {
    return new Response(representation.generate(context), {
      headers: {
        'content-type': representation.mediaType,
        'content-disposition': `inline; filename="${representation.id}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'could not generate');
  }
}
