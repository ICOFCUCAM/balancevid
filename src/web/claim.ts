/**
 * Taking a call, from either door.
 *   [GO-VIRAL V-4; TAKE-PLATFORM P2, P3, P4, PART FIVE; D-19, D-25]
 *
 * THERE ARE NOW TWO DOORS AND THERE MUST NOT BE TWO ANSWERS.
 * `/api/participate/<kind>/<id>` is the discovery listing's
 * button: it names a DOCUMENT, and V-2 made it stamp the one call
 * open on that document — *"`callFor` answers nothing when two are
 * open."* `/api/go/<handle>/enter` is the other half of that
 * sentence: *"V-4's campaign page is the door that names one."*
 *
 * WHAT THE TWO SHARE IS EVERYTHING EXCEPT WHICH CALL. Both resolve
 * one of three kinds of document, both check the author's own
 * conditions, both mint the SAME object a producer mints, and both
 * are bounded by the same ceiling. Written twice, the second one
 * would be where a condition is forgotten — and the condition
 * forgotten on a public write is the one that matters.
 *
 * IT MINTS THE SAME OBJECT A PRODUCER MINTS, which is the whole
 * design. No self-service request type, no second invitation
 * model: a claimed request is a `ParticipationRequest`
 * indistinguishable from an invited one once it exists, so
 * everything downstream works without knowing which it was.
 * [D-19, P35]
 *
 * THIS MODULE DECIDES NOTHING ABOUT CAMPAIGNS. It is handed the
 * call to stamp, or none, and the caller is the one that knows
 * which. A helper that went looking for a campaign would be the
 * third place that answers *which call is this*.
 */

import type { Id } from '../domain/ids.js';
import { ParticipationError, newRequest } from '../domain/participationEdit.js';
import type { ParticipationRequest, RequestHolder } from '../domain/participation.js';
import { isRespondable } from '../domain/document.js';
import { maySubmit, mayClaim } from '../domain/availability.js';
import { loadPerformance } from '../store/performances.js';
import { loadConversation } from '../store/repository.js';
import { loadChannel } from '../store/channels.js';
import { listRequests, newSecret, saveRequest } from '../store/requests.js';

/** The three things a call can be about, as the paths spell them. */
export type ClaimKind = 'music' | 'video' | 'programme';

/**
 * AND THE TYPE BOUNDARY, WHICH IS A SECOND CHECK ON PURPOSE.
 *
 * `claim` names its third kind rather than falling through to it,
 * so an unknown word is refused there too — and a mutation run
 * shows that either guard alone is enough: remove one and the
 * other answers. Removing BOTH mints a channel request for
 * `/api/participate/banana/<channelId>`, which is the test that
 * holds the pair up. [T-3]
 *
 * THEY ARE KEPT BECAUSE THEY ARE DIFFERENT CLAIMS. This one is
 * the route's: a string off a URL is not a `ClaimKind` until
 * something says so, and nothing else can give `claim` a typed
 * argument. The one inside `claim` is that function's own
 * correctness for any caller, including a door that resolves a
 * kind from a campaign's track. Neither rests on the other being
 * there. [C-34, B-1]
 */
export function isClaimKind(said: string): said is ClaimKind {
  return said === 'music' || said === 'video' || said === 'programme';
}

/** The kind a `RequestHolder` uses, from the kind a path uses. */
export function holderKind(kind: ClaimKind): RequestHolder['kind'] {
  if (kind === 'music') return 'performance';
  if (kind === 'video') return 'conversation';
  return 'channel';
}

/**
 * HOW MANY STRANGERS HAVE ALREADY COME THROUGH.
 *
 * A scan of the requests, which is honest about its cost: this is
 * O(requests) per claim and there is no index. At the scale a
 * single installation holds it is a directory read; if that stops
 * being true the count belongs on the holder, and this is the one
 * place that would have to change.
 */
export async function claimsSoFar(holder: RequestHolder): Promise<number> {
  return (await listRequests()).filter((one) => one.claimed
    && one.holder.kind === holder.kind && one.holder.id === holder.id).length;
}

/** Why this document cannot be taken, or the request that was minted. */
export type Claimed =
  | { request: ParticipationRequest }
  | { refused: 'missing' }
  | { refused: 'closed' };

