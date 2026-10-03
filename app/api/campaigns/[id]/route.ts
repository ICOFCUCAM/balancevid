import {
  campaignSays, callListed, clockSays, entryProblem, needsConsent,
  takenCallSlugs,
} from '../../../../src/domain/campaign.js';
import {
  CampaignError, announce, begin, beginJudging, complete, enterLastStretch,
  moveDeadline, reopenToLive, setListed, setSlug, setTerms,
} from '../../../../src/domain/campaignEdit.js';
import {
  listCampaigns, loadCampaign, mutateCampaign,
} from '../../../../src/store/campaigns.js';
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
    /*
     * AND HOW MANY OF THEM MAY ACTUALLY BE USED.  [GO-VIRAL V-3]
     *
     * NOT THE SAME NUMBER AS `entries`, AND AN ORGANISER HAS TO
     * SEE THAT IT IS NOT. A call asking people to agree to
     * something has entries that agreed, entries that have not
     * yet, and entries that took it back — and a page showing
     * only the total would let somebody announce a hundred
     * finalists and then find that four of them had withdrawn.
     *
     * `entryProblem` IS THE ONE THAT ANSWERS IT, the same
     * predicate the two doors ask, so the count cannot drift
     * from what the doors will do. A call with no terms counts
     * every entry, which is the number this line used to be.
     *
     * WITHDRAWALS ARE COUNTED SEPARATELY BECAUSE THEY ARE A
     * DIFFERENT FACT. *Has not agreed yet* is somebody still
     * deciding; *took it back* is a decision, and the audit this
     * stage exists for is the one that can say how many.
     */
    ...(needsConsent(campaign) ? {
      enterable: entries.filter(
        (one) => !entryProblem(campaign, one.consent)).length,
      withdrawn: entries.filter((one) => one.consent?.withdrawnAt).length,
    } : {}),
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
    action?: unknown; by?: unknown; closesAt?: unknown; terms?: unknown;
    slug?: unknown; listed?: unknown;
  };
  const now = new Date().toISOString();
  const by = typeof body.by === 'string' ? body.by : undefined;

  /*
   * EVERY OTHER CALL'S ADDRESS, READ ONCE, BEFORE THE MUTATION.
   * `mutateCampaign` takes a synchronous change and a disk read
   * inside it would be a read holding a document open.
   */
  const others = takenCallSlugs(
    await listCampaigns().catch(() => []), id);

  try {
    const updated = await mutateCampaign(id, (draft) => {
      switch (body.action) {
        case 'begin': begin(draft, now, by); break;
        case 'closing': enterLastStretch(draft, now, by); break;
        case 'reopen': reopenToLive(draft, now, by); break;
        case 'judge': beginJudging(draft, now, by); break;
        case 'announce': announce(draft, now, by); break;
        case 'complete': complete(draft, now, by); break;
        /*
         * WHAT ENTRANTS HAVE TO AGREE TO.  [GO-VIRAL V-3]
         *
         * A VERB AND NOT A FIELD ON THE CALL, like every other
         * move here, because it is not a setting: it APPENDS.
         * An organiser improving their wording leaves the old
         * wording on record, so Monday's entries still verify —
         * and a PATCH that overwrote a string could not do
         * that without silently invalidating every signature
         * already given.
         */
        case 'terms':
          if (typeof body.terms !== 'string') {
            throw new CampaignError('say what entrants have to agree to');
          }
          setTerms(draft, body.terms, now);
          break;
        /*
         * THE ADDRESS IT IS SHARED AT.  [GO-VIRAL V-4]
         *
         * The uniqueness check needs every other call's address,
         * which is a disk read and so belongs here rather than
         * in the domain — the arrangement `campaignEdit.ts`
         * states at its head. `setSlug` refuses rather than
         * repairs.
         */
        case 'slug':
          if (typeof body.slug !== 'string') {
            throw new CampaignError('say what address it should answer on');
          }
          setSlug(draft, body.slug, others);
          break;
        /* In the directory, or at its address and nowhere else. */
        case 'listed':
          if (typeof body.listed !== 'boolean') {
            throw new CampaignError('say whether it should be listed');
          }
          setListed(draft, body.listed);
          break;
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
      listed: callListed(updated),
      at: `/go/${updated.slug ?? updated.id}`,
    });
  } catch (error) {
    if (error instanceof CampaignError) return fail(409, error.message);
    return fail(404, 'no such call');
  }
}
