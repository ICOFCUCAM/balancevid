import {
  type Campaign, bySlugOrId, callRow, judgementsOf, loopNumbers, panelOf,
  scorecardOf, wallOf,
} from '../../../../src/domain/campaign.js';
import { resultsFor, saidAbout } from '../../../../src/domain/judging.js';
import { listCampaigns } from '../../../../src/store/campaigns.js';
import { listRequests } from '../../../../src/store/requests.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ handle: string }> };

/**
 * One call, as a stranger reads it.  [GO-VIRAL V-4, §10, §20]
 *
 * > **Judged on:** *"A stranger with no account reaches a
 * > campaign, reads the rules, watches entries and enters, on a
 * > phone; and a campaign that is `listed: false` is reachable by
 * > its link and absent from every index."*
 *
 * UNLISTED IS REACHABLE HERE AND ABSENT FROM `/api/go`, which is
 * the second half of that sentence and the whole of what unlisted
 * has meant since the station directory: *"works through direct
 * link/domain but doesn't appear in the directory."* Listing is
 * decided in the index; this door answers to whoever has the
 * address.
 *
 * AND A CALL THAT DOES NOT EXIST ANSWERS LIKE EVERY OTHER MISSING
 * THING ON THIS LAYER — 404, in the same words, because a
 * different refusal for *there is one but you may not* is a way to
 * enumerate what an installation is working on. [D-03]
 *
 * THE RULES ARE HERE AND THE TERMS ARE NOT. The criteria are
 * published because *"a competition whose basis is announced after
 * the entries is not one"*; the terms are what somebody agrees to
 * at the moment they enter, and the Take surface already carries
 * them on the one fetch it makes. Two different documents for two
 * different moments. [V-3]
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { handle } = await params;
  const now = new Date().toISOString();
  const campaigns = await listCampaigns().catch(() => [] as Campaign[]);
  const call = bySlugOrId(campaigns, handle);
  if (!call) return fail(404, 'no such call');

  const requests = await listRequests().catch(() => []);
  /*
   * ONE READING OF WHAT MAY BE SHOWN, used by the wall and by
   * the result. Two would be two answers, and the one that was
   * wrong would be the one nobody was looking at. [D-19]
   */
  const shownEntries = wallOf(call, requests);
  const shown = new Set(shownEntries.map((one) => one.submissionId));

  return json({
    call: {
      ...callRow(call, now),
      /*
       * WHAT IT ASKS FOR AND WHAT IT WILL BE JUDGED ON, in the
       * organiser's own words. `prize` is text and this product
       * does not pay it — `docs/GO-VIRAL.md`'s **Not built** says
       * why: a system that sat between two people and a sum of
       * money would acquire obligations that have nothing to do
       * with recorded speech. [V-2]
       */
      ...(call.rules.criteria ? { criteria: call.rules.criteria } : {}),
      ...(call.rules.prize ? { prize: call.rules.prize } : {}),
      /*
       * WHETHER ENTERING MEANS AGREEING TO SOMETHING, without
       * saying what. The words are long and belong on the surface
       * where somebody is about to agree to them; a page that
       * promised *no* and then met a wall of terms would be
       * worse than one that says so here. [V-3]
       */
      asksConsent: (call.terms?.length ?? 0) > 0,
    },
    /*
     * WHAT MAY BE SHOWN, AND ONLY WHAT ITS MAKER SAID MAY BE.
     * `wallOf` asks `permits(consent, 'display')` per entry, so an
     * entry whose maker did not tick that box is not in this
     * array and an entry that was taken back leaves it the moment
     * it is. [V-3]
     */
    wall: shownEntries.map((one) => ({
      submissionId: one.submissionId,
      kind: one.kind,
      at: one.at,
      ...(one.participant ? { participant: one.participant } : {}),
      ...(one.durationSamples !== undefined
        ? { durationSamples: one.durationSamples } : {}),
      /* Same-origin, and the route checks all of this again. */
      media: `/api/go/${encodeURIComponent(handle)}/entries/`
        + `${encodeURIComponent(one.submissionId)}/media`,
    })),
    /*
     * AND THE RESULT, ONCE IT HAS BEEN ANNOUNCED.
     *   [GO-VIRAL V-6, V-5]
     *
     * NOT BEFORE. A panel marking in the open is a panel being
     * argued with while it marks, and a standing that moved
     * under a reader every time a mark was corrected would be a
     * result nobody could cite. `announce` is the organiser
     * saying it is done; until then this field is absent and the
     * page says the call is being judged.
     *
     * WITH THE WORDS AND THE NAMES, which is the whole of *"every
     * score carries its reason"* seen from outside. A public
     * result that was scores alone would be the oracle this
     * layer exists not to be. [V-5]
     *
     * AND ONLY FOR ENTRIES ON THE WALL. An entry whose maker did
     * not agree to it being shown — or who took that back — is
     * not named in a public standing either. One predicate,
     * every surface. [V-3, V-4]
     */
    ...(call.state === 'results' || call.state === 'completed'
      ? {
        results: resultsFor(scorecardOf(call), judgementsOf(call))
          .filter((verdict) => shown.has(verdict.entry))
          .map((verdict, place) => ({
            place: place + 1,
            entry: verdict.entry,
            score: verdict.score,
            outOf: verdict.outOf,
            judges: verdict.judges,
            byCriterion: verdict.byCriterion,
            said: saidAbout(verdict.entry, judgementsOf(call), panelOf(call)),
          })),
        panel: panelOf(call).map((one) => one.name),
      } : {}),
    /*
     * THE LOOP, MEASURED, AND THE FIFTH NUMBER DELIBERATELY
     * ABSENT. Shares cannot be counted without watching where a
     * visitor came from, and this installation does not. [§20]
     */
    numbers: loopNumbers(call, requests),
  });
}