/**
 * Mint a request against a published document.
 *
 * `listed` IS NOT ASKED HERE, AND THAT IS THE ONE DIFFERENCE
 * BETWEEN THE DOORS. The discovery listing's button requires it,
 * because an unlisted item a stranger reached by guessing an id is
 * not a thing to let them write to — discovery and authorization
 * are separate questions and that door needs both answers. A call
 * page IS the listing: the organiser published the call, and the
 * track behind it is theirs to point at. So the caller asks
 * `isListed` where `isListed` is the question. [PART FIVE]
 *
 * EVERYTHING ELSE IS ASKED HERE AND IS THE AUTHOR'S OWN: the
 * document is published, it is not withdrawn, it accepts takes
 * from `anyone`, and the ceiling the producer set has room.
 */
export async function claim(spec: {
  kind: ClaimKind;
  id: string;
  now: string;
  /** The call this request answers, where the caller knows one. */
  campaign?: Id<'camp'>;
  /** Asked before minting, so a door may add its own condition. */
  also?: (publication: unknown) => boolean;
}): Promise<Claimed> {
  const { kind, id, now } = spec;
  const holder: RequestHolder = { kind: holderKind(kind), id };
  const stamp = spec.campaign ? { campaign: spec.campaign } : {};

  try {
    if (kind === 'music') {
      const performance = await loadPerformance(id);
      const publication = performance.publication;
      if (!publication || publication.unpublishedAt) return { refused: 'missing' };
      if (spec.also && !spec.also(publication)) return { refused: 'missing' };
      if (!maySubmit(publication, 'anyone', now)) return { refused: 'closed' };
      if (!mayClaim(publication, await claimsSoFar(holder), now)) {
        return { refused: 'closed' };
      }
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
        ...stamp,
        now,
      });
      await saveRequest(request);
      return { request };
    }

    if (kind === 'video') {
      const conversation = await loadConversation(id);
      const publication = conversation.publication;
      if (!publication || publication.unpublishedAt) return { refused: 'missing' };
      if (spec.also && !spec.also(publication)) return { refused: 'missing' };
      /* The predicate that already answers this for a conversation. */
      if (!isRespondable(conversation)) return { refused: 'closed' };
      if (!maySubmit(publication, 'anyone', now)) return { refused: 'closed' };
      if (!mayClaim(publication, await claimsSoFar(holder), now)) {
        return { refused: 'closed' };
      }
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
        ...stamp,
        now,
      });
      await saveRequest(request);
      return { request };
    }

    /*
     * THE THIRD KIND IS NAMED, AND IT IS NOT THE FALL-THROUGH.
     *   [GO-VIRAL V-4]
     *
     * FOUND BY MUTATION. This branch was written as *everything
     * that is not music or video*, which made the channel the
     * default — so with `isClaimKind` answering true to anything,
     * `/api/participate/banana/<id>` was a CHANNEL claim. It
     * refused in practice only because no channel had that id,
     * which is an accident of the fixture and not a rule.
     *
     * NAMED, THE UNKNOWN WORD FALLS PAST EVERY BRANCH and is
     * refused by the line below rather than by a store that
     * happened not to find anything. The type says that line
     * cannot be reached; the type is exactly what a bad `kind`
     * is a failure of. [C-34]
     */
    if (kind !== 'programme') return { refused: 'missing' };

    const channel = await loadChannel(id);
    const publication = channel.publication;
    if (!publication || publication.unpublishedAt) return { refused: 'missing' };
    if (spec.also && !spec.also(publication)) return { refused: 'missing' };
    if (!maySubmit(publication, 'anyone', now)) return { refused: 'closed' };
    if (!mayClaim(publication, await claimsSoFar(holder), now)) {
      return { refused: 'closed' };
    }
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
      ...stamp,
      now,
    });
    await saveRequest(request);
    return { request };
  } catch (error) {
    if (error instanceof ParticipationError) throw error;
    /*
     * A thing that does not exist and a thing that is closed answer
     * alike at the door above: an id oracle is a way to enumerate
     * somebody's drafts. [D-03]
     */
    return { refused: 'missing' };
  }
}
