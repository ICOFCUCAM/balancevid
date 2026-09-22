import { segment } from '../../src/transcribe/segmentation.js';
import { TRANSCRIPT_VERSION, type Transcript } from '../../src/transcribe/types.js';
import { HOUSE_FPS, type Frames } from '../../src/domain/time.js';

export const AT = '2026-09-22T10:00:00.000Z';
const F = (seconds: number): Frames => Math.round(seconds * HOUSE_FPS);

/**
 * A transcript in the shape the local engine actually produces: upper case,
 * unpunctuated, sentence boundaries inferred from silence. Anything that only
 * works on tidy prose does not work on this product's real input.
 */
export function transcriptOf(sentences: string[], gapSeconds = 2): Transcript {
  const words: Transcript['words'] = [];
  let t = 1;
  for (const sentence of sentences) {
    for (const word of sentence.split(/\s+/).filter(Boolean)) {
      words.push({ text: word.toUpperCase(), startFrame: F(t), endFrame: F(t + 0.4), segment: 0 });
      t += 0.5;
    }
    t += gapSeconds; // Silence, which is what segmentation reads as a boundary.
  }
  const { sentences: segmented, paragraphs } = segment(words);
  return {
    version: TRANSCRIPT_VERSION,
    engine: 'sherpa-onnx', model: 'zipformer-en', language: 'en',
    characteristics: { punctuation: false, casing: 'upper', speakerLabels: false },
    createdAt: AT, assetId: 'asset_x', durationFrames: F(t + 10),
    words, sentences: segmented, paragraphs,
  };
}

/** The whole source, as one string, for verbatim checks. */
export function sourceTextOf(transcript: Transcript): string {
  return transcript.sentences.map((s) => s.text).join(' ');
}
