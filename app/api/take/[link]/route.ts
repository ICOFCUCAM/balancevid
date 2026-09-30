import {
  ParticipationError, advance, open,
} from '../../../../src/domain/participationEdit.js';
import { viewFor } from '../../../../src/domain/participation.js';
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

  return json({ request: viewFor(request) });
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
