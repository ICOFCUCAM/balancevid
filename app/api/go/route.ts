import {
  type Campaign, callRow, publicCalls,
} from '../../../src/domain/campaign.js';
import { listCampaigns } from '../../../src/store/campaigns.js';
import { theAccount } from '../../../src/store/accounts.js';
import { originOf } from '../../../src/web/share.js';
import { json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * What this installation is running a call for.
 *   [GO-VIRAL V-4, §10; Doctrine D-03, U-31]
 *
 * A DESTINATION ON THE GATEWAY THAT ALREADY EXISTS, NOT A SECOND
 * SITE. `/tv` made this argument first and it is the same one: the
 * public layer is `middleware.ts` default-closed with
 * `src/auth/policy.ts` as the single place a surface is declared
 * public, and a competition is another thing that layer serves. A
 * second deployment with its own auth would be a second place to
 * get the default wrong.
 *
 * THREE CONDITIONS, ALL OF THEM THE ORGANISER'S OWN DECISION, and
 * they are `/api/participate`'s three with the nouns changed: the
 * call EXISTS, it is LISTED, and it has not finished. A call
 * nobody listed is at its own address and in no index, which is
 * exactly what unlisted means everywhere else in this product.
 *
 * IT ADDS NO ACCESS, ONLY DISCOVERY — the sentence `policy.ts`
 * already uses about the television directory. Every call this
 * answers with was reachable by its address before this route
 * existed; what was missing was any way to find out that it did.
 *
 * AND IT COUNTS NOBODY. No visitor record, no referrer kept, no
 * third-party anything. The numbers this product reports about a
 * call are counts of what the installation wrote about itself,
 * and they are on the call's own page. [§20]
 */
export async function GET(request: Request): Promise<Response> {
  const now = new Date().toISOString();
  const campaigns = await listCampaigns().catch(() => [] as Campaign[]);

  let name = 'BalanceVid';
  try {
    name = (await theAccount()).name || name;
  } catch {
    /* An installation that cannot read its own account still lists. */
  }

  return json({
    instance: { name, origin: originOf(request) },
    calls: publicCalls(campaigns, now).map((one) => callRow(one, now)),
  });
}
