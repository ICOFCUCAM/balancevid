import QRCode from 'qrcode';
import { isOwner } from '../../../../../../src/auth/request.js';
import { loadConversation } from '../../../../../../src/store/repository.js';
import { fail } from '../../../../../../src/web/http.js';
import { joinUrl } from '../../../../../../src/web/room.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The invitation, as a square on a screen.  [Doctrine ROOM §7]
 *
 * "Imagine you're physically together in a classroom or meeting. You display:
 *  Join this conversation. QR code. Everyone scans it."
 *
 * Rendered on the SERVER and owner-only, for one reason: the code encodes the
 * invite token, and the token is the credential. Handing the token to a page
 * so it can draw its own square would mean any script on that page could read
 * it — and the host's browser is the one place it already legitimately is,
 * but the room view a guest receives deliberately omits it.
 *
 * SVG rather than a raster: it is projected onto a wall at whatever size the
 * room needs, and a scaled-up PNG is a code that will not scan from the back.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'conversation not found');

  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  const room = conversation.room;
  if (!room?.open) return fail(409, 'this conversation has no open room');

  const origin = new URL(request.url).origin;
  const svg = await QRCode.toString(joinUrl(origin, id, room.inviteToken), {
    type: 'svg',
    margin: 1,
    // Q, not the default M: a code on a wall is read at an angle, in poor
    // light, sometimes partly blocked by whoever is standing in front of it.
    errorCorrectionLevel: 'Q',
    color: { dark: '#0e0f11', light: '#ffffff' },
  });

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Never cached: the token rotates, and a stale square on a proxy is an
      // invitation the host believes they withdrew.
      'cache-control': 'no-store, private',
    },
  });
}
