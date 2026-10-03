import {
  consentFrom, withdrawConsent,
} from '../../../../../src/domain/consent.js';
import { currentTerms, needsConsent, termsSigned } from '../../../../../src/domain/campaign.js';
import { viewFor } from '../../../../../src/domain/participation.js';
import { callOf } from '../../../../../src/store/campaigns.js';
import { mutateRequest, requestForLink } from '../../../../../src/store/requests.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ link: string }> };

/**
 * Agreeing, before the camera opens.  [GO-VIRAL V-3; Doctrine D-03, D-25]
 *
 * > *"If a campaign is going to put somebody's face on a public
 * > results page, in a clip, possibly on television, then the thing
 * > that permits that is not a tick box they passed on the way to
 * > the camera. It is a record."*
 *
 * ITS OWN DOOR, AND NOT A FIELD ON THE UPLOAD, which is the one
 * design decision in this stage worth arguing. A `consent` object
 * folded into the PUT that sends the recording would be simpler by
 * one route and wrong by the whole point: consent written in the
 * same request as four minutes of video was not shown to anybody
 * before they recorded it. The ORDER is the substance here. This
 * route exists so the record is made at the moment the person read
 * the words, and the recorder is not reachable until it has been.
 *
 * SO THERE IS EXACTLY ONE WAY TO WRITE ONE. The submission route
 * refuses an entry without it and does not accept one inline;
 * a second path would be a way past the sign.
 *
 * THE LINK IS THE CREDENTIAL, as it is at every other take door,
 * and a wrong one is answered exactly as one that never existed.
 *
 * WHAT IT WILL NOT DO IS INVENT THE WORDS. A hash the client made
 * up is refused: the only hashes this accepts are ones the call
 * itself has on record, which is what makes the record mean
 * something later. [`termsSigned`]
 */
export async function POST(httpRequest: Request, { params }: Params): Promise<Response> {
  const { link } = await params;
  const now = new Date().toISOString();
  const found = await requestForLink(link, now);
  if (!found) return fail(404, 'that link is not open');

  const call = await callOf(found);
  /*
   * NOTHING TO AGREE TO IS NOT A THING TO AGREE TO. A request under
   * no call, or under a call that asks nothing, has no words on
   * record — and a consent record pointing at no terms is the
   * unreadable signature this whole stage exists to avoid.
   */
  if (!call || !needsConsent(call)) {
    return fail(409, 'there is nothing to agree to here');
  }

  const body = await httpRequest.json().catch(() => ({})) as {
    termsHash?: unknown; permits?: unknown;
  };
  const record = consentFrom(body, now);
  if (!record) {
    return fail(400, 'an agreement names the exact words and says '
      + 'that the video may be entered');
  }
  if (!termsSigned(call, record.termsHash)) {
    return fail(409, 'those are not the terms of this call');
  }

  /*
   * CHANGING YOUR MIND BEFORE YOU RECORD IS ALLOWED, AND AFTER IT
   * IS NOT.
   *
   * Both halves are needed and they point in opposite directions.
   * Somebody who agreed on Monday, recorded nothing, and comes back
   * to a call whose terms were improved on Tuesday must be able to
   * agree to Tuesday's — otherwise an organiser fixing a typo locks
   * out everybody who had already read the old one.
   *
   * Once a recording has been sent, the record is evidence rather
   * than a setting: a second agreement would let somebody who sent
   * a video under *entry only* decide afterwards that they had
   * agreed to broadcast all along, or the reverse. What is
   * available then is `DELETE` — taking it back, which stops future
   * use and unmakes nothing.
   */
  if ((found.submissions ?? []).length > 0) {
    return fail(409, 'something has already been sent under the '
      + 'agreement that is on record — it can be taken back, '
      + 'but not rewritten');
  }

  const updated = await mutateRequest(found.id, (draft) => {
    draft.consent = record;
  });
  return json(
    { request: viewFor(updated, currentTerms(call)) }, { status: 201 });
}

/**
 * Taking it back.  [GO-VIRAL V-3]
 *
 * > *"A withdrawal timestamp that stops future use and unmakes
 * > nothing already done."*
 *
 * WHICH IS `unpublish`'S OWN RULE, ONE PERSON OVER: *"they answered
 * a version of this that existed and was consented to; withdrawing
 * now cannot unmake that."* What went out last week went out. What
 * has not gone out does not, because `permits` is false from this
 * moment and every surface asks it.
 *
 * THE RECORD IS MARKED AND NOT DELETED. A withdrawal that erased
 * the consent would erase the evidence that there had ever been
 * any — which is the opposite of an audit, and would leave a
 * producer unable to say on what basis last week's broadcast went
 * out.
 *
 * NO CALL IS LOADED AND NONE IS NEEDED. Taking back what you
 * agreed to does not depend on anybody's terms still being there.
 */
export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  const { link } = await params;
  const now = new Date().toISOString();
  const found = await requestForLink(link, now);
  if (!found) return fail(404, 'that link is not open');
  if (!found.consent) return fail(409, 'nothing was agreed to here');

  const updated = await mutateRequest(found.id, (draft) => {
    if (draft.consent) withdrawConsent(draft.consent, now);
  });
  const call = await callOf(updated);
  return json({ request: viewFor(updated, call && currentTerms(call)) });
}
