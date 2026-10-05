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
import type { TakeAvailability } from '../domain/availability.js';
import { maySubmit, mayClaim } from '../domain/availability.js';
import { loadPerformance } from '../store/performances.js';
import { loadConversation } from '../store/repository.js';
import { loadChannel } from '../store/channels.js';
import { listRequests, newSecret, saveRequest } from '../store/requests.js';

/** The three things a call can be about, as the paths spell them. */
/**
 * The longest instruction a recording screen is handed.
 *
 * `RULE_LONGEST` is two thousand characters, which is the right
 * bound on a page a person reads before deciding to enter. The
 * line above a camera is not that page.
 */
export const ASKS_LONGEST = 400;

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

/**
 * WHICH DOOR A CALL'S TRACK IS BEHIND.
 *
 * The inverse of `holderKind`, and it lives beside it because
 * two places mapping between the same two vocabularies is two
 * places that can disagree about which one `channel` means. The
 * enter route had this table and the call page needed it to ask
 * `claimable`; a second copy on the page is how the page comes
 * to ask about the wrong door. [D-19]
 */
export function doorFor(kind: RequestHolder['kind']): ClaimKind | undefined {
  if (kind === 'performance') return 'music';
  if (kind === 'conversation') return 'video';
  if (kind === 'channel') return 'programme';
  return undefined;
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
 * WHETHER THIS DOOR WOULD OPEN, ASKED WITHOUT OPENING IT.
 *   [GO-VIRAL V-4; D-19, D-21]
 *
 * THE CALL PAGE DREW AN ENTER BUTTON THAT ALWAYS WORKED AND A
 * ROUTE THAT SOMETIMES REFUSED. `takingEntries` is the CALL's
 * own clock and state, which is what the page could ask; the
 * three conditions below are the TRACK's, which only this
 * module knew, and they are the ones that actually decide. A
 * campaign whose song was unpublished, or withdrawn from
 * strangers, or already at the producer's ceiling, showed a
 * live call with a working-looking button and answered *that is
 * not open for anybody to take part in* when it was pressed.
 * Advertising what you do not have. [D-21]
 *
 * ONE FUNCTION, SO THE PAGE AND THE ROUTE CANNOT DISAGREE. The
 * obvious repair is a second copy of the three conditions on
 * the page, which is the repair that drifts: the next condition
 * added to the door is the one the page keeps saying yes to.
 * The gate is extracted instead, and `claim` is now its only
 * other caller. [D-19]
 */
type Openness = 'open' | 'missing' | 'closed';

async function openness(
  publication: (TakeAvailability & { unpublishedAt?: string }) | undefined,
  holder: RequestHolder, now: string,
  also: ((publication: unknown) => boolean) | undefined,
  /** The one condition only a conversation has. */
  respondable: boolean,
): Promise<Openness> {
  if (!publication || publication.unpublishedAt) return 'missing';
  if (also && !also(publication)) return 'missing';
  if (!respondable) return 'closed';
  if (!maySubmit(publication, 'anyone', now)) return 'closed';
  if (!mayClaim(publication, await claimsSoFar(holder), now)) return 'closed';
  return 'open';
}

/**
 * Would a stranger get in?
 *
 * ANSWERED FOR A PAGE AND NOT FOR A DECISION. Between this call
 * and the press of the button a producer can unpublish, close
 * the door or the hundredth stranger can arrive, so the route
 * asks again and is the one that decides. What this buys is a
 * page that does not invite somebody into a room that is
 * already full. [U-19]
 *
 * IT SAYS WHICH OF THE TWO, because the page draws them
 * differently and neither leaks anything: the call is listed by
 * its organiser, so *there is nothing here* and *it is shut*
 * are both things the organiser has already published. The
 * DOOR still collapses them, for the reason it always did —
 * there the id came off a URL a stranger could have guessed.
 * [D-03]
 */
export async function claimable(spec: {
  kind: ClaimKind;
  id: string;
  now: string;
  also?: (publication: unknown) => boolean;
}): Promise<Openness> {
  const { kind, id, now } = spec;
  const holder: RequestHolder = { kind: holderKind(kind), id };
  try {
    if (kind === 'music') {
      const performance = await loadPerformance(id);
      return await openness(performance.publication, holder, now, spec.also, true);
    }
    if (kind === 'video') {
      const conversation = await loadConversation(id);
      return await openness(conversation.publication, holder, now, spec.also,
        isRespondable(conversation));
    }
    if (kind !== 'programme') return 'missing';
    const channel = await loadChannel(id);
    return await openness(channel.publication, holder, now, spec.also, true);
  } catch {
    return 'missing';
  }
}

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
  /**
   * WHAT THE CALL ASKED FOR, IN THE ORGANISER'S OWN WORDS.
   *   [GO-VIRAL V-4, V-5; D-19]
   *
   * THE DOOR USED TO THROW THIS AWAY, which broke the competition
   * at its most fundamental join. An organiser writes *what to
   * do*; V-4 prints it on the public page; V-5 publishes the
   * criteria the panel will mark it against — and then the person
   * pressed ENTER and the recorder told them `Sing along to
   * "<title>"`, because this function hardcoded one sentence per
   * kind. They recorded against the wrong brief and were judged
   * on the right one.
   *
   * AND THE OTHER DOOR ALWAYS CARRIED IT. A producer inviting
   * somebody passes `asks` through `/api/performances/<id>/
   * requests` and it reaches the recording screen intact. Two
   * doors with two answers to *what am I being asked to do* is
   * the thing D-19 exists to prevent, and the one that was wrong
   * was the one a stranger uses.
   *
   * ABSENT FALLS BACK TO THE TRACK'S OWN SENTENCE, because the
   * discovery door has no call and no instruction — somebody
   * arriving at a published song is answering the song, and
   * *"Sing along to…"* is the right thing to say to them.
   */
  asks?: string;
  /** Asked before minting, so a door may add its own condition. */
  also?: (publication: unknown) => boolean;
}): Promise<Claimed> {
  const { kind, id, now } = spec;
  const holder: RequestHolder = { kind: holderKind(kind), id };
  const stamp = spec.campaign ? { campaign: spec.campaign } : {};
  /*
   * TRIMMED AND BOUNDED HERE, because what arrives is a
   * organiser's free text that already passed `newCampaign`'s
   * limit — and a request's assignment is read by a recorder on
   * a phone, not by a page with room to run. An empty one is no
   * instruction at all and falls back rather than printing a
   * blank line where the brief should be.
   */
  const said = (spec.asks ?? '').trim().slice(0, ASKS_LONGEST);

  try {
    if (kind === 'music') {
      const performance = await loadPerformance(id);
      const shut = await openness(
        performance.publication, holder, now, spec.also, true);
      if (shut !== 'open') return { refused: shut };
      const beats = performance.beats;
      const request = newRequest({
        holder: { kind: 'performance', id: performance.id },
        assignment: {
          kind: 'performance',
          asks: said || `Sing along to "${performance.master.title}"`,
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
      /* `isRespondable` is the one condition only a conversation
         has, and it is handed to the shared gate rather than
         asked beside it. */
      const shut = await openness(conversation.publication, holder, now,
        spec.also, isRespondable(conversation));
      if (shut !== 'open') return { refused: shut };
      const request = newRequest({
        holder: { kind: 'conversation', id: conversation.id },
        assignment: {
          kind: 'response',
          asks: said || `Respond to "${conversation.title}"`,
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
    const shut = await openness(channel.publication, holder, now, spec.also, true);
    if (shut !== 'open') return { refused: shut };
    const request = newRequest({
      holder: { kind: 'channel', id: channel.id },
      assignment: {
        kind: 'question',
        asks: said || `Send something in to "${channel.name}"`,
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
