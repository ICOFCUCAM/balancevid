import {
  beingJudged, judgementsOf, panelOf, scorecardOf, wallOf,
} from '../../../../../src/domain/campaign.js';
/*
 * `judgementProblem` IS NOT RE-EXPORTED FROM HERE, and the build
 * is what said so: a Next route file may export its handlers and
 * nothing else. The surface that draws the form imports it from
 * `src/domain/judging.ts` directly, which is where it lives and
 * is the only copy either caller asks. [D-19; V-2 learned this
 * with `MOVES`]
 */
import { resultsFor } from '../../../../../src/domain/judging.js';
import { CampaignError, recordJudgement } from '../../../../../src/domain/campaignEdit.js';
import { loadCampaign, mutateCampaign } from '../../../../../src/store/campaigns.js';
import { listRequests } from '../../../../../src/store/requests.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ID = /^camp_[A-Za-z0-9_-]{1,64}$/;

/**
 * What the panel said, and what it adds up to.
 *   [GO-VIRAL V-5; Doctrine D-19, D-25]
 *
 * > **Judged on:** *"The result recomputes exactly from the stored
 * > judgements."*
 *
 * SO THE RESULT IS COMPUTED ON EVERY READ AND STORED NOWHERE.
 * `resultsFor` is a pure function of the judgements; a standing
 * written into the campaign would be a standing that disagrees
 * with the judgements under it the first time somebody corrects a
 * mark. What this route returns IS the recomputation, every time.
 *
 * THE ENTRIES COME FROM `wallOf`, WHICH IS V-4'S. The panel marks
 * what the public can see, for the reason that makes the two one
 * question: an entry whose maker did not agree to it being shown
 * is an entry whose maker is not in a public competition, and a
 * panel marking it would be scoring somebody who withdrew. One
 * predicate decides both. [D-19, V-3]
 *
 * OWNER-ONLY, by the gate it sits behind. `/api/go` is what a
 * stranger reads; this is where a call is marked.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!ID.test(id)) return fail(404, 'no such call');
  let campaign;
  try {
    campaign = await loadCampaign(id);
  } catch {
    return fail(404, 'no such call');
  }
  const requests = await listRequests().catch(() => []);
  const criteria = scorecardOf(campaign);
  const judgements = judgementsOf(campaign);

  return json({
    scorecard: criteria,
    panel: panelOf(campaign),
    open: beingJudged(campaign),
    /*
     * WHAT THERE IS TO MARK, in the order the wall draws it, with
     * each judge's own marks beside it so a form opens on what
     * they already said rather than blank. [V-4]
     */
    entries: wallOf(campaign, requests).map((entry) => ({
      ...entry,
      judgements: judgements.filter((one) => one.entry === entry.submissionId),
    })),
    judgements,
    results: resultsFor(criteria, judgements),
  });
}

/**
 * Mark one entry.
 *
 * EVERY RULE IS THE DOMAIN'S. This decodes a body and reports
 * what `recordJudgement` decided; it does not re-derive which
 * criteria exist, who is on the panel or whether a reason was
 * given. A route that answered those for itself would be a second
 * opinion about the rules of somebody's competition. [D-06]
 *
 * AND THE ENTRY MUST BE ONE OF THIS CALL'S, which is the one
 * thing the domain cannot check: `recordJudgement` is handed a
 * submission id and has no requests to look it up in. So it is
 * checked here, against the same `wallOf` the GET lists — a
 * judgement on an entry that is not in this call would be a score
 * attached to nothing, and after a withdrawal, a score attached
 * to somebody who left.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!ID.test(id)) return fail(404, 'no such call');
  const body = await request.json().catch(() => ({})) as {
    entry?: unknown; by?: unknown; says?: unknown; marks?: unknown;
  };
  const entry = typeof body.entry === 'string' ? body.entry : '';
  const by = typeof body.by === 'string' ? body.by : '';
  const says = typeof body.says === 'string' ? body.says : '';
  const marks = Array.isArray(body.marks)
    ? (body.marks as Record<string, unknown>[]).map((one) => ({
      criterion: String(one?.criterion ?? '') as never,
      score: Number(one?.score ?? NaN),
    })) : [];

  let campaign;
  try {
    campaign = await loadCampaign(id);
  } catch {
    return fail(404, 'no such call');
  }

  const requests = await listRequests().catch(() => []);
  if (!wallOf(campaign, requests).some((one) => one.submissionId === entry)) {
    return fail(404, 'no such entry in this call');
  }

  const now = new Date().toISOString();
  try {
    const updated = await mutateCampaign(id, (draft) => {
      recordJudgement(draft, { entry, by, marks, says, now });
    });
    const criteria = scorecardOf(updated);
    const judgements = judgementsOf(updated);
    return json({
      judgements: judgements.filter((one) => one.entry === entry),
      results: resultsFor(criteria, judgements),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof CampaignError) return fail(409, error.message);
    return fail(404, 'no such call');
  }
}
