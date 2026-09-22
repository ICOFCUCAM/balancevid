import { describe, expect, it } from 'vitest';
import { EmptyReelError, buildReelPlan, buildReelTimeline } from '../../src/domain/reel.js';
import { RESPONSE_PAD_FRAMES } from '../../src/domain/time.js';
import { S, makeConversation, makeIntervention } from './fixtures.js';

function embedded() {
  const conversation = makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
    makeIntervention(S(300), S(15), { type: 'context' }),
  ], { class: 'B', mezzanineAssetId: undefined, provider: 'youtube', providerVideoId: 'dQw4w9WgXcQ' });
  return conversation;
}

/**
 * "Contains no provider footage." [U-01]
 *
 * A structural property, not a promise: the reel's timeline has no source
 * segment for provider footage to appear in.
 */
describe('the response reel (U-01)', () => {
  it('contains the author\'s material and nothing else', () => {
    const timeline = buildReelTimeline(embedded());
    expect(timeline.items.every((item) => item.kind === 'response')).toBe(true);
    expect(timeline.sourceFrames).toBe(0);
  });

  it('runs the responses back to back, in source order', () => {
    const timeline = buildReelTimeline(embedded());
    expect(timeline.items[0]!.outputStartFrame).toBe(0);
    expect(timeline.items[1]!.outputStartFrame).toBe(timeline.items[0]!.durationFrames);
    expect(timeline.totalOutputFrames).toBe(
      S(20) + S(15) + 4 * RESPONSE_PAD_FRAMES);
  });

  it('plans as a companion export, which is the only kind a Class B source has', () => {
    const plan = buildReelPlan(embedded());
    expect(plan.mode).toBe('companion');
    expect(plan.shots.every((shot) => shot.kind === 'response')).toBe(true);
  });

  it('shows the claim as typography, since the video it answers is not here', () => {
    const plan = buildReelPlan(embedded());
    const shot = plan.shots.find((s) => s.kind === 'response') as { quote?: string };
    expect(shot.quote).toBe('The policy worked.');
  });

  it('fills the frame with the author rather than a panel with nothing in it', () => {
    const plan = buildReelPlan(embedded());
    expect(plan.shots.every((s) => s.layoutId === 'full_user')).toBe(true);
  });

  it('carries captions and attribution like every other export (INV-07)', () => {
    const plan = buildReelPlan(embedded());
    expect(plan.captions.sidecars).toEqual(['srt', 'vtt']);
    expect(plan.attribution.text).toContain('The History of Europe');
  });

  it('refuses to make a video out of nothing', () => {
    const empty = makeConversation(S(600), [], { class: 'B', mezzanineAssetId: undefined });
    expect(() => buildReelTimeline(empty)).toThrow(EmptyReelError);
  });

  it('is still refused a composed plan (INV-01)', async () => {
    const { buildRenderPlan } = await import('../../src/domain/plan.js');
    expect(() => buildRenderPlan(embedded(), { mode: 'composed' })).toThrow(/Class B/);
  });
});
