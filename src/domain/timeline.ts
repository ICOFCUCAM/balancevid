/**
 * The timeline projection.
 *
 * This is the mapping between the two clocks (U-08). It is DERIVED from the
 * Conversation and is discardable at any moment — `timeline_segments` is a
 * materialised view, not truth (INV-09, D-16).
 *
 * The frame-exactness invariant lives here:
 *
 *   INV-02  cut_out_frame == resume_in_frame
 *
 * Source spans are half-open, [inFrame, outFrame). The segment before an
 * interruption ends at the anchor frame exclusive; the segment after it begins
 * at the anchor frame inclusive. Not one frame of the source is duplicated or
 * dropped.  [Doctrine U-07, Part 0 §2]
 */

import {
  type Conversation,
  type Intervention,
  type InterventionId,
  type Take,
  type TakeId,
  participantFor,
  renderableInterventions,
  responseNumbers,
  selectedTake,
  takeUsableFrames,
} from './document.js';
import type { ParticipantId } from './participants.js';
import { type Frames, RESPONSE_PAD_FRAMES, assertFrames } from './time.js';

export interface SourceItem {
  kind: 'source';
  /** t_source, inclusive */
  sourceInFrame: Frames;
  /** t_source, EXCLUSIVE */
  sourceOutFrame: Frames;
  /** t_output, inclusive */
  outputStartFrame: Frames;
  durationFrames: Frames;
}

export interface ResponseItem {
  kind: 'response';
  interventionId: InterventionId;
  takeId: TakeId;
  /**
   * Whose voice this is, and which response of the conversation it is.
   * [ROOM §4, §9]
   *
   * On the PROJECTION rather than left to each surface to look up, because
   * "SOURCE ──●──●──●, you then Sarah then you" is a fact about the timeline,
   * and a timeline that cannot say who is speaking is a timeline a
   * multi-voice conversation cannot be drawn from. Both are derived — the id
   * from the intervention, the number from source order — so neither can
   * disagree with the document. [U-08]
   */
  participantId: ParticipantId;
  responseNumber: number;
  /** The source frame this response interrupts — and resumes at. */
  anchorFrame: Frames;
  /** t_media within the take, half-open */
  mediaInFrame: Frames;
  mediaOutFrame: Frames;
  /** Clean air added around speech so responses never butt against a cut. [U-17] */
  padHeadFrames: Frames;
  padTailFrames: Frames;
  /** t_output, inclusive */
  outputStartFrame: Frames;
  durationFrames: Frames;
}

export type TimelineItem = SourceItem | ResponseItem;

export interface Timeline {
  items: TimelineItem[];
  totalOutputFrames: Frames;
  sourceFrames: Frames;
  responseFrames: Frames;
}

/**
 * Project a Conversation onto the output clock.
 *
 * Pure. Same document in, same timeline out — this is what lets the render plan
 * be content-addressed and the preview and final renderer share one truth
 * (U-16, D-14).
 */
export function projectTimeline(conversation: Conversation): Timeline {
  const duration = conversation.source.durationFrames;
  assertFrames(duration);

  const interventions = renderableInterventions(conversation);
  const items: TimelineItem[] = [];
  let outputCursor: Frames = 0;
  let sourceCursor: Frames = 0;

  const pushSource = (inFrame: Frames, outFrame: Frames): void => {
    // A zero-length span is legal: two interventions may share an anchor frame
    // (back-to-back responses). It simply emits no shot.
    if (outFrame <= inFrame) return;
    const durationFrames = outFrame - inFrame;
    items.push({
      kind: 'source',
      sourceInFrame: inFrame,
      sourceOutFrame: outFrame,
      outputStartFrame: outputCursor,
      durationFrames,
    });
    outputCursor += durationFrames;
  };

  /*
   * Numbered over EVERY intervention, not only the renderable ones. "Response
   * 3" is the author's third response, and it stays the third whether or not
   * the second has been recorded yet — a number that renumbered itself when a
   * take was deleted would be a different number in the studio and in the
   * export.
   */
  const numbers = responseNumbers(conversation);

  for (const ivn of interventions) {
    const anchorFrame = clampAnchor(ivn, duration);
    const take = selectedTake(ivn) as Take; // renderableInterventions guarantees this

    // Everything up to, but not including, the anchor frame.
    pushSource(sourceCursor, anchorFrame);

    const speech = takeUsableFrames(take);
    const padHeadFrames = RESPONSE_PAD_FRAMES;
    const padTailFrames = RESPONSE_PAD_FRAMES;
    const durationFrames = padHeadFrames + speech + padTailFrames;

    items.push({
      kind: 'response',
      interventionId: ivn.id,
      takeId: take.id,
      participantId: participantFor(conversation, ivn).id,
      responseNumber: numbers.get(ivn.id) ?? 0,
      anchorFrame,
      mediaInFrame: take.mediaInFrame,
      mediaOutFrame: take.mediaOutFrame,
      padHeadFrames,
      padTailFrames,
      outputStartFrame: outputCursor,
      durationFrames,
    });
    outputCursor += durationFrames;

    // INV-02: we resume at exactly the frame we cut out on.
    sourceCursor = anchorFrame;
  }

  pushSource(sourceCursor, duration);

  const sourceFrames = items.reduce(
    (n, it) => (it.kind === 'source' ? n + it.durationFrames : n), 0);
  const responseFrames = items.reduce(
    (n, it) => (it.kind === 'response' ? n + it.durationFrames : n), 0);

  return { items, totalOutputFrames: outputCursor, sourceFrames, responseFrames };
}

/**
 * An anchor outside the source is clamped, never dropped. Losing a user's
 * recorded speech because a duration was re-probed is not acceptable (D-07).
 */
function clampAnchor(ivn: Intervention, durationFrames: Frames): Frames {
  const f = ivn.anchor.tSourceFrame;
  assertFrames(f);
  return Math.min(Math.max(f, 0), durationFrames);
}

/**
 * The source-to-response ratio, surfaced to the user while they work.
 * It is a legal signal and an editorial one: a response that is 95% someone
 * else's video is a weak response regardless of the law.  [Doctrine U-35 §3]
 */
export function sourceRatio(timeline: Timeline): number {
  if (timeline.totalOutputFrames === 0) return 0;
  return timeline.sourceFrames / timeline.totalOutputFrames;
}

/** Map an output frame back to its source frame, where one exists. [U-08] */
export function outputToSourceFrame(timeline: Timeline, outputFrame: Frames): Frames | null {
  for (const item of timeline.items) {
    const end = item.outputStartFrame + item.durationFrames;
    if (outputFrame < item.outputStartFrame || outputFrame >= end) continue;
    if (item.kind === 'source') {
      return item.sourceInFrame + (outputFrame - item.outputStartFrame);
    }
    return null; // inside a response — no source frame is showing
  }
  return null;
}
