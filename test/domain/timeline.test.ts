import { describe, expect, it } from 'vitest';
import { projectTimeline, outputToSourceFrame, sourceRatio } from '../../src/domain/timeline.js';
import { assertTimelineInvariants, assertQuoteIntegrity, InvariantViolation } from '../../src/domain/invariants.js';
import { RESPONSE_PAD_FRAMES } from '../../src/domain/time.js';
import { S, makeConversation, makeIntervention } from './fixtures.js';

/**
 * These tests are the doctrine's central promise expressed as code:
 *
 *   "When you interrupt the speaker, you return to exactly where the speaker
 *    stopped. Not approximately. Not 'around 14:32'. Exactly."
 *                                              [Doctrine Part 0, principle 2]
 */
describe('timeline projection — frame-exact continuity (INV-02)', () => {
  it('tiles the source exactly with no interventions', () => {
    const conv = makeConversation(S(300));
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);
    expect(tl.items).toHaveLength(1);
    expect(tl.totalOutputFrames).toBe(S(300));
  });

  it('resumes on exactly the frame it cut out on', () => {
    const at = S(14 * 60 + 32) + 14; // 14:32.481 -> frame 26 049 at 30fps
    const conv = makeConversation(S(1800), [makeIntervention(at, S(20))]);
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);

    const [before, response, after] = tl.items;
    expect(before).toMatchObject({ kind: 'source', sourceInFrame: 0, sourceOutFrame: at });
    expect(response).toMatchObject({ kind: 'response', anchorFrame: at });
    expect(after).toMatchObject({ kind: 'source', sourceInFrame: at, sourceOutFrame: S(1800) });
  });

  it('never duplicates or drops a source frame across many interventions', () => {
    const anchors = [S(3 * 60 + 18), S(8 * 60 + 41), S(13 * 60 + 22), S(19 * 60 + 51)];
    const conv = makeConversation(S(24 * 60), anchors.map((a) => makeIntervention(a, S(30))));
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);

    // Every source frame appears exactly once, in order.
    const covered: number[] = [];
    for (const item of tl.items) {
      if (item.kind !== 'source') continue;
      for (let f = item.sourceInFrame; f < item.sourceOutFrame; f++) covered.push(f);
    }
    expect(covered).toHaveLength(S(24 * 60));
    expect(covered[0]).toBe(0);
    expect(covered.at(-1)).toBe(S(24 * 60) - 1);
    expect(covered.every((f, i) => f === i)).toBe(true);
  });

  it('handles an interruption on the very first frame', () => {
    const conv = makeConversation(S(60), [makeIntervention(0, S(10))]);
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);
    expect(tl.items[0]?.kind).toBe('response');
    expect(tl.items).toHaveLength(2);
  });

  it('handles an interruption on the final frame', () => {
    const conv = makeConversation(S(60), [makeIntervention(S(60), S(10))]);
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);
    expect(tl.items.at(-1)?.kind).toBe('response');
  });

  it('allows back-to-back responses sharing one anchor frame', () => {
    const at = S(30);
    const conv = makeConversation(S(60), [
      makeIntervention(at, S(5), { createdAt: '2026-09-22T10:00:00.000Z' }),
      makeIntervention(at, S(5), { createdAt: '2026-09-22T10:01:00.000Z' }),
    ]);
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);
    expect(tl.items.map((i) => i.kind)).toEqual(['source', 'response', 'response', 'source']);
  });

  it('orders interventions by source frame regardless of when they were recorded', () => {
    const conv = makeConversation(S(600), [
      makeIntervention(S(400), S(5), { createdAt: '2026-09-22T10:00:00.000Z' }),
      makeIntervention(S(100), S(5), { createdAt: '2026-09-22T11:00:00.000Z' }),
    ]);
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);
    const anchors = tl.items.filter((i) => i.kind === 'response').map((i) => (i as { anchorFrame: number }).anchorFrame);
    expect(anchors).toEqual([S(100), S(400)]);
  });

  it('excludes interventions with no usable take rather than emitting an empty shot', () => {
    const conv = makeConversation(S(60), [makeIntervention(S(30), S(10))]);
    conv.interventions[0]!.selectedTakeId = null;
    const tl = projectTimeline(conv);
    assertTimelineInvariants(conv, tl);
    expect(tl.items).toHaveLength(1);
  });
});

describe('the two clocks (U-08)', () => {
  it('output duration is source plus responses plus their clean air', () => {
    const speech = S(20);
    const conv = makeConversation(S(300), [makeIntervention(S(100), speech)]);
    const tl = projectTimeline(conv);
    expect(tl.totalOutputFrames).toBe(S(300) + speech + 2 * RESPONSE_PAD_FRAMES);
    expect(tl.sourceFrames).toBe(S(300));
  });

  it('maps an output frame back to its source frame', () => {
    const conv = makeConversation(S(300), [makeIntervention(S(100), S(20))]);
    const tl = projectTimeline(conv);
    expect(outputToSourceFrame(tl, S(50))).toBe(S(50));
    // Inside the response: no source frame is showing.
    expect(outputToSourceFrame(tl, S(100) + RESPONSE_PAD_FRAMES + 10)).toBeNull();
    // After it: the source has resumed exactly where it stopped.
    const afterStart = S(100) + S(20) + 2 * RESPONSE_PAD_FRAMES;
    expect(outputToSourceFrame(tl, afterStart)).toBe(S(100));
  });

  it('reports the source-to-response ratio (U-35)', () => {
    const conv = makeConversation(S(100), [makeIntervention(S(50), S(100))]);
    const tl = projectTimeline(conv);
    expect(sourceRatio(tl)).toBeLessThan(0.51);
  });
});

describe('quote integrity (INV-05)', () => {
  it('accepts a quote that matches its hash', () => {
    const conv = makeConversation(S(60), [
      makeIntervention(S(30), S(5), { quote: 'The policy was clearly successful.' }),
    ]);
    expect(() => assertQuoteIntegrity(conv)).not.toThrow();
  });

  it('refuses a quote that has been altered', () => {
    const conv = makeConversation(S(60), [
      makeIntervention(S(30), S(5), { quote: 'The policy was clearly successful.' }),
    ]);
    conv.interventions[0]!.anchor.quote = 'The policy was clearly unsuccessful.';
    expect(() => assertQuoteIntegrity(conv)).toThrow(InvariantViolation);
  });

  it('tolerates whitespace and smart-quote variation', () => {
    const conv = makeConversation(S(60), [
      makeIntervention(S(30), S(5), { quote: `He said "yes" — twice.` }),
    ]);
    conv.interventions[0]!.anchor.quote = `He said “yes” — twice.`;
    expect(() => assertQuoteIntegrity(conv)).not.toThrow();
  });
});
