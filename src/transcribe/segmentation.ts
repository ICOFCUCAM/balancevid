/**
 * Words into sentences into paragraphs.  [Doctrine U-03]
 *
 * The local engine emits no punctuation, so sentence boundaries cannot be read
 * off the text. They are inferred from the evidence that actually exists:
 * silence. A pause is where a speaker finished a thought, which is also
 * exactly what §11 wants -- a place a viewer would naturally interrupt.
 *
 * Pure. No I/O, so the boundary rules are testable without a model.
 */

import { HOUSE_FPS, secondsToFrames, type Frames } from '../domain/time.js';
import {
  type TranscriptParagraph, type TranscriptSentence, type TranscriptWord,
  sentenceTextOf,
} from './types.js';

export interface SegmentationRules {
  /** A gap at least this long ends a sentence. */
  sentenceGapFrames: Frames;
  /** A gap at least this long ends a paragraph. */
  paragraphGapFrames: Frames;
  /** Hard ceilings, so a continuous talker still produces navigable units. */
  maxSentenceWords: number;
  maxSentenceFrames: Frames;
  maxParagraphSentences: number;
}

export const DEFAULT_RULES: SegmentationRules = {
  sentenceGapFrames: secondsToFrames(0.55, HOUSE_FPS),
  paragraphGapFrames: secondsToFrames(1.6, HOUSE_FPS),
  maxSentenceWords: 16,
  maxSentenceFrames: secondsToFrames(9, HOUSE_FPS),
  maxParagraphSentences: 6,
};

export function segment(
  words: TranscriptWord[],
  rules: SegmentationRules = DEFAULT_RULES,
): { sentences: TranscriptSentence[]; paragraphs: TranscriptParagraph[] } {
  const sentences: TranscriptSentence[] = [];
  if (words.length === 0) return { sentences, paragraphs: [] };

  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = words[i + 1];
    const spanFrames = word.endFrame - words[start]!.startFrame;
    const wordCount = i - start + 1;

    const gapEnds = next ? next.startFrame - word.endFrame >= rules.sentenceGapFrames : true;
    // A change of speech run is a stronger boundary than any gap threshold:
    // the VAD already decided the speaker stopped there.
    const runEnds = next ? next.segment !== word.segment : true;
    const tooLong = wordCount >= rules.maxSentenceWords || spanFrames >= rules.maxSentenceFrames;

    if (gapEnds || runEnds || tooLong || !next) {
      sentences.push({
        id: `s_${String(sentences.length).padStart(4, '0')}`,
        wordStart: start,
        wordEnd: i + 1,
        startFrame: words[start]!.startFrame,
        endFrame: word.endFrame,
        text: sentenceTextOf(words, start, i + 1),
        paragraph: 0,
      });
      start = i + 1;
    }
  }

  const paragraphs: TranscriptParagraph[] = [];
  let paragraphStart = 0;
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]!;
    const next = sentences[i + 1];
    const gap = next ? next.startFrame - sentence.endFrame : Number.POSITIVE_INFINITY;
    const count = i - paragraphStart + 1;

    if (gap >= rules.paragraphGapFrames || count >= rules.maxParagraphSentences || !next) {
      const index = paragraphs.length;
      for (let s = paragraphStart; s <= i; s++) sentences[s]!.paragraph = index;
      paragraphs.push({
        id: `p_${String(index).padStart(3, '0')}`,
        sentenceStart: paragraphStart,
        sentenceEnd: i + 1,
        startFrame: sentences[paragraphStart]!.startFrame,
        endFrame: sentence.endFrame,
      });
      paragraphStart = i + 1;
    }
  }

  return { sentences, paragraphs };
}

/** The sentence containing a source frame, for transcript-follows-playback (§16). */
export function sentenceAtFrame(
  sentences: TranscriptSentence[], frame: Frames,
): TranscriptSentence | null {
  let best: TranscriptSentence | null = null;
  for (const sentence of sentences) {
    if (sentence.startFrame > frame) break;
    best = sentence;
  }
  if (best && frame <= best.endFrame) return best;
  // Between sentences: the one just finished is still the right context.
  return best;
}

/**
 * Where to cut for a sentence-anchored interruption.  [Doctrine U-09]
 *
 * The default is the sentence's END: a viewer who wants to answer a claim
 * wants the audience to hear the claim first. Cutting at its start removes it
 * from the final video and the response answers something nobody heard.
 */
export function interruptFrameFor(
  sentence: TranscriptSentence, mode: 'after' | 'over' = 'after',
): Frames {
  return mode === 'after' ? sentence.endFrame : sentence.startFrame;
}
