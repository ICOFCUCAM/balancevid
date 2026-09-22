/**
 * Vertical clips.  [Doctrine U-22, U-10 §2]
 *
 * "Vertical export operates on the claim–response pair as its unit, not on the
 *  whole conversation. The default vertical output is a set of clips, one per
 *  pair, each self-contained: the claim, then the reply."
 *
 * A forty-minute conversation has no vertical form. Reframing it produces a
 * forty-minute vertical video nobody watches. What travels is the pair: the
 * statement, then the answer to it.
 *
 * "One conversation therefore yields: one long-form video, one article, and a
 *  dozen clips. The composition step is the distribution engine."
 *
 * A clip is an ordinary render plan over a different timeline, so it is made by
 * the same planner and rendered by the same compositor. There is no second
 * renderer to drift from the first.
 */

import {
  type Conversation, type Intervention,
  orderedInterventions, selectedTake, takeUsableFrames,
} from './document.js';
import { planFromTimeline, type PlanOptions, type RenderPlan } from './plan.js';
import { TYPE_PRESENTATION } from './presentation.js';
import { HOUSE_FPS, RESPONSE_PAD_FRAMES, secondsToFrames, type Frames } from './time.js';
import type { Timeline } from './timeline.js';
import type { Transcript } from '../transcribe/types.js';
import { sentenceAtFrame } from '../transcribe/segmentation.js';

/** How much of the source to play before the cut, when nothing better is known. */
export const DEFAULT_LEAD_IN: Frames = secondsToFrames(6, HOUSE_FPS);
/** Beyond this the lead-in stops being a quote and becomes a rebroadcast. */
export const MAX_LEAD_IN: Frames = secondsToFrames(15, HOUSE_FPS);
/** Past this a clip is too long for the formats it is made for. */
export const LONG_CLIP_FRAMES: Frames = secondsToFrames(90, HOUSE_FPS);

export interface ClipCandidate {
  interventionId: string;
  index: number;
  tSourceFrame: Frames;
  type: Intervention['type'];
  typeLabel: string;
  /** The statement the clip opens on, where one is known. */
  claim?: string;
  claimIsBound: boolean;
  leadInFrames: Frames;
  responseFrames: Frames;
  totalFrames: Frames;
  tooLong: boolean;
  /** Why this one might be worth posting. Ranked, never auto-published. */
  score: number;
  reasons: string[];
}

/**
 * Propose the pairs worth posting.  [Doctrine U-22 §4]
 *
 * "The user selects which pairs to publish. The product proposes the strongest
 *  candidates but never auto-publishes."
 *
 * The ranking is deliberately legible rather than clever: a bound claim beats
 * an inferred one, a response of a usable length beats a fragment, and an
 * argumentative move beats an aside. A creator can disagree with all of it.
 */
export function clipCandidates(
  conversation: Conversation, transcript?: Transcript | null,
): ClipCandidate[] {
  return orderedInterventions(conversation).map((intervention, index) => {
    const take = selectedTake(intervention);
    const responseFrames = take ? takeUsableFrames(take) : 0;
    const leadIn = leadInFor(conversation, intervention, transcript);
    const claim = claimTextFor(intervention, transcript);
    const claimIsBound = Boolean(intervention.anchor.quote);

    const reasons: string[] = [];
    let score = 0;
    if (claimIsBound) { score += 40; reasons.push('answers a statement you quoted'); }
    else if (claim) { score += 15; reasons.push('opens on the sentence you interrupted'); }
    if (responseFrames >= secondsToFrames(8, HOUSE_FPS)) {
      score += 25; reasons.push('long enough to make a point');
    } else if (responseFrames < secondsToFrames(3, HOUSE_FPS)) {
      score -= 20; reasons.push('very short');
    }
    if (['critique', 'correct', 'counterargument', 'fact_check'].includes(intervention.type)) {
      score += 20; reasons.push('a disagreement, which travels');
    }
    if ((intervention.evidence ?? []).some((e) => e.archived)) {
      score += 15; reasons.push('carries evidence');
    }

    const totalFrames = leadIn + responseFrames + 2 * RESPONSE_PAD_FRAMES;
    const tooLong = totalFrames > LONG_CLIP_FRAMES;
    if (tooLong) { score -= 15; reasons.push('longer than these formats reward'); }

    return {
      interventionId: intervention.id,
      index: index + 1,
      tSourceFrame: intervention.anchor.tSourceFrame,
      type: intervention.type,
      typeLabel: TYPE_PRESENTATION[intervention.type].lowerThird,
      ...(claim ? { claim } : {}),
      claimIsBound,
      leadInFrames: leadIn,
      responseFrames,
      totalFrames,
      tooLong,
      score,
      reasons,
    };
  })
    .filter((candidate) => candidate.responseFrames > 0)
    .sort((a, b) => b.score - a.score || a.tSourceFrame - b.tSourceFrame);
}

