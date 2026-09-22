/**
 * The transcript.  [Doctrine U-03, U-24]
 *
 * Three levels, from day one: word, sentence, paragraph. Sentence-only timing
 * cannot support highlighting part of a sentence (§12), word-synchronised
 * captions (§24), or research with exact jump points (§43) -- and retrofitting
 * word timing means re-transcribing every source in the system.
 *
 * The transcript belongs to the KNOWLEDGE LAYER of the Conversation (Part 0).
 * It is not a representation: it is part of the canonical artifact, and the
 * article, the captions and the claim cards are all rendered FROM it.
 *
 * All times are FRAMES on the source clock (U-08). Seconds are derived for
 * display, never stored.
 */

import type { Frames } from '../domain/time.js';

export const TRANSCRIPT_VERSION = 1;

export interface TranscriptWord {
  text: string;
  startFrame: Frames;
  endFrame: Frames;
  /** Which speech run this came from; a proxy for turn-taking. */
  segment: number;
  confidence?: number;
}

export interface TranscriptSentence {
  id: string;
  /** Half-open index range into `words`. */
  wordStart: number;
  wordEnd: number;
  startFrame: Frames;
  endFrame: Frames;
  text: string;
  paragraph: number;
}

export interface TranscriptParagraph {
  id: string;
  sentenceStart: number;
  sentenceEnd: number;
  startFrame: Frames;
  endFrame: Frames;
  topic?: string;
}

/**
 * What the engine can and cannot do, recorded rather than assumed.
 *
 * The local transducer emits upper-case words with no punctuation. Pretending
 * otherwise would mean a caption renderer silently inventing sentence ends and
 * a quote card claiming a precision the engine never had.
 */
export interface EngineCharacteristics {
  punctuation: boolean;
  casing: 'upper' | 'mixed';
  speakerLabels: boolean;
}

export interface Transcript {
  version: number;
  engine: string;
  model: string;
  language: string;
  characteristics: EngineCharacteristics;
  createdAt: string;
  /** The asset this was transcribed from, so a re-ingest invalidates it. */
  assetId: string;
  durationFrames: Frames;
  words: TranscriptWord[];
  sentences: TranscriptSentence[];
  paragraphs: TranscriptParagraph[];
}

export interface TranscribeOptions {
  language?: string;
  threads?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/**
 * The one interface.  [Doctrine D-14]
 *
 * "pluggable ASR behind one interface; word-level output mandatory (U-03); no
 * engine lock-in." A cloud engine implements this and nothing upstream changes.
 */
export interface Transcriber {
  readonly id: string;
  readonly label: string;
  /** Whether this engine can run right now (model present, key configured). */
  available(): Promise<boolean>;
  /** Transcribe a media file. Word-level output is not optional. */
  transcribe(mediaPath: string, assetId: string, options?: TranscribeOptions): Promise<Transcript>;
}

export function sentenceTextOf(words: TranscriptWord[], start: number, end: number): string {
  return words.slice(start, end).map((w) => w.text).join(' ');
}

/**
 * Presentation casing for an engine that only emits upper case.
 *
 * This is PRESENTATION, not alteration: the stored words are exactly what the
 * engine produced, and quote integrity (INV-05) hashes a case-folded form, so
 * displaying a claim in sentence case cannot break its binding. An engine that
 * already emits mixed case is left alone.
 */
export function forDisplay(text: string, characteristics: EngineCharacteristics): string {
  if (characteristics.casing !== 'upper') return text;
  const lower = text.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}
