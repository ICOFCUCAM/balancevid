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
  CARD_SECONDS, MAX_CARD_SECONDS, MAX_HOOK_LENGTH, MIN_CARD_SECONDS,
  type Conversation, type Intervention, type OpeningOrder,
  orderedInterventions, participantFor, responseNumbers, selectedTake, takeUsableFrames,
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

/**
 * What a clip actually opens with.  [Doctrine U-22 §2, INV-05]
 *
 * One function, used by the planner, by the candidate list and by the panel
 * that lets the author change it — so what they are shown before they choose
 * is what they get afterwards.
 *
 * The `quoted` flag is the honesty rule made mechanical. A statement is the
 * source's own sentence and the clip plays it a moment later, which is what
 * earns the quotation marks. A hook is the author's line over the source's
 * picture and never gets them.
 */
export interface ResolvedOpening {
  leadInFrames: Frames;
  card?: { text: string; seconds: number; quoted: boolean };
  /** Which of the two plays first. Resolved here so one place decides. */
  order: OpeningOrder;
  /** True when the author decided the order rather than the product. */
  orderChosen: boolean;
  /** True when the author decided the card rather than the product. */
  chosen: boolean;
  /**
   * True when the author decided where it starts.
   *
   * Separate from `chosen` because the two are separate decisions: somebody
   * can write their own hook and still want the lead-in worked out for them.
   * One flag for both would make the panel show a number the author never
   * picked as though they had.
   */
  leadInChosen: boolean;
}

export function openingFor(
  conversation: Conversation, intervention: Intervention, transcript?: Transcript | null,
): ResolvedOpening {
  const opening = intervention.opening;
  const anchor = intervention.anchor.tSourceFrame;

  /*
   * Their number, clamped to what exists. A lead-in longer than the source
   * before the anchor cannot be played, and one past MAX_LEAD_IN stops being
   * a quotation and becomes a rebroadcast.
   */
  /*
   * The order, resolved here with everything else so the planner, the
   * candidate list and the panel cannot disagree about what the clip will do.
   */
  const order: OpeningOrder = opening?.order ?? 'source_first';
  const orderChosen = opening?.order !== undefined;

  const leadInChosen = opening?.leadInFrames !== undefined;
  const leadInFrames = opening?.leadInFrames === undefined
    ? leadInFor(conversation, intervention, transcript)
    : Math.max(0, Math.min(opening.leadInFrames, MAX_LEAD_IN, anchor));

  const card = opening?.card;
  if (card?.kind === 'none') {
    return { leadInFrames, order, orderChosen, chosen: true, leadInChosen };
  }

  if (card?.kind === 'text') {
    const text = card.text.replace(/\s+/g, ' ').trim().slice(0, MAX_HOOK_LENGTH);
    // An empty hook is not a hook. Rather than open on a blank card, this is
    // read as "no card" — which is what an author who cleared the box meant.
    if (!text) return { leadInFrames, order, orderChosen, chosen: true, leadInChosen };
    return {
      leadInFrames,
      order,
      orderChosen,
      card: {
        text,
        seconds: clampSeconds(card.seconds ?? CARD_SECONDS),
        quoted: false,
      },
      chosen: true,
      leadInChosen,
    };
  }

  const statement = claimTextFor(intervention, transcript);
  return {
    leadInFrames,
    order,
    orderChosen,
    ...(statement
      ? { card: { text: statement, seconds: CARD_SECONDS, quoted: true } }
      : {}),
    chosen: Boolean(opening?.card),
    leadInChosen,
  };
}

function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return CARD_SECONDS;
  return Math.min(MAX_CARD_SECONDS, Math.max(MIN_CARD_SECONDS, seconds));
}

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
  /**
   * How this one will open, as it stands.
   *
   * Carried on the candidate so the panel where the author changes it and the
   * plan that renders it are reading the same answer. A preview that is
   * computed separately from the thing it previews is a preview of something
   * else.
   */
  opening: ResolvedOpening;
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
    const opening = openingFor(conversation, intervention, transcript);
    const leadIn = opening.leadInFrames;
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
      opening,
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
  const opening = openingFor(conversation, intervention, transcript);
  const sourceInFrame = Math.max(0, anchor - opening.leadInFrames);
  const sourceFrames = anchor - sourceInFrame;
  const speech = takeUsableFrames(take);
  const responseFrames = RESPONSE_PAD_FRAMES + speech + RESPONSE_PAD_FRAMES;

  /*
   * WHICH GOES FIRST.  [U-22 §2]
   *
   * The only thing the order changes is where each item starts, and that is
   * deliberate: captions, marks and shot boundaries are all derived from this
   * timeline, so reordering it reorders them without any of them being told.
   * A version of this that reordered the SHOTS would have had to reorder four
   * other things by hand and would have forgotten one.
   *
   * Note what does not change. `sourceFrames` and `responseFrames` are how
   * much of each there is, not when; `totalOutputFrames` is their sum either
   * way; and the source still plays the same frames of the same source. The
   * clip is re-ordered, not re-cut, and INV-03 holds unchanged.
   */
  const responseFirst = opening.order === 'response_first' && sourceFrames > 0;
  const sourceStart = responseFirst ? responseFrames : 0;
  const responseStart = responseFirst ? 0 : sourceFrames;

  return {
    items: [
      ...(sourceFrames > 0 ? [{
        kind: 'source' as const,
        sourceInFrame,
        sourceOutFrame: anchor,
        outputStartFrame: sourceStart,
        durationFrames: sourceFrames,
      }] : []),
      {
        kind: 'response' as const,
        interventionId: intervention.id,
        takeId: take.id,
        // A clip is one pair lifted out of the conversation, and it travels
        // furthest from it — so it is the export that most needs to say
        // whose answer this is. [ROOM §4]
        participantId: participantFor(conversation, intervention).id,
        responseNumber: responseNumbers(conversation).get(intervention.id) ?? 0,
        anchorFrame: anchor,
        mediaInFrame: take.mediaInFrame,
        mediaOutFrame: take.mediaOutFrame,
        padHeadFrames: RESPONSE_PAD_FRAMES,
        padTailFrames: RESPONSE_PAD_FRAMES,
        outputStartFrame: responseStart,
        durationFrames: responseFrames,
      },
    ].sort((a, b) => a.outputStartFrame - b.outputStartFrame),
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
  const opening = openingFor(conversation, intervention, options.transcript);

  return planFromTimeline(conversation, timeline, {
    exportProfileId: 'vertical_9x16',
    burnInCaptions: true,
    ...options,
    /*
     * A vertical clip is watched with the sound off as often as not, so it
     * opens on something readable rather than on someone mid-sentence. What
     * that is — the statement, the author's own hook, or nothing at all — is
     * the author's to decide, and `openingFor` is where that is decided.
     */
    ...(opening.card ? { openingClaim: opening.card } : {}),
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
