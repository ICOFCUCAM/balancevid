import QRCode from 'qrcode';

import { isOwner } from '../../../../../src/auth/request.js';
import { isOpen } from '../../../../../src/domain/participation.js';
import { linkFor, loadRequest } from '../../../../../src/store/requests.js';
import { fail } from '../../../../../src/web/http.js';
import { originOf } from '../../../../../src/web/share.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ requestId: string }> };

/** The shape our ids have. Refused rather than sanitised. [INV-15] */
const REQUEST = /^req_[A-Za-z0-9]{1,64}$/;

/**
 * A request to perform, as a square somebody points a phone at.
 *   [Doctrine ROOM §7; TAKE-APP T2, T2b; D-25]
 *
 * THE POINT IS THE ROOM A BAND IS ALREADY STANDING IN. The take link
 * was sendable — it is a URL, and a URL goes through WhatsApp, SMS and
 * mail — but everything about sending it assumed the performer was
 * somewhere else. Four people in a rehearsal room, each holding the
 * phone they will record on, do not want a link in a chat thread; they
 * want the producer to put the square on the laptop and all scan it.
 *
 * ONE ROUTE FOR ALL THREE HOLDERS, and that is why it hangs off the
 * request rather than off the performance. A conversation asking for a
 * video answer and a channel asking for one are the same request object
 * — that is what lets the host's queue read one list — and a QR route
 * per holder would be three copies of this file differing in the
 * loader. [D-19]
 *
 * OWNER-ONLY AND SERVER-RENDERED, for the Room's own reason: the code
 * encodes the link, the link IS the credential, and a page handed the
 * token so it could draw its own square would be a page any script on
 * it could read the token from. [D-25]
 *
 * SVG rather than a raster: it goes on a wall or a laptop lid at
 * whatever size the room needs, and a scaled-up PNG is a code that
 * will not scan from the back.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { requestId } = await params;
  if (!REQUEST.test(requestId)) return fail(404, 'no such request');
  if (!(await isOwner(request))) return fail(404, 'no such request');

  let found;
  try {
    found = await loadRequest(requestId);
  } catch {
    return fail(404, 'no such request');
  }

  /*
   * A CLOSED REQUEST HAS NO SQUARE, and the test is the one the link
   * itself is judged by rather than a second opinion about what
   * "closed" means. A code on a wall that leads to "that link is not
   * open" is worse than no code: somebody scans it, is refused, and
   * blames their phone. [D-19]
   */
  if (!isOpen(found, new Date().toISOString())) {
    return fail(409, 'that request is closed');
  }

  /*
   * THE ORIGIN THE BROWSER REACHED, NOT THE ONE NODE IS LISTENING ON.
   *
   * `new URL(request.url).origin` is what this route was written with
   * and it is wrong here in a way that only a QR code exposes. A page
   * composes its own links from `window.location`, so they are right
   * whatever the server thinks; a square is drawn on the server, and
   * the server behind a proxy sees the INTERNAL address.
   *
   * The first browser run of this route proved it: the studio was
   * open on `127.0.0.1:3100` and the code encoded `localhost:3100` —
   * which on the phone that scans it means the phone. The one
   * situation the square exists for, a band in a room each scanning
   * the producer's screen, is the one that fails. [T2b]
   */
  const origin = originOf(request);
  const svg = await QRCode.toString(
    `${origin}/take/${linkFor(found)}`, {
      type: 'svg',
      margin: 1,
      // Q, not the default M: a code on a laptop screen is read at an
      // angle, in poor light, sometimes partly blocked by whoever is
      // standing in front of it.
      errorCorrectionLevel: 'Q',
      color: { dark: '#0e0f11', light: '#ffffff' },
    });

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Never cached: the link rotates, and a stale square on a proxy is
      // an invitation the producer believes they withdrew.
      'cache-control': 'no-store, private',
    },
  });
}
