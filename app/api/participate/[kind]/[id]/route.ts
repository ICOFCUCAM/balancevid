import { viewFor } from '../../../../../src/domain/participation.js';
import { isListed } from '../../../../../src/domain/availability.js';
import { callFor } from '../../../../../src/domain/campaign.js';
import { ParticipationError } from '../../../../../src/domain/participationEdit.js';
import { listCampaigns } from '../../../../../src/store/campaigns.js';
import { linkFor } from '../../../../../src/store/requests.js';
import { claim, holderKind, isClaimKind } from '../../../../../src/web/claim.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ kind: string; id: string }> };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * "Take this song."  [TAKE-PLATFORM P2, P3, P4, PART FIVE; D-25, U-31]
 *
 * THE ONE ACT THE DISCOVERY SURFACE EXISTS FOR. Everything else in the
 * Take App begins with an invitation somebody sent; this begins with a
 * person finding a song and deciding to sing on it. The brief's own
 * words: *"If a particular song is enabled for participation, the user
 * sees: Take this song, and immediately enters the recording
 * experience."*
 *
 * IT MINTS THE SAME OBJECT A PRODUCER MINTS, and that is the whole
 * design. No self-service request type, no second invitation model, no
 * parallel assignment — a claimed request is a `ParticipationRequest`
 * indistinguishable from an invited one once it exists, so everything
 * downstream (the recorder, the queue, the inbox, acceptance) works
 * without knowing which it was. [D-19, P35]
 *
 * THE AUTHOR OPENED THIS DOOR, NOT US. A public write is only ever
 * safe when somebody deliberately made it public, so the test is
 * `maySubmit(…, 'anyone')` — not `respondable`, which says a take may
 * be sent by SOMEBODY, and not `listed`, which says it may be found.
 * An item open only to `link`, `members` or `invited` is refused here
 * whatever else is true of it: those policies mean the producer hands
 * out the invitations. [PART FIVE]
 *
 * AND ONLY SOMETHING ALREADY DISCOVERABLE. An unlisted item that
 * happens to be open to anyone is still not a thing a stranger should
 * reach by guessing an id — discovery and authorization are separate
 * questions, and this endpoint needs both answers to be yes.
 *
 * AND IT IS BOUNDED. Each press writes a request, so an item opened to
 * `anyone` without a ceiling is an item opened to a script. The
 * client's own memory covers the accidental repeat and not the
 * deliberate one, so the bound is here — a NUMBER the producer can
 * give ("a hundred takes from strangers"), finite by default, because
 * ticking "anyone" says who may take part rather than agreeing to an
 * unbounded number of them.
 *
 * IT COUNTS CLAIMS AND NOT INVITATIONS. A producer inviting a choir
 * must not spend the ceiling the public is coming through, which is
 * what `claimed` on the request exists to tell apart.
 *
 * A FULL ITEM ANSWERS LIKE A CLOSED ONE, as everything else here does:
 * "that is full" and "that does not exist" are the same 404, because a
 * counter a stranger can read is a counter a stranger can watch.
 *
 * AND SO DOES ONE OUTSIDE ITS WINDOW.  [GO-VIRAL V-1]
 *
 * A call that opens on Tuesday and a call that shut last night
 * answer with the same 404 as everything else, for the same
 * reason — a door that said *not yet* in a different voice from
 * *not here* is a door that tells a stranger which drafts exist.
 * The LISTING is where a person learns the two dates, because
 * the author chose to be listed; the door only ever says no.
 *
 * AND THE MINTING ITSELF NOW LIVES IN `src/web/claim.ts`.
 *   [GO-VIRAL V-4]
 *
 * V-4 built a second door — `/go/<slug>/enter`, the campaign page
 * naming the call that this one can only guess at — and three
 * branches of document-loading, four conditions and a ceiling
 * written out twice is where a condition gets forgotten. The
 * forgotten condition on a public write is the one that matters.
 * What stayed here is what is this door's own: `listed`, and the
 * silence about which of several calls was meant. [D-19]
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { kind, id } = await params;
  if (!ID.test(id) || !isClaimKind(kind)) {
    return fail(404, 'no such thing to take part in');
  }
  const now = new Date().toISOString();

  /* One refusal for every reason, so a probe cannot tell them apart. */
  const no = () => fail(404, 'that is not open for anybody to take part in');

  try {
    const made = await claim({
      kind,
      id,
      now,
      /*
       * AND ONLY SOMETHING ALREADY DISCOVERABLE, which is this
       * door's own condition and not the other one's. An unlisted
       * item that happens to be open to anyone is still not a
       * thing a stranger should reach by guessing an id —
       * discovery and authorization are separate questions, and
       * this endpoint needs both answers to be yes. The campaign
       * page is a listing in its own right and asks only the
       * second. [GO-VIRAL V-4]
       */
      also: (publication) => isListed(publication as never),
      /*
       * AND WHICH CALL THEY ARE ANSWERING, WHERE THERE IS ONE.
       *   [GO-VIRAL V-2]
       *
       * ONLY WHERE THERE IS NO QUESTION WHICH ONE. A track may
       * have several calls, and this door names a document rather
       * than a call. `callFor` answers nothing when two are open,
       * and the request belongs to none — which is what every
       * request was before V-2, and what `/go/<slug>/enter`
       * exists to resolve. [GO-VIRAL §3, V-4]
       */
      ...(await (async () => {
        const found = callFor(
          await listCampaigns(), { kind: holderKind(kind), id }, now);
        return found ? { campaign: found.id } : {};
      })()),
    });
    if ('refused' in made) return no();
    return json(
      { request: viewFor(made.request), link: linkFor(made.request) },
      { status: 201 });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(409, error.message);
    return no();
  }
}
