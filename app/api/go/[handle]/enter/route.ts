import {
  type Campaign, bySlugOrId, campaignSays, currentTerms, takingEntries,
} from '../../../../../src/domain/campaign.js';
import { viewFor } from '../../../../../src/domain/participation.js';
import { ParticipationError } from '../../../../../src/domain/participationEdit.js';
import { listCampaigns } from '../../../../../src/store/campaigns.js';
import { linkFor } from '../../../../../src/store/requests.js';
import { type ClaimKind, claim } from '../../../../../src/web/claim.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ handle: string }> };

/** Which door of the three this call's track is behind. */
const DOOR: Record<string, ClaimKind> = {
  performance: 'music', conversation: 'video', channel: 'programme',
};

/**
 * Enter this call.  [GO-VIRAL V-4, §3; D-25, U-31]
 *
 * > **Judged on:** *"A stranger with no account reaches a
 * > campaign, reads the rules, watches entries and **enters**, on
 * > a phone."*
 *
 * THE DOOR THAT NAMES THE CALL, which V-2 wrote down as missing in
 * the same comment that explains why: *"with two live, a stranger
 * pressing Take this song has not chosen. The generic door on the
 * discovery listing names a document, not a call; guessing which
 * call they meant would put somebody's entry in a competition they
 * never read the rules of. V-4's campaign page is the door that
 * names one."* This is that door, and the ambiguity is gone
 * because the address is the call.
 *
 * AND IT SAYS WHY WHEN IT WILL NOT. Everywhere else on this layer
 * one refusal covers every reason, because a different answer for
 * *there is one but it is shut* is a way to enumerate what an
 * installation is working on. A LISTED CALL HAS ALREADY SAID ALL
 * OF THAT: its page prints the deadline, the state and
 * `campaignSays` in the organiser's own words. Repeating it in the
 * refusal leaks nothing and saves somebody staring at a button
 * that answered *no such thing* about a page they are reading.
 * [D-03]
 *
 * WHAT IT DOES NOT SAY IS ANYTHING ABOUT THE TRACK. A call whose
 * performance was unpublished under it answers 404, in the words
 * the other door uses, because the existence of that document is
 * not this call's to disclose.
 *
 * IT MINTS THE SAME OBJECT, through the same `claim` the discovery
 * listing uses. The only difference between the two doors is which
 * call is stamped and whether `listed` is asked. [`src/web/claim.ts`]
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { handle } = await params;
  const now = new Date().toISOString();
  const campaigns = await listCampaigns().catch(() => [] as Campaign[]);
  const call = bySlugOrId(campaigns, handle);
  if (!call) return fail(404, 'no such call');

  /*
   * THE CALL'S OWN CLOCK AND THE CALL'S OWN STATE, which are two
   * questions and `takingEntries` asks both: a call somebody
   * opened and whose deadline has not passed. A scheduled call,
   * one being judged and one that is over all refuse here, and the
   * page the person is reading already says which. [V-2]
   */
  if (!takingEntries(call, now)) {
    return fail(409, campaignSays(call, now));
  }

  const kind = DOOR[call.track.kind];
  if (!kind) return fail(404, 'no such call');

  try {
    const made = await claim({
      kind, id: call.track.id, now, campaign: call.id,
    });
    if ('refused' in made) {
      /*
       * BOTH REFUSALS IN THE TRACK'S OWN VOICE, not the call's.
       * Whether the song behind this call is published, still
       * open to strangers, and under its ceiling is the
       * producer's business and not something the call page knows
       * — so this is the same 404 the other door gives and for
       * the same reason. [D-03]
       */
      return fail(404, 'that is not open for anybody to take part in');
    }
    return json({
      request: viewFor(made.request, currentTerms(call)),
      link: linkFor(made.request),
      /* Where to go next, so a page does not build the path itself. */
      take: `/take/${linkFor(made.request)}`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(409, error.message);
    return fail(404, 'that is not open for anybody to take part in');
  }
}
