import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAD_IN, LONG_CLIP_FRAMES, MAX_LEAD_IN,
  buildClipPlan, buildClipTimeline, clipCandidates, openingFor,
} from '../../src/domain/clips.js';
import { CARD_SECONDS, MAX_HOOK_LENGTH } from '../../src/domain/document.js';
import { setOpening } from '../../src/domain/edit.js';
import { buildRenderPlan } from '../../src/domain/plan.js';
import { RESPONSE_PAD_FRAMES, HOUSE_FPS } from '../../src/domain/time.js';
import { segment } from '../../src/transcribe/segmentation.js';
import { TRANSCRIPT_VERSION, type Transcript } from '../../src/transcribe/types.js';
import { S, makeConversation, makeIntervention } from './fixtures.js';

const F = (seconds: number) => Math.round(seconds * HOUSE_FPS);

function transcript(spec: Array<[string, number, number]>): Transcript {
  const words = spec.map(([text, start, end]) => ({
    text, startFrame: F(start), endFrame: F(end), segment: 0,
  }));
  const { sentences, paragraphs } = segment(words);
  return {
    version: TRANSCRIPT_VERSION, engine: 'test', model: 'test', language: 'en',
    characteristics: { punctuation: false, casing: 'upper', speakerLabels: false },
    createdAt: '2026-09-22T00:00:00.000Z', assetId: 'asset_x',
    durationFrames: F(600), words, sentences, paragraphs,
  };
}

/**
 * "A forty-minute conversation has no vertical form. Reframing it produces a
 *  forty-minute vertical video nobody watches." [U-22]
 */
describe('the clip is the pair, not the conversation (U-22)', () => {
  const conversation = makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
    makeIntervention(S(300), S(15), { type: 'explain' }),
  ]);

  it('plays the claim, then the reply, and nothing else', () => {
    const first = conversation.interventions[0]!;
    const timeline = buildClipTimeline(conversation, first.id);
    expect(timeline.items.map((i) => i.kind)).toEqual(['source', 'response']);
    const [source, response] = timeline.items as [any, any];
    expect(source.sourceOutFrame).toBe(S(100));            // ends where the cut is
    expect(source.sourceInFrame).toBe(S(100) - DEFAULT_LEAD_IN);
    expect(response.outputStartFrame).toBe(source.durationFrames);
    expect(timeline.totalOutputFrames).toBe(
      source.durationFrames + S(20) + 2 * RESPONSE_PAD_FRAMES);
  });

  it('starts the lead-in where the sentence starts, not an arbitrary number of seconds back', () => {
    const first = conversation.interventions[0]!;
    // A sentence running 97s–100s, i.e. three seconds before the cut.
    const timeline = buildClipTimeline(conversation, first.id, transcript([
      ['THE', 97, 97.4], ['POLICY', 97.4, 98.2], ['WORKED', 98.2, 100],
    ]));
    const source = timeline.items[0] as any;
    expect(source.sourceInFrame).toBe(F(97));
  });

  it('never quotes more of the source than a quotation', () => {
    const late = makeConversation(S(3600), [makeIntervention(S(1800), S(10))]);
    const timeline = buildClipTimeline(late, late.interventions[0]!.id, transcript([
      // A sentence that somehow runs for two minutes.
      ['ONE', 1680, 1799.5],
    ]));
    const source = timeline.items[0] as any;
    expect(source.durationFrames).toBeLessThanOrEqual(MAX_LEAD_IN);
  });

  it('clamps the lead-in at the start of the source', () => {
    const early = makeConversation(S(600), [makeIntervention(S(2), S(10))]);
    const source = buildClipTimeline(early, early.interventions[0]!.id).items[0] as any;
    expect(source.sourceInFrame).toBe(0);
    expect(source.sourceOutFrame).toBe(S(2));
  });

  it('refuses to clip a response with nothing in it', () => {
    const empty = makeConversation(S(600), [makeIntervention(S(100), S(10))]);
    empty.interventions[0]!.selectedTakeId = null;
    expect(() => buildClipTimeline(empty, empty.interventions[0]!.id))
      .toThrow(/no usable take/);
  });
});

