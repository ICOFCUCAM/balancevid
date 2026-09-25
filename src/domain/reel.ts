/**
 * The Response Reel.  [Doctrine U-01]
 *
 * "(a) RESPONSE REEL — a composed MP4 of the user's own material, with
 *      freeze-frames the user captured, annotations, captions, evidence, and
 *      the claim being answered shown as typography. Contains no provider
 *      footage."
 *
 * This is what a Class B conversation can honestly export as a video: the
 * author's own recordings, in order, each opening on the statement it answers.
 * The provider's video is not in it, because we never had it and never will.
 *
 * It is built from a timeline with no source segments at all, which is what
 * makes "contains no provider footage" a structural property rather than a
 * promise — there is no source shot for one to appear in.
 */

import type { Conversation } from './document.js';
import {
  participantFor, renderableInterventions, responseNumbers, selectedTake, takeUsableFrames,
} from './document.js';
import { planFromTimeline, type PlanOptions, type RenderPlan } from './plan.js';
import { RESPONSE_PAD_FRAMES } from './time.js';
import type { ResponseItem, Timeline } from './timeline.js';

/** A reel with nothing in it is not a video; say so rather than render black. */
export class EmptyReelError extends Error {
  constructor() {
    super('there are no finished responses to put in a reel');
    this.name = 'EmptyReelError';
  }
}

export function buildReelTimeline(conversation: Conversation): Timeline {
  const items: ResponseItem[] = [];
  let outputCursor = 0;
  /*
   * The reel drops the source, not the attribution. A run of responses with
   * no source between them is exactly where a viewer most needs to know
   * whose voice changed. [ROOM §4]
   */
  const numbers = responseNumbers(conversation);

  for (const intervention of renderableInterventions(conversation)) {
    const take = selectedTake(intervention)!;
    const speech = takeUsableFrames(take);
    const durationFrames = RESPONSE_PAD_FRAMES + speech + RESPONSE_PAD_FRAMES;
    items.push({
      kind: 'response',
      interventionId: intervention.id,
      takeId: take.id,
      participantId: participantFor(conversation, intervention).id,
      responseNumber: numbers.get(intervention.id) ?? 0,
      anchorFrame: intervention.anchor.tSourceFrame,
      mediaInFrame: take.mediaInFrame,
      mediaOutFrame: take.mediaOutFrame,
      padHeadFrames: RESPONSE_PAD_FRAMES,
      padTailFrames: RESPONSE_PAD_FRAMES,
      outputStartFrame: outputCursor,
      durationFrames,
    });
    outputCursor += durationFrames;
  }

  if (items.length === 0) throw new EmptyReelError();

  return {
    items,
    totalOutputFrames: outputCursor,
    sourceFrames: 0,
    responseFrames: outputCursor,
  };
}

export function buildReelPlan(
  conversation: Conversation, options: PlanOptions = {},
): RenderPlan {
  const timeline = buildReelTimeline(conversation);
  return planFromTimeline(conversation, timeline, {
    // Companion, never composed: a composed plan would require the source we
    // are not permitted to hold (INV-01).
    mode: 'companion',
    exportProfileId: 'youtube_16x9',
    burnInCaptions: true,
    ...options,
    // Full-screen author. A layout with a source panel would have nothing to
    // put in it; evidence still gets its own panel where it exists.
    responseLayoutId: options.responseLayoutId ?? 'full_user',
  });
}
