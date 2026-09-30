import { ParticipationError, newRequest } from '../../../../../src/domain/participationEdit.js';
import { viewFor } from '../../../../../src/domain/participation.js';
import { isRespondable } from '../../../../../src/domain/document.js';
import { maySubmit, isListed } from '../../../../../src/domain/availability.js';
import { loadPerformance } from '../../../../../src/store/performances.js';
import { loadConversation } from '../../../../../src/store/repository.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import { linkFor, newSecret, saveRequest } from '../../../../../src/store/requests.js';
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
 * WHAT IS STILL EXPOSED, said plainly rather than left to be found: a
 * press writes a request directory, so an open item can be claimed
 * repeatedly by a script. The client asks only once per device because
 * it keeps what it was given, which covers the accidental case and not
 * the deliberate one. A per-item ceiling is the honest fix and it is a
 * producer-facing setting that does not exist yet; it is recorded in
 * the ledger rather than implied to be handled.
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { kind, id } = await params;
  if (!ID.test(id)) return fail(404, 'no such thing to take part in');
  const now = new Date().toISOString();

  /* One refusal for every reason, so a probe cannot tell them apart. */
  const no = () => fail(404, 'that is not open for anybody to take part in');

  try {
    if (kind === 'music') {
      const performance = await loadPerformance(id);
      const publication = performance.publication;
      if (!publication || publication.unpublishedAt) return no();
      if (!isListed(publication) || !maySubmit(publication, 'anyone')) return no();

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
      if (!isListed(publication) || !maySubmit(publication, 'anyone')) return no();

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
        now,
      });
      await saveRequest(request);
      return json({ request: viewFor(request), link: linkFor(request) }, { status: 201 });
    }

    if (kind === 'programme') {
      const channel = await loadChannel(id);
      const publication = channel.publication;
      if (!publication || publication.unpublishedAt) return no();
      if (!isListed(publication) || !maySubmit(publication, 'anyone')) return no();

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