/**
 * The timeline for one clip: the claim, then the reply.
 *
 * Not a projection of the whole conversation, so the frame-tiling invariant
 * (INV-02) does not apply to it -- a clip deliberately shows one slice of the
 * source and nothing else.
 */
export function buildClipTimeline(
  conversation: Conversation, interventionId: string, transcript?: Transcript | null,
): Timeline {
  const intervention = conversation.interventions.find((i) => i.id === interventionId);
  if (!intervention) throw new Error(`no such intervention: ${interventionId}`);
  const take = selectedTake(intervention);
  if (!take || takeUsableFrames(take) === 0) {
    throw new Error('this response has no usable take to clip');
  }

  const anchor = intervention.anchor.tSourceFrame;
  const leadIn = leadInFor(conversation, intervention, transcript);
  const sourceInFrame = Math.max(0, anchor - leadIn);
  const sourceFrames = anchor - sourceInFrame;
  const speech = takeUsableFrames(take);
  const responseFrames = RESPONSE_PAD_FRAMES + speech + RESPONSE_PAD_FRAMES;

  return {
    items: [
      ...(sourceFrames > 0 ? [{
        kind: 'source' as const,
        sourceInFrame,
        sourceOutFrame: anchor,
        outputStartFrame: 0,
        durationFrames: sourceFrames,
      }] : []),
      {
        kind: 'response' as const,
        interventionId: intervention.id,
        takeId: take.id,
        anchorFrame: anchor,
        mediaInFrame: take.mediaInFrame,
        mediaOutFrame: take.mediaOutFrame,
        padHeadFrames: RESPONSE_PAD_FRAMES,
        padTailFrames: RESPONSE_PAD_FRAMES,
        outputStartFrame: sourceFrames,
        durationFrames: responseFrames,
      },
    ],
    totalOutputFrames: sourceFrames + responseFrames,
    sourceFrames,
    responseFrames,
  };
}

export interface ClipPlanOptions extends PlanOptions {
  transcript?: Transcript | null;
}

export function buildClipPlan(
  conversation: Conversation, interventionId: string, options: ClipPlanOptions = {},
): RenderPlan {
  const intervention = conversation.interventions.find((i) => i.id === interventionId);
  if (!intervention) throw new Error(`no such intervention: ${interventionId}`);
  const timeline = buildClipTimeline(conversation, interventionId, options.transcript);
  const claim = claimTextFor(intervention, options.transcript);

  return planFromTimeline(conversation, timeline, {
    exportProfileId: 'vertical_9x16',
    burnInCaptions: true,
    ...options,
    // A vertical clip is watched with the sound off as often as not, so it
    // opens on the statement rather than on someone mid-sentence.
    ...(claim ? { openingClaim: { text: claim, seconds: 2.5 } } : {}),
    sourceLayoutId: 'vertical_source',
    responseLayoutId: 'vertical_stack',
  });
}

function leadInFor(
  conversation: Conversation, intervention: Intervention, transcript?: Transcript | null,
): Frames {
  const anchor = intervention.anchor.tSourceFrame;
  // Prefer the sentence the author was answering: it begins where the thought
  // begins, which an arbitrary six seconds does not.
  if (transcript) {
    const sentence = sentenceAtFrame(transcript.sentences, Math.max(0, anchor - 1));
    if (sentence && sentence.startFrame < anchor) {
      return Math.min(MAX_LEAD_IN, anchor - sentence.startFrame);
    }
  }
  return Math.min(MAX_LEAD_IN, Math.min(DEFAULT_LEAD_IN, anchor));
}

function claimTextFor(
  intervention: Intervention, transcript?: Transcript | null,
): string | undefined {
  if (intervention.anchor.quote) return intervention.anchor.quote;
  if (!transcript) return undefined;
  const sentence = sentenceAtFrame(
    transcript.sentences, Math.max(0, intervention.anchor.tSourceFrame - 1));
  if (!sentence) return undefined;
  const lower = sentence.text.toLocaleLowerCase();
  return transcript.characteristics.casing === 'upper'
    ? lower.charAt(0).toLocaleUpperCase() + lower.slice(1)
    : sentence.text;
}
