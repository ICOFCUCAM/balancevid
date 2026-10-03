import {
  ParticipationError, advance, open,
} from '../../../../src/domain/participationEdit.js';
import { outcomeFor, viewFor } from '../../../../src/domain/participation.js';
import {
  currentTerms, judgementsOf, scorecardOf, wallOf,
} from '../../../../src/domain/campaign.js';
import { resultsFor } from '../../../../src/domain/judging.js';
import { callOf } from '../../../../src/store/campaigns.js';
import { listRequests } from '../../../../src/store/requests.js';
import { mutateRequest, requestForLink } from '../../../../src/store/requests.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ link: string }> };

/**
 * What somebody holding a Take link is asked for.
 *   [Doctrine D-25, D-03; TAKE-APP T2a, T3, T16]
 *
 * THE SECOND ROUTE IN THIS PRODUCT A STRANGER MAY REACH, and it is built
 * the way the first one was: the link IS the credential, the answer to a
 * wrong one is the same as the answer to a link that never existed, and
 * what comes back is a VIEW rather than a document.
 *
 * `viewFor` is the only thing that decides what crosses. A participant
 * learns what is being asked of them, what they may send, and how much
 * they have sent. They do not learn which performance this is, who else
 * was asked, what anybody else sent, or what the producer thought of it
 * — because the audience does not enter the studio, and a client handed
 * the document is a client that can be read for it.
 *
 * NO GUEST SESSION IS ISSUED, which is the difference from the room and
 * is deliberate. A room is a place you are in for an hour with other
 * people, so a cookie naming you is worth the complexity. A request is
 * answered once, by one person, from a link they already hold: the link
 * is the session, and a cookie would be a second credential to revoke.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { link } = await params;
  const now = new Date().toISOString();
  const found = await requestForLink(link, now);
  /*
   * ONE ANSWER FOR EVERY WAY OF BEING WRONG. Missing, mistyped, expired,
   * rotated, already attached — all 404. A 403 would confirm that
   * something is there to guess at, which is D-03's whole argument about
   * whether a given document exists being itself private.
   */
  if (!found) return fail(404, 'that link is not open');

  /*
   * OPENING IT IS A FACT ABOUT THE REQUEST, so it is written down: a
   * producer who can see that a link was opened three days ago and
   * nothing was ever recorded knows something they can act on. Failing
   * to record that must not fail the fetch, though — somebody standing
   * in front of a camera should not be told "no" because a state
   * transition would not apply.
   */
  const request = await mutateRequest(found.id, (draft) => {
    try {
      open(draft, now);
    } catch {
      /* Already past `opened`. Nothing to record, nothing to report. */
    }
  }).catch(() => found);

  /*
   * AND WHAT THIS CALL ASKS THEM TO AGREE TO, BEFORE THE CAMERA
   * OPENS.  [GO-VIRAL V-3]
   *
   * THE WORDS, NOT A FLAG. A surface told only that consent is
   * required would have to invent the terms or link away to them,
   * and a person who agreed to words they never saw has agreed to
   * nothing. So the text travels with the assignment, on the one
   * fetch the Take App already makes, and the recorder is not
   * reachable until they have answered it.
   *
   * `viewFor` STILL DECIDES WHAT CROSSES. The call is loaded here
   * and two of its fields are handed over; its title, its prize,
   * its deadline and the ninety-nine other people answering it
   * stay on the server. [D-25]
   */
  const call = await callOf(request);

  /*
   * AND WHAT HAPPENED TO IT, WHICH IS WHY A DEVICE COMES BACK.
   *   [GO-VIRAL V-7]
   *
   * THERE IS NOWHERE TO SEND NEWS TO, AND THAT IS THE DESIGN.
   * `/take` asks for no account and the request holds no address
   * — no email, no phone number, no push identity — so the only
   * way a phone learns that its entry was used, passed over, or
   * placed in a result is by asking with the link it already
   * holds. This is the answer. Nothing about the asking device
   * is written down anywhere on this installation.
   *
   * THE STANDING IS WORKED OUT HERE AND NOT IN THE DOMAIN,
   * because it takes a campaign, every request under it and the
   * judgements — three reads — and `outcomeFor` is a pure
   * function of two numbers. [D-19]
   *
   * AND ONLY ONCE THE ORGANISER HAS ANNOUNCED, through the same
   * two states the public page uses. A participant learning
   * their place while the panel is still marking would be
   * learning it before anybody else and before it was true.
   * [V-5, V-6]
   */
  const standing = await placeOf(request, call);
  return json({
    request: viewFor(
      request, call && currentTerms(call), outcomeFor(request, standing)),
  });
}

/**
 * Where this entry came, once there is a result to come in.
 *
 * ONLY FOR AN ENTRY IN THE PUBLIC STANDING. `wallOf` is what
 * decides which entries a result names, and somebody who did not
 * agree to be shown — or took it back — is not in it. Telling
 * them a place in a standing they are not in would be telling
 * them about somebody else's. [V-3, V-4, V-6]
 */
async function placeOf(
  request: Awaited<ReturnType<typeof requestForLink>>,
  call: Awaited<ReturnType<typeof callOf>>,
): Promise<{ place: number; of: number } | null> {
  if (!request || !call) return null;
  if (call.state !== 'results' && call.state !== 'completed') return null;

  const requests = await listRequests().catch(() => []);
  const shown = new Set(wallOf(call, requests).map((one) => one.submissionId));
  const standings = resultsFor(scorecardOf(call), judgementsOf(call))
    .filter((verdict) => shown.has(verdict.entry));
  const mine = new Set((request.submissions ?? []).map((one) => one.id));
  const place = standings.findIndex((verdict) => mine.has(verdict.entry as never));
  return place < 0 ? null : { place: place + 1, of: standings.length };
}

/**
 * Say what is happening at this end.  [TAKE-APP T16a]
 *
 * The one thing a participant may change about the request itself, and
 * it is narrow on purpose: `recording`, so the producer's inbox can tell
 * a link that was opened and abandoned from one where somebody is
 * standing in front of a camera right now.
 *
 * WHAT THEY MAY NOT DO IS EVERYTHING ELSE. `accepted`, `rejected` and
 * `attached` are the producer's words about their own production, and a
 * participant who could write them could put their own submission into
 * somebody's programme. The allowlist is a list of ONE.
 */
export async function POST(httpRequest: Request, { params }: Params): Promise<Response> {
  const { link } = await params;
  const now = new Date().toISOString();
  const found = await requestForLink(link, now);
  if (!found) return fail(404, 'that link is not open');

  const body = await httpRequest.json().catch(() => ({})) as { state?: string };
  if (body.state !== 'recording') {
    return fail(400, 'a participant may only say that they are recording');
  }

  try {
    const request = await mutateRequest(found.id, (draft) => {
      advance(draft, 'recording', now);
    });
    return json({ request: viewFor(request) });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(409, error.message);
    throw error;
  }
}
