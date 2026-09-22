/**
 * Invariants asserted in code.  [Doctrine D-09]
 *
 * "Rules that exist only in documentation are rules that will be broken."
 * Each function here fails loudly rather than degrading quietly.
 */

import { type Conversation, orderedInterventions, selectedTake } from './document.js';
import { quoteHash } from './ids.js';
import type { SourceItem, Timeline } from './timeline.js';

export class InvariantViolation extends Error {
  constructor(readonly invariant: string, message: string) {
    super(`${invariant}: ${message}`);
    this.name = 'InvariantViolation';
  }
}

const fail = (inv: string, msg: string): never => {
  throw new InvariantViolation(inv, msg);
};

/**
 * INV-02 — cut_out_frame == resume_in_frame.
 * INV-03 — Σ(shot durations) == render duration, to the frame.
 *
 * Together these say: the output is exactly the source plus the responses,
 * with every source frame appearing exactly once, in order.
 */
export function assertTimelineInvariants(
  conversation: Conversation,
  timeline: Timeline,
): void {
  const duration = conversation.source.durationFrames;
  const sourceItems = timeline.items.filter((i): i is SourceItem => i.kind === 'source');

  // --- INV-02 ---------------------------------------------------------------
  // Source spans, in order, must tile [0, duration) exactly: no gap (a dropped
  // frame) and no overlap (a duplicated frame).
  let expected = 0;
  for (const item of sourceItems) {
    if (item.sourceInFrame !== expected) {
      fail('INV-02', item.sourceInFrame > expected
        ? `${item.sourceInFrame - expected} source frame(s) dropped at frame ${expected}`
        : `${expected - item.sourceInFrame} source frame(s) duplicated at frame ${item.sourceInFrame}`);
    }
    if (item.sourceOutFrame <= item.sourceInFrame) {
      fail('INV-02', `empty or inverted source span [${item.sourceInFrame}, ${item.sourceOutFrame})`);
    }
    expected = item.sourceOutFrame;
  }
  if (expected !== duration) {
    fail('INV-02', `source coverage ends at ${expected}, expected ${duration}`);
  }

  // Each response resumes on exactly the frame it interrupted.
  for (let i = 0; i < timeline.items.length; i++) {
    const item = timeline.items[i];
    if (item?.kind !== 'response') continue;
    const before = timeline.items[i - 1];
    const after = timeline.items[i + 1];
    if (before?.kind === 'source' && before.sourceOutFrame !== item.anchorFrame) {
      fail('INV-02', `cut_out_frame ${before.sourceOutFrame} != anchor ${item.anchorFrame}`);
    }
    if (after?.kind === 'source' && after.sourceInFrame !== item.anchorFrame) {
      fail('INV-02', `resume_in_frame ${after.sourceInFrame} != anchor ${item.anchorFrame}`);
    }
  }

  // --- INV-03 ---------------------------------------------------------------
  let cursor = 0;
  for (const item of timeline.items) {
    if (item.outputStartFrame !== cursor) {
      fail('INV-03', `output gap at ${cursor}: item starts at ${item.outputStartFrame}`);
    }
    cursor += item.durationFrames;
  }
  if (cursor !== timeline.totalOutputFrames) {
    fail('INV-03', `Σ(durations)=${cursor} != totalOutputFrames=${timeline.totalOutputFrames}`);
  }
}

/**
 * INV-05 — A quote's text hashes to its quote_hash.
 *
 * The product exists to hold people to what they said. It cannot let a quote
 * drift from what was actually spoken.  [Doctrine U-10]
 */
export function assertQuoteIntegrity(conversation: Conversation): void {
  for (const ivn of orderedInterventions(conversation)) {
    const { quote, quoteHash: stored } = ivn.anchor;
    if (quote === undefined || stored === undefined) continue;
    const actual = quoteHash(quote);
    if (actual !== stored) {
      fail('INV-05', `intervention ${ivn.id} quote does not match its hash — the claim has been altered`);
    }
  }
}

/** INV-12 — No intervention is silently re-anchored: every take is accounted for. */
export function assertDocumentIntegrity(conversation: Conversation): void {
  for (const ivn of conversation.interventions) {
    if (ivn.selectedTakeId && !selectedTake(ivn)) {
      fail('INV-12', `intervention ${ivn.id} selects take ${ivn.selectedTakeId}, which does not exist`);
    }
    for (const take of ivn.takes) {
      if (take.mediaInFrame < 0 || take.mediaOutFrame > take.durationFrames) {
        fail('INV-12', `take ${take.id} trim [${take.mediaInFrame}, ${take.mediaOutFrame}) exceeds its ${take.durationFrames}-frame media`);
      }
      if (take.prerollFrames > take.durationFrames) {
        fail('INV-12', `take ${take.id} claims more pre-roll than it has media`);
      }
    }
  }
}
