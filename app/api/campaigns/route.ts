import { campaignSays, clockSays } from '../../../src/domain/campaign.js';
import { CampaignError, newCampaign } from '../../../src/domain/campaignEdit.js';
import { whenProblem } from '../../../src/domain/availability.js';
import { listCampaigns, saveCampaign } from '../../../src/store/campaigns.js';
import { listRequests } from '../../../src/store/requests.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * The calls this installation has opened.  [GO-VIRAL V-2]
 *
 * OWNER-ONLY, LIKE EVERY OTHER LISTING OF WHAT AN ACCOUNT HOLDS.
 * A call's PUBLIC face is V-4's page, served from the discovery
 * layer with what a stranger may see; this is the organiser's
 * own list, with the state machine on it. [D-03]
 */
export async function GET(): Promise<Response> {
  const now = new Date().toISOString();
  const campaigns = await listCampaigns();
  /*
   * HOW MANY HAVE ANSWERED EACH, counted once for the whole list.
   * A scan of the requests, honest about its cost the way the
   * claim route is: O(requests) per listing, no index, at the
   * scale one installation holds.
   */
  const requests = await listRequests();
  return json({
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      title: campaign.title,
      track: campaign.track,
      rules: campaign.rules,
      window: campaign.window,
      state: campaign.state,
      createdAt: campaign.createdAt,
      /*
       * BOTH ANSWERS, BECAUSE THEY DISAGREE AND BOTH ARE TRUE.
       * `state` is where somebody moved it to; `clock` is where
       * its window says it should be. A surface showing only the
       * first says LIVE about a call that shut an hour ago; one
       * showing only the second cannot tell JUDGING from
       * RESULTS. [campaign.ts `clockSays`]
       */
      clock: clockSays(campaign, now),
      says: campaignSays(campaign, now),
      entries: requests.filter((one) => one.campaign === campaign.id).length,
    })),
  });
}

/**
 * Open a call.
 *
 * IT STARTS `scheduled`, WHATEVER THE CLOCK SAYS, because the
 * clock and the state answer two questions: *when does this open*
 * and *has anybody opened it*. A call that put itself live on
 * creation would be a call nobody decided to run.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as {
    title?: unknown; track?: { kind?: unknown; id?: unknown };
    asks?: unknown; criteria?: unknown; prize?: unknown;
    opensAt?: unknown; closesAt?: unknown; closingMinutes?: unknown;
  };

  const kind = body.track?.kind;
  const id = body.track?.id;
  if (kind !== 'performance' && kind !== 'conversation' && kind !== 'channel') {
    return fail(400, 'a call is about a performance, a conversation or a channel');
  }
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return fail(400, 'that is not something to open a call about');
  }
  /* The same refusal V-1 gives, in the same words. [D-19] */
  const badWindow = whenProblem(body);
  if (badWindow) return fail(400, badWindow);

  try {
    const campaign = newCampaign({
      title: String(body.title ?? ''),
      track: { kind, id },
      rules: {
        asks: String(body.asks ?? ''),
        ...(typeof body.criteria === 'string' ? { criteria: body.criteria } : {}),
        ...(typeof body.prize === 'string' ? { prize: body.prize } : {}),
      },
      window: {
        respondable: true,
        access: 'anyone',
        ...(typeof body.opensAt === 'string' && body.opensAt
          ? { opensAt: new Date(Date.parse(body.opensAt)).toISOString() } : {}),
        ...(typeof body.closesAt === 'string' && body.closesAt
          ? { closesAt: new Date(Date.parse(body.closesAt)).toISOString() } : {}),
      },
      ...(Number.isInteger(body.closingMinutes)
        ? { closingMinutes: body.closingMinutes as number } : {}),
      now: new Date().toISOString(),
    });
    await saveCampaign(campaign);
    return json({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof CampaignError) return fail(409, error.message);
    throw error;
  }
}