describe('the clip plan', () => {
  const conversation = makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
  ]);
  const plan = buildClipPlan(conversation, conversation.interventions[0]!.id);

  it('is vertical, and reflows rather than cropping (U-22 §3)', () => {
    expect(plan.exportProfile.id).toBe('vertical_9x16');
    expect(plan.exportProfile.width).toBe(1080);
    expect(plan.exportProfile.height).toBe(1920);
    expect(plan.shots.find((s) => s.kind === 'source')!.layoutId).toBe('vertical_source');
    expect(plan.shots.find((s) => s.kind === 'response')!.layoutId).toBe('vertical_stack');
  });

  it('opens on the claim, so it reads with the sound off (U-22 §2)', () => {
    expect(plan.openingClaim?.text).toBe('The policy worked.');
    expect(plan.openingClaim?.seconds).toBeGreaterThan(0);
  });

  it('carries captions and attribution like any other export (INV-07)', () => {
    expect(plan.captions.burnIn).toBe(true);
    expect(plan.captions.sidecars).toEqual(['srt', 'vtt']);
    expect(plan.attribution.text).toContain('The History of Europe');
  });

  it('is a different render from the long-form one', () => {
    expect(plan.planHash).not.toBe(buildRenderPlan(conversation).planHash);
  });
});

describe('proposing candidates, never publishing them (U-22 §4)', () => {
  it('ranks a quoted disagreement above an aside', () => {
    const conversation = makeConversation(S(600), [
      makeIntervention(S(100), S(12), { type: 'critique', quote: 'The policy worked.' }),
      makeIntervention(S(300), S(2), { type: 'agree' }),
    ]);
    const candidates = clipCandidates(conversation);
    expect(candidates[0]!.type).toBe('critique');
    expect(candidates[0]!.claimIsBound).toBe(true);
    expect(candidates[0]!.reasons).toContain('answers a statement you quoted');
    expect(candidates[0]!.score).toBeGreaterThan(candidates[1]!.score);
  });

  it('says why, so a creator can disagree with the ranking', () => {
    const conversation = makeConversation(S(600), [
      makeIntervention(S(100), S(12), { type: 'fact_check' }),
    ]);
    expect(clipCandidates(conversation)[0]!.reasons.length).toBeGreaterThan(0);
  });

  it('flags a clip too long for the formats it is made for', () => {
    const conversation = makeConversation(S(3600), [makeIntervention(S(600), S(120))]);
    const candidate = clipCandidates(conversation)[0]!;
    expect(candidate.totalFrames).toBeGreaterThan(LONG_CLIP_FRAMES);
    expect(candidate.tooLong).toBe(true);
  });

  it('offers nothing for a response that was never recorded', () => {
    const conversation = makeConversation(S(600), [makeIntervention(S(100), S(10))]);
    conversation.interventions[0]!.selectedTakeId = null;
    expect(clipCandidates(conversation)).toHaveLength(0);
  });
});

/**
 * The opening.  [Doctrine U-22 §2, D-16, INV-05]
 *
 * A vertical clip is decided in its first second, so the opening is the most
 * consequential editorial choice in the distribution engine — and it was the
 * only one the author could not make.
 *
 * The rule the tests below exist for: QUOTATION MARKS ARE RESERVED FOR WHAT
 * WAS SAID. A statement is the source's own sentence and the clip plays it a
 * moment later, which is what earns the marks. A hook is the author's line
 * over the source's picture, and quoted it would read as something the source
 * said, on top of their own footage.
 */
