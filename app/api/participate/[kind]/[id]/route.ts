import { ParticipationError, newRequest } from '../../../../../src/domain/participationEdit.js';
import { viewFor } from '../../../../../src/domain/participation.js';
import { isRespondable } from '../../../../../src/domain/document.js';
import {
  claimsAllowed, isListed, mayClaim, maySubmit,
} from '../../../../../src/domain/availability.js';
import { callFor } from '../../../../../src/domain/campaign.js';
import { listCampaigns } from '../../../../../src/store/campaigns.js';
import { loadPerformance } from '../../../../../src/store/performances.js';
import { loadConversation } from '../../../../../src/store/repository.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import {
  linkFor, listRequests, newSecret, saveRequest,
} from '../../../../../src/store/requests.js';
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
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { kind, id } = await params;
  if (!ID.test(id)) return fail(404, 'no such thing to take part in');
  const now = new Date().toISOString();

  /* One refusal for every reason, so a probe cannot tell them apart. */
  const no = () => fail(404, 'that is not open for anybody to take part in');

  /*
   * HOW MANY STRANGERS HAVE ALREADY COME THROUGH THIS DOOR.
   *
   * A scan of the requests, which is honest about its cost: this is
   * O(requests) per claim and there is no index. At the scale a single
   * installation holds it is a directory read; if that stops being
   * true the count belongs on the holder, and this is the one place
   * that would have to change.
   */
  const claimsSoFar = async (holderKind: string, holderId: string) => (await listRequests())
    .filter((one) => one.claimed
      && one.holder.kind === holderKind && one.holder.id === holderId).length;

  /*
   * AND WHICH CALL THEY ARE ANSWERING, WHERE THERE IS ONE.
   *   [GO-VIRAL V-2]
   *
   * A hundred strangers pressing this button produced a hundred
   * requests and no record that they were answering one thing.
   * The call is stamped here, at the moment the request is made,
   * because that is the only moment it is known — a request that
   * learned later which campaign it belonged to would be a
   * campaign that could gather entries it never opened for.
   *
   * ONLY WHERE THERE IS NO QUESTION WHICH ONE. A track may have
   * several calls, and this door names a document rather than a
   * call. `callFor` answers nothing when two are open, and the
   * request belongs to none — which is what every request was
   * before this stage. [GO-VIRAL §3]
   *
   * THE SAME SCAN `claimsSoFar` MAKES, and honest about its cost
   * for the same reason: O(campaigns) per claim, at the scale one
   * installation holds, with no index. If that stops being true
   * the call belongs on the holder.
   */
  const callOn = async (holder: { kind: 'performance' | 'conversation' | 'channel'; id: string }) => {
    const found = callFor(await listCampaigns(), holder, now);
    return found ? { campaign: found.id } : {};
  };

  try {
    if (kind === 'music') {
      const performance = await loadPerformance(id);
      const publication = performance.publication;
      if (!publication || publication.unpublishedAt) return no();
      if (!isListed(publication) || !maySubmit(publication, 'anyone', now)) return no();
      if (!mayClaim(publication, await claimsSoFar('performance', performance.id), now)) return no();

      const beats = performance.beats;
      const request = newRequest({
        holder: { kind: 'performance', id: performance.id },
        assignment: {
          kind: 'performance',
          asks: `Sing along to "${performance.master.title}"`,
          watch: performance.master.assetId,
          reference: {
            title: performance.master.title,
            durationSamples: performance.master.durationSamples,
            ...(beats?.acceptedBy && beats.bpm ? { bpm: beats.bpm } : {}),
            ...(performance.master.countInSamples
              ? { offsetSamples: performance.master.countInSamples } : {}),
          },
        },
        allowed: { video: true, takes: 3 },
        token: newSecret(),
        claimed: true,
        ...(await callOn({ kind: 'performance', id: performance.id })),
        now,
      });
      await saveRequest(request);
      return json({ request: viewFor(request), link: linkFor(request) }, { status: 201 });
    }

    if (kind === 'video') {
      const conversation = await loadConversation(id);
      const publication = conversation.publication;
      if (!publication || publication.unpublishedAt) return no();
      /* The predicate that already answers this for a conversation. */
      if (!isRespondable(conversation)) return no();
      if (!isListed(publication) || !maySubmit(publication, 'anyone', now)) return no();
      if (!mayClaim(publication, await claimsSoFar('conversation', conversation.id), now)) return no();

      const request = newRequest({
        holder: { kind: 'conversation', id: conversation.id },
        assignment: {
          kind: 'response',
          asks: `Respond to "${conversation.title}"`,
          ...(conversation.source?.mezzanineAssetId
            ? { watch: conversation.source.mezzanineAssetId } : {}),
        },
        allowed: { video: true, takes: 3 },
        token: newSecret(),
        claimed: true,
        ...(await callOn({ kind: 'conversation', id: conversation.id })),
        now,
      });
      await saveRequest(request);
      return json({ request: viewFor(request), link: linkFor(request) }, { status: 201 });
    }

    if (kind === 'programme') {
      const channel = await loadChannel(id);
      const publication = channel.publication;
      if (!publication || publication.unpublishedAt) return no();
      if (!isListed(publication) || !maySubmit(publication, 'anyone', now)) return no();
      if (!mayClaim(publication, await claimsSoFar('channel', channel.id), now)) return no();

      const request = newRequest({
        holder: { kind: 'channel', id: channel.id },
        assignment: {
          kind: 'question',
          asks: `Send something in to "${channel.name}"`,
          /* Nothing to watch first: a channel is a running programme
             rather than a file. [T14] */
        },
        allowed: { video: true, takes: 3 },
        token: newSecret(),
        claimed: true,
        ...(await callOn({ kind: 'channel', id: channel.id })),
        now,
      });
      await saveRequest(request);
      return json({ request: viewFor(request), link: linkFor(request) }, { status: 201 });
    }

    return no();
  } catch (error) {
    if (error instanceof ParticipationError) return fail(409, error.message);
    /* A thing that does not exist and a thing that is closed answer
       alike: an id oracle is a way to enumerate somebody's drafts. */
    return no();
  }
}
