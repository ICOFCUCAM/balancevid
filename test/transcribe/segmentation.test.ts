import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES, interruptFrameFor, segment, sentenceAtFrame,
} from '../../src/transcribe/segmentation.js';
import type { TranscriptWord } from '../../src/transcribe/types.js';
import { HOUSE_FPS } from '../../src/domain/time.js';

const F = (seconds: number) => Math.round(seconds * HOUSE_FPS);

/** words(['THE',0,0.3], ...) — text, start, end in seconds. */
function words(spec: Array<[string, number, number, number?]>): TranscriptWord[] {
  return spec.map(([text, start, end, seg]) => ({
    text, startFrame: F(start), endFrame: F(end), segment: seg ?? 0,
  }));
}

describe('sentence segmentation from silence (U-03)', () => {
  it('splits on a pause long enough to be a thought ending', () => {
    const { sentences } = segment(words([
      ['THE', 0, 0.3], ['POLICY', 0.3, 0.8], ['WORKED', 0.8, 1.3],
      // 0.9s of silence
      ['BUT', 2.2, 2.5], ['DID', 2.5, 2.8], ['IT', 2.8, 3.0],
    ]));
    expect(sentences).toHaveLength(2);
    expect(sentences[0]!.text).toBe('THE POLICY WORKED');
    expect(sentences[1]!.text).toBe('BUT DID IT');
  });

  it('does not split on a breath', () => {
    const { sentences } = segment(words([
      ['THE', 0, 0.3], ['POLICY', 0.4, 0.9], ['CLEARLY', 1.0, 1.5], ['WORKED', 1.6, 2.0],
    ]));
    expect(sentences).toHaveLength(1);
  });

  it('treats a change of speech run as a boundary regardless of gap', () => {
    const { sentences } = segment(words([
      ['ONE', 0, 0.3, 0], ['TWO', 0.3, 0.6, 0],
      ['THREE', 0.62, 0.9, 1], ['FOUR', 0.9, 1.2, 1],
    ]));
    expect(sentences).toHaveLength(2);
  });

  it('breaks a continuous talker into navigable units', () => {
    const spec: Array<[string, number, number]> = [];
    for (let i = 0; i < 40; i++) spec.push([`W${i}`, i * 0.3, i * 0.3 + 0.28]);
    const { sentences } = segment(words(spec));
    expect(sentences.length).toBeGreaterThan(1);
    for (const sentence of sentences) {
      expect(sentence.wordEnd - sentence.wordStart).toBeLessThanOrEqual(DEFAULT_RULES.maxSentenceWords);
    }
  });

  it('covers every word exactly once, in order', () => {
    const spec: Array<[string, number, number]> = [];
    for (let i = 0; i < 60; i++) {
      const start = i * 0.4 + (i % 7 === 0 ? 1.2 : 0);
      spec.push([`W${i}`, start, start + 0.3]);
    }
    const all = words(spec);
    const { sentences } = segment(all);
    const covered = sentences.flatMap((s) =>
      Array.from({ length: s.wordEnd - s.wordStart }, (_, k) => s.wordStart + k));
    expect(covered).toEqual(all.map((_, i) => i));
  });

  it('groups sentences into paragraphs on longer silences', () => {
    const { sentences, paragraphs } = segment(words([
      ['A', 0, 0.3], ['B', 0.3, 0.6],
      ['C', 1.4, 1.7], ['D', 1.7, 2.0],
      // 2.5s -- a topic change
      ['E', 4.5, 4.8], ['F', 4.8, 5.1],
    ]));
    expect(sentences).toHaveLength(3);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.sentenceEnd).toBe(2);
    expect(sentences[2]!.paragraph).toBe(1);
  });

  it('returns nothing for silence rather than an empty sentence', () => {
    expect(segment([]).sentences).toHaveLength(0);
  });
});

describe('transcript navigation (§16, U-09)', () => {
  const { sentences } = segment(words([
    ['THE', 0, 0.3], ['POLICY', 0.3, 0.8],
    ['IT', 2.0, 2.2], ['WORKED', 2.2, 2.8],
  ]));

  it('finds the sentence playing at a frame', () => {
    expect(sentenceAtFrame(sentences, F(0.5))?.text).toBe('THE POLICY');
    expect(sentenceAtFrame(sentences, F(2.4))?.text).toBe('IT WORKED');
  });

  it('keeps the last sentence as context in the gap after it', () => {
    expect(sentenceAtFrame(sentences, F(1.4))?.text).toBe('THE POLICY');
  });

  it('defaults a sentence interrupt to AFTER the sentence, so the claim is heard', () => {
    const sentence = sentences[0]!;
    expect(interruptFrameFor(sentence)).toBe(sentence.endFrame);
    expect(interruptFrameFor(sentence, 'over')).toBe(sentence.startFrame);
  });
});
