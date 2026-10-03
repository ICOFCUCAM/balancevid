import { campaignSays, clockSays } from '../../../../src/domain/campaign.js';
import {
  CampaignError, announce, begin, beginJudging, complete, enterLastStretch,
  moveDeadline, reopenToLive,
} from '../../../../src/domain/campaignEdit.js';
import { loadCampaign, mutateCampaign } from '../../../../src/store/campaigns.js';
import { listRequests } from '../../../../src/store/requests.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ID = /^camp_[A-Za-z0-9_-]{1,64}$/;

/** One call, with what has answered it. */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!ID.test(id)) return fail(404, 'no such call');
  const now = new Date().toISOString();
  let campaign;
  try {
    campaign = await loadCampaign(id);
  } catch {
    return fail(404, 'no such call');
  }
  const entries = (await listRequests()).filter((one) => one.campaign === id);
  return json({
    campaign,
    clock: clockSays(campaign, now),
    says: campaignSays(campaign, now),
    /*
     * WHAT ANSWERED IT, COUNTED AND NOT LISTED. The entries
     * themselves are submissions on requests, and they are the
     * producer's inbox's business — a second listing of them here
     * would be the inbox built twice. [D-19]
     */
    entries: entries.length,
    submitted: entries.filter((one) => (one.submissions ?? []).length > 0).length,
  });
}

/**
 * Move it along.  [GO-VIRAL V-2]
 *
 * ONE VERB PER MOVE, rather than a `state` field somebody sets.
 * The campaign machine has guards that are about the clock — a
 * call cannot go live before it opens, and judging cannot start
 * while entries are arriving — and a route that took a state
 * would be a route that had to re-derive which guard applied.
 * The domain decides; this decodes. [D-06]
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!ID.test(id)) return fail(404, 'no such call');
  const body = await request.json().catch(() => ({})) as {
    action?: unknown; by?: unknown; closesAt?: unknown;
  };
  const now = new Date().toISOString();
  const by = typeof body.by === 'string' ? body.by : undefined;

  try {
    const updated = await mutateCampaign(id, (draft) => {
      switch (body.action) {
        case 'begin': begin(draft, now, by); break;
        case 'closing': enterLastStretch(draft, now, by); break;
        case 'reopen': reopenToLive(draft, now, by); break;
        case 'judge': beginJudging(draft, now, by); break;
        case 'announce': announce(draft, now, by); break;
        case 'complete': complete(draft, now, by); break;
        case 'deadline':
          if (typeof body.closesAt !== 'string') {
            throw new CampaignError('say when it closes');
          }
          moveDeadline(draft, body.closesAt, now, by);
          break;
        default:
          throw new CampaignError(`that is not something to do with a call`);
      }
    });
    return json({
      campaign: updated,
      clock: clockSays(updated, now),
      says: campaignSays(updated, now),
    });
  } catch (error) {
    if (error instanceof CampaignError) return fail(409, error.message);
    return fail(404, 'no such call');
  }
}
