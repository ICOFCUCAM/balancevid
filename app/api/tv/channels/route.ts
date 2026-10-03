import { directory } from '../../../../src/domain/channelListing.js';
import { listChannels } from '../../../../src/store/channels.js';
import { json } from '../../../../src/web/http.js';
import { lineupFor } from '../../../../src/store/lineup.js';

export const dynamic = 'force-dynamic';

/**
 * The lineup.  [Doctrine CHANNEL §2, D-03, TV-NETWORK N-4]
 *
 * > *"How does BalanceVid know and organize all the channels owned
 * > by different users?"*
 *
 * PUBLIC, AND SEPARATE FROM `/api/published` ON PURPOSE. That route
 * answers *what has an audience* across the whole product and will
 * keep conversations in it for ever; this one is television, and
 * `/tv` asks it four times on four pages. A client fetching a list
 * of conversations to draw a channel grid is a client paying for an
 * answer it discards.
 *
 * WHAT IS NOT HERE is everything a broadcaster works with. The row
 * `directory()` builds is a poster outside a cinema, and the line
 * is the one `policy.ts` already drew for the transmission itself.
 */
export async function GET(): Promise<Response> {
  const channels = await listChannels().catch(() => []);
  const lineup = await lineupFor(channels.map((one) => one.id)).catch(() => ({}));
  return json({ channels: directory(channels, lineup) });
}
