/**
 * Which comes first: the moment, or the answer.  [U-22 §2, INV-00, INV-03]
 *
 * "For short-form publication, the first 1–3 seconds matter enormously."
 * That is true, and it is also exactly the pressure that turns a product into
 * a reaction-video maker. The resolution the doctrine already had is the one
 * used here: the ORDER IS A PUBLICATION CHOICE, stored on the response, read
 * when a clip is planned, and the Conversation is untouched by it.
 *
 * So these tests check two things in the same breath — that the clip really
 * does reorder, and that nothing about the conversation or the arithmetic
 * moved when it did.
 */
import { describe, expect, it } from 'vitest';

import { buildClipTimeline, buildClipPlan, openingFor } from '../../src/domain/clips.js';
import { setOpening } from '../../src/domain/edit.js';
import { projectTimeline } from '../../src/domain/timeline.js';
import { S, makeConversation, makeIntervention, makeTake } from './fixtures.js';
import type { Conversation } from '../../src/domain/document.js';

function pair(): Conversation {
  const conversation = makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
  ]);
  conversation.interventions[0]!.takes = [makeTake(S(20))];
  conversation.interventions[0]!.selectedTakeId = conversation.interventions[0]!.takes[0]!.id;
  return conversation;
}

const itemsOf = (conversation: Conversation) =>
  buildClipTimeline(conversation, conversation.interventions[0]!.id).items;

describe('the default is the order the argument happened in', () => {
  it('source, then the answer to it', () => {
    const items = itemsOf(pair());
    expect(items.map((item) => item.kind)).toEqual(['source', 'response']);
    expect(items[0]!.outputStartFrame).toBe(0);
  });

  /*
   * Not merely the current behaviour: a product about disagreement should not
   * make "reply first, context later" the path of least resistance. Offering
   * it is right; defaulting to it is a different product.
   */
  it('and nobody has to choose it', () => {
    const resolved = openingFor(pair(), pair().interventions[0]!);
    expect(resolved.order).toBe('source_first');
    expect(resolved.orderChosen).toBe(false);
  });
});

describe('starting with the response', () => {
  function reordered(): Conversation {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id,
      { order: 'response_first' });
    return conversation;
  }

  it('puts the answer first and the moment after it', () => {
    const items = itemsOf(reordered());
    expect(items.map((item) => item.kind)).toEqual(['response', 'source']);
    expect(items[0]!.outputStartFrame).toBe(0);
  });

  it('and the author is recorded as having chosen it', () => {
    const conversation = reordered();
    const resolved = openingFor(conversation, conversation.interventions[0]!);
    expect(resolved.order).toBe('response_first');
    expect(resolved.orderChosen).toBe(true);
  });

  /*
   * The clip is RE-ORDERED, not re-cut. Same frames of source, same frames of
   * take, same total — which is what makes this a representation rather than
   * an edit. If a reorder could change a duration it would be a second
   * composition of the same response. [INV-03]
   */
  it('re-orders the clip without re-cutting it', () => {
    // One conversation, read twice: ids are generated per fixture, so two
    // calls to `pair()` are two different documents.
    const plain = pair();
    const before = buildClipTimeline(plain, plain.interventions[0]!.id);
    const changed = reordered();
    const after = itemsOf(changed);
    const timeline = buildClipTimeline(changed, changed.interventions[0]!.id);

    expect(timeline.totalOutputFrames).toBe(before.totalOutputFrames);
    expect(timeline.sourceFrames).toBe(before.sourceFrames);
    expect(timeline.responseFrames).toBe(before.responseFrames);

    const source = after.find((item) => item.kind === 'source')!;
    const wasSource = before.items.find((item) => item.kind === 'source')!;
    expect(source.sourceInFrame).toBe(wasSource.sourceInFrame);
    expect(source.sourceOutFrame).toBe(wasSource.sourceOutFrame);
  });

  it('leaves no gap and no overlap between the two', () => {
    const items = itemsOf(reordered());
    expect(items[1]!.outputStartFrame)
      .toBe(items[0]!.outputStartFrame + items[0]!.durationFrames);
  });

  /*
   * THE CONVERSATION IS UNTOUCHED. This is the whole architectural claim: a
   * publication decision may not reach back into the thing being published.
   * [INV-00]
   */
  it('changes nothing about the conversation itself', () => {
    const conversation = reordered();
    const plain = projectTimeline(pair());
    const after = projectTimeline(conversation);
    expect(after.totalOutputFrames).toBe(plain.totalOutputFrames);
    expect(after.items.map((item) => [item.kind, item.outputStartFrame]))
      .toEqual(plain.items.map((item) => [item.kind, item.outputStartFrame]));
  });

  /*
   * And everything derived from the clip's timeline follows it. The shots are
   * the visible proof: nothing told the planner about the order.
   */
  it('and the shots follow, without the planner being told', () => {
    const conversation = reordered();
    const plan = buildClipPlan(conversation, conversation.interventions[0]!.id);
    expect(plan.shots[0]!.kind).toBe('response');
    expect(plan.shots.at(-1)!.kind).toBe('source');
    const total = plan.shots.reduce((sum, shot) => sum + shot.durationFrames, 0);
    expect(total).toBe(plan.totalOutputFrames);
  });
});

describe('the order is a separate decision from the card', () => {
  it('a claim card and a response-first clip compose', () => {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, {
      card: { kind: 'statement' }, order: 'response_first',
    });
    const resolved = openingFor(conversation, conversation.interventions[0]!);
    expect(resolved.card?.quoted).toBe(true);
    expect(resolved.order).toBe('response_first');
  });

  it('and a cold open does not force an order', () => {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, { card: { kind: 'none' } });
    const resolved = openingFor(conversation, conversation.interventions[0]!);
    expect(resolved.card).toBeUndefined();
    expect(resolved.order).toBe('source_first');
    expect(resolved.orderChosen).toBe(false);
  });

  it('refuses an order nobody defined', () => {
    const conversation = pair();
    expect(() => setOpening(conversation, conversation.interventions[0]!.id,
      { order: 'response-first' as never })).toThrow(/unknown opening order/);
  });

  it('and an order alone is still a decision worth storing', () => {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, { order: 'response_first' });
    expect(conversation.interventions[0]!.opening).toEqual({ order: 'response_first' });
  });
});
