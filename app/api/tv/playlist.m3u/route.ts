import { carried, m3uLineup } from '../../../../src/domain/tvExport.js';
import { listChannels } from '../../../../src/store/channels.js';
import { lineupFor } from '../../../../src/store/lineup.js';
import { originOf } from '../../../../src/web/share.js';

export const dynamic = 'force-dynamic';

/**
 * The lineup, for a television.  [Doctrine CHANNEL §2, §7, D-03,
 * TV-NETWORK N-7]
 *
 * > *"M3U + XMLTV is already widely used for this kind of thing."*
 *
 * ONE ADDRESS A VIEWER PASTES INTO A SET-TOP BOX and the whole
 * installation arrives: every listed channel, its number, its
 * logo, its group, and `url-tvg` on the header so the guide comes
 * with it rather than needing a second subscription.
 *
 * ABSOLUTE URLS, WHICH IS WHY THIS ROUTE READS THE REQUEST. A
 * television has no page to resolve a relative path against.
 * `originOf` is the answer the share cards and the room QR codes
 * already use — it reads `x-forwarded-host` and
 * `x-forwarded-proto`, which is what makes it correct behind the
 * proxy this product is deployed behind.
 *
 * NOT CACHED, for the reason the live playlist is not: the lineup
 * changes when a channel is published or withdrawn, and a
 * television that holds a day-old list is a viewer tuning to a
 * channel that no longer transmits. It is small and it is
 * computed; there is nothing to save.
 *
 * AND IT ALLOCATES, like every other public television surface.
 * `lineupFor` is lazy and idempotent: a channel gets its number
 * the first time anything asks, so a lineup exported before
 * anybody opened `/tv` is numbered all the same.
 */
export async function GET(request: Request): Promise<Response> {
  const channels = await listChannels().catch(() => []);
  const lineup = await lineupFor(channels.map((one) => one.id)).catch(() => ({}));
  const origin = originOf(request);
  const body = m3uLineup(
    carried(channels, lineup), origin, `${origin}/api/tv/guide.xml`);
  return new Response(body, {
    headers: {
      /*
       * THE IPTV CONTENT TYPE, not `application/vnd.apple.mpegurl`,
       * which is the one the live playlist serves. A client that
       * is handed the Apple type for a channel list tries to play
       * the list.
       */
      'content-type': 'audio/x-mpegurl; charset=utf-8',
      'content-disposition': 'inline; filename="balancevid.m3u"',
      'cache-control': 'no-store',
    },
  });
}