describe('how a clip opens (U-22 §2)', () => {
  const pair = (over: Parameters<typeof makeIntervention>[2] = {}) => makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.', ...over }),
  ]);
  const open = (conversation: ReturnType<typeof pair>) => {
    const intervention = conversation.interventions[0]!;
    return openingFor(conversation, intervention);
  };

  it('defaults to the statement, in quotation marks', () => {
    const resolved = open(pair());
    expect(resolved.card).toEqual({
      text: 'The policy worked.', seconds: CARD_SECONDS, quoted: true,
    });
    expect(resolved.chosen).toBe(false);
  });

  it('and the author can open on their own line instead', () => {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, {
      card: { kind: 'text', text: 'This number is doing a lot of work.' },
    });
    expect(open(conversation).card)
      .toEqual({ text: 'This number is doing a lot of work.', seconds: CARD_SECONDS, quoted: false });
  });

  it('which is NEVER set in quotation marks (INV-05)', () => {
    /*
     * The one that matters. The hook is the author speaking over the source's
     * own picture; quoted, it is a sentence attributed to somebody who never
     * said it. The plan carries the flag so the renderer cannot decide
     * otherwise on its own.
     */
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, {
      card: { kind: 'text', text: 'Watch what happens next.' },
    });
    const plan = buildClipPlan(conversation, conversation.interventions[0]!.id);
    expect(plan.openingClaim).toEqual({
      text: 'Watch what happens next.', seconds: CARD_SECONDS, quoted: false,
    });

    const untouched = pair();
    const quoted = buildClipPlan(untouched, untouched.interventions[0]!.id);
    expect(quoted.openingClaim?.quoted).toBe(true);
  });

  it('or on nothing at all, straight into the footage', () => {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, { card: { kind: 'none' } });
    expect(open(conversation).card).toBeUndefined();
    expect(buildClipPlan(conversation, conversation.interventions[0]!.id).openingClaim)
      .toBeUndefined();
  });

  it('and clearing the line means no card, not an empty one', () => {
    // Stored canonically, so no later reader has to guess what "" meant.
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, {
      card: { kind: 'text', text: '   ' },
    });
    expect(conversation.interventions[0]!.opening?.card).toEqual({ kind: 'none' });
    expect(open(conversation).card).toBeUndefined();
  });
});

describe('where a clip starts (U-22 §2)', () => {
  const pair = () => makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
  ]);

  it('the author can say how much runs before the cut', () => {
    const conversation = pair();
    const id = conversation.interventions[0]!.id;
    setOpening(conversation, id, { leadInFrames: S(3) });
    expect(openingFor(conversation, conversation.interventions[0]!).leadInFrames).toBe(S(3));

    const timeline = buildClipTimeline(conversation, id);
    expect(timeline.sourceFrames).toBe(S(3));
    expect(timeline.items[0]).toMatchObject({ sourceInFrame: S(100) - S(3) });
  });

  it('and a lead-in past what a quotation may take is cut back to it', () => {
    // Beyond this it stops being a quotation and becomes a rebroadcast.
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, { leadInFrames: S(600) });
    expect(openingFor(conversation, conversation.interventions[0]!).leadInFrames)
      .toBe(MAX_LEAD_IN);
  });

  it('and one longer than the source before it is cut to the source', () => {
    const conversation = makeConversation(S(600), [
      makeIntervention(S(2), S(20), { type: 'critique' }),
    ]);
    setOpening(conversation, conversation.interventions[0]!.id, { leadInFrames: S(10) });
    expect(openingFor(conversation, conversation.interventions[0]!).leadInFrames).toBe(S(2));
  });

  it('none of which is written back into the document', () => {
    /*
     * The clamp happens when the clip is planned, not when the choice is
     * made, because the anchor can still move. Storing the clamped number
     * would freeze a decision against a source that has since changed.
     */
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, { leadInFrames: S(600) });
    expect(conversation.interventions[0]!.opening?.leadInFrames).toBe(S(600));
  });

  it('and choosing nothing leaves the document as it was (D-16)', () => {
    const conversation = pair();
    const id = conversation.interventions[0]!.id;
    setOpening(conversation, id, {});
    expect(conversation.interventions[0]!.opening).toBeUndefined();

    setOpening(conversation, id, { card: { kind: 'text', text: 'A hook.' } });
    setOpening(conversation, id, null);
    expect(conversation.interventions[0]!.opening).toBeUndefined();
  });
});

describe('what an opening refuses', () => {
  const pair = () => makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique' }),
  ]);

  it('a hook too long to be read in a moving thumbnail', () => {
    const conversation = pair();
    expect(() => setOpening(conversation, conversation.interventions[0]!.id, {
      card: { kind: 'text', text: 'x'.repeat(MAX_HOOK_LENGTH + 1) },
    })).toThrow(/characters/);
  });

  it('a hold nobody could read, or one nobody would wait through', () => {
    const conversation = pair();
    const id = conversation.interventions[0]!.id;
    for (const seconds of [0.2, 30]) {
      expect(() => setOpening(conversation, id, {
        card: { kind: 'text', text: 'A hook.', seconds },
      })).toThrow(/seconds/);
    }
  });

  it('and a negative lead-in', () => {
    const conversation = pair();
    expect(() => setOpening(conversation, conversation.interventions[0]!.id, {
      leadInFrames: -30,
    })).toThrow(/negative/);
  });
});
