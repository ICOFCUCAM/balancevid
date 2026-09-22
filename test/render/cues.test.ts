import { describe, expect, it } from 'vitest';
import { buildCues } from '../../src/render/cues.js';
import { projectTimeline } from '../../src/domain/timeline.js';
import { RESPONSE_PAD_FRAMES, HOUSE_FPS } from '../../src/domain/time.js';
import { TRANSCRIPT_VERSION, type Transcript } from '../../src/transcribe/types.js';
import { segment } from '../../src/transcribe/segmentation.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';

const F = (seconds: number) => Math.round(seconds * HOUSE_FPS);

function transcript(spec: Array<[string, number, number, number?]>): Transcript {
  const words = spec.map(([text, start, end, seg]) => ({
    text, startFrame: F(start), endFrame: F(end), segment: seg ?? 0,
  }));
  const { sentences, paragraphs } = segment(words);
  return {
    version: TRANSCRIPT_VERSION,
    engine: 'test', model: 'test', language: 'en',
    characteristics: { punctuation: false, casing: 'upper', speakerLabels: false },
    createdAt: '2026-09-22T00:00:00.000Z',
    assetId: 'asset_test',
    durationFrames: F(100),
    words, sentences, paragraphs,
  };
}

/**
 * Captions live on the OUTPUT clock; transcripts live on the source clock and
 * on each take's own media clock. These tests are the two-clock mapping (U-08)
 * checked at the point it is most likely to be got wrong.
 */
describe('caption cues on the output clock (U-19, U-08)', () => {
  it('passes source captions through unshifted before the first interruption', () => {
    const conversation = makeConversation(S(60), [makeIntervention(S(30), S(5))]);
    const timeline = projectTimeline(conversation);
    const cues = buildCues(conversation, timeline, {
      source: transcript([['THE', 2, 2.3], ['POLICY', 2.3, 2.8]]),
    });
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ startFrame: F(2), speaker: 'source' });
    expect(cues[0]!.text).toBe('The policy');
  });

  it('shifts source captions after an interruption by the whole response', () => {
    const speech = S(5);
    const conversation = makeConversation(S(60), [makeIntervention(S(30), speech)]);
    const timeline = projectTimeline(conversation);
    const cues = buildCues(conversation, timeline, {
      source: transcript([['AFTER', 40, 40.4], ['THAT', 40.4, 40.9]]),
    });
    const responseLength = speech + 2 * RESPONSE_PAD_FRAMES;
    expect(cues[0]!.startFrame).toBe(F(40) + responseLength);
  });

  it('clips a sentence that straddles the cut instead of dropping it', () => {
    // The viewer hears the first half, so they must read the first half.
    const conversation = makeConversation(S(60), [makeIntervention(F(30.5), S(4))]);
    const timeline = projectTimeline(conversation);
    const cues = buildCues(conversation, timeline, {
      source: transcript([['ONE', 30, 30.3], ['TWO', 30.3, 30.6], ['THREE', 30.6, 31]]),
    });
    expect(cues[0]!.startFrame).toBe(F(30));
    expect(cues[0]!.endFrame).toBe(F(30.5));
  });

  it('places response captions inside the response, after its clean air', () => {
    const conversation = makeConversation(S(60), [makeIntervention(S(30), S(6))]);
    const timeline = projectTimeline(conversation);
    const take = conversation.interventions[0]!.takes[0]!;
    const takes = new Map([[take.id, transcript([['I', 0, 0.4], ['DISAGREE', 0.4, 1.2]])]]);
    // The take's words sit at media time 0; the trim starts at the pre-roll.
    const cues = buildCues(conversation, timeline, { takes });
    const response = timeline.items.find((i) => i.kind === 'response')!;
    const shift = response.outputStartFrame + RESPONSE_PAD_FRAMES - take.mediaInFrame;
    expect(cues).toHaveLength(0); // words before mediaIn are pre-roll, correctly excluded
    expect(shift).toBeGreaterThan(0);
  });

  it('captions the response when its words fall inside the kept range', () => {
    const conversation = makeConversation(S(60), [makeIntervention(S(30), S(6))]);
    const take = conversation.interventions[0]!.takes[0]!;
    const spokenAt = take.mediaInFrame / HOUSE_FPS + 0.5;
    const takes = new Map([[take.id, transcript([['I', spokenAt, spokenAt + 0.4], ['DISAGREE', spokenAt + 0.4, spokenAt + 1.2]])]]);
    const timeline = projectTimeline(conversation);
    const cues = buildCues(conversation, timeline, { takes });
    const response = timeline.items.find((i) => i.kind === 'response')!;
    expect(cues).toHaveLength(1);
    expect(cues[0]!.speaker).toBe('user');
    expect(cues[0]!.startFrame).toBeGreaterThanOrEqual(response.outputStartFrame);
    expect(cues[0]!.endFrame).toBeLessThanOrEqual(response.outputStartFrame + response.durationFrames);
  });

  it('never emits overlapping cues', () => {
    const conversation = makeConversation(S(60), [makeIntervention(S(30), S(5))]);
    const timeline = projectTimeline(conversation);
    const cues = buildCues(conversation, timeline, {
      source: transcript([
        ['A', 1, 1.4], ['B', 1.4, 2.0],
        ['C', 3, 3.4], ['D', 3.4, 4.0],
        ['E', 10, 10.4], ['F', 10.4, 11],
      ]),
    });
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.startFrame).toBeGreaterThanOrEqual(cues[i - 1]!.endFrame);
    }
  });

  it('produces nothing when there is no transcript, rather than failing', () => {
    const conversation = makeConversation(S(60), [makeIntervention(S(30), S(5))]);
    expect(buildCues(conversation, projectTimeline(conversation), {})).toEqual([]);
  });
});
