import { bySlug } from '../../../../../../src/domain/channelListing.js';
import { libraryFile } from '../../../../../../src/store/libraryMedia.js';
import { listChannels } from '../../../../../../src/store/channels.js';
import { fail, serveFile } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * A station's logo, to a stranger.
 *   [Doctrine CHANNEL §2, §3, D-03, TV-NETWORK N-7]
 *
 * THE PUBLIC TELEVISION NETWORK DREW EVERY LOGO FROM A ROUTE NO
 * VIEWER COULD READ. `/tv`, the directory, the search results and
 * the station page all render `<img src="/api/library/<assetId>">`,
 * and that route is the broadcaster's own monitor: *"Owner-only,
 * like everything else that is not published."* A signed-out
 * viewer — which is every viewer `/tv` was built for — got 401 and
 * a broken picture, on every card, on every page.
 *
 * Measured rather than reasoned about:
 *
 *     /tv                      200
 *     /api/tv/channels         200
 *     /api/library/<assetId>   401
 *
 * THE AUTHORITY IS THE CHANNEL, NOT THE ASSET, which is why this
 * is a route of its own rather than a hole in that one. The
 * library holds everything a broadcaster has ever uploaded; making
 * it readable to open one picture would open all of them. Here the
 * question asked is *"may a stranger see this station?"* — `bySlug`,
 * the same gate the station page uses — and only then *"what is its
 * logo?"* Two checks in two places, both of which must say yes,
 * exactly as `policy.ts` describes the published-conversation
 * routes.
 *
 * ONE ASSET PER CHANNEL AND NO WAY TO NAME ANOTHER. The asset id
 * is read out of the station document; it is never taken from the
 * caller. A route that accepted both a slug and an asset id would
 * be the library route again with an extra step.
 *
 * AN UNLISTED STATION HAS A BANNER TOO. `bySlug` answers for public
 * and unlisted alike, because unlisted means *"works through
 * direct link/domain but doesn't appear in the directory"* — a
 * station page that drew no banner would be a different page, not an
 * unlisted one. [§10]
 *
 * AND IT IS CACHEABLE, which the owner's route must not be. A banner
 * is the same bytes for everyone and appears on every row of the
 * directory; `serveFile` marks what it serves `private` because
 * everything that goes through it until now has been one person's.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { slug } = await params;
  const channels = await listChannels().catch(() => []);
  const channel = bySlug(channels, slug);
  const assetId = channel?.station?.bannerAssetId;
  /*
   * ONE ANSWER FOR EVERY WAY OF BEING WRONG: no such address, a
   * station that is private or offline, a station with no banner,
   * and a banner whose file has gone. A 403 on the third would say
   * the station exists. [D-03]
   */
  if (!assetId) return fail(404, 'not found');
  const found = libraryFile(assetId);
  if (!found) return fail(404, 'not found');

  const response = await serveFile(request, found.path, found.container.type);
  if (response.ok || response.status === 206) {
    response.headers.set('cache-control', 'public, max-age=300');
  }
  return response;
}
