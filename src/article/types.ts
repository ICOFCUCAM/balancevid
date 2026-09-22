/**
 * The article.  [Doctrine U-14, INV-00]
 *
 * "Every conversation renders in two formats, always, from the same document:
 *  the video, and a structured, citable, linkable article."
 *
 * §16 called the conversation "a searchable intellectual record" and then did
 * nothing with it. This is the thing that does something with it: the same
 * Conversation, rendered as text that is indexable, screen-reader accessible,
 * quotable, readable in two minutes where the video takes forty, and citable
 * by journalists, academics and teachers.
 *
 * It is a REPRESENTATION (INV-00): regenerable from scratch, holding nothing
 * the Conversation does not, and never editable except through the
 * Conversation.
 */

import type { InterventionType } from '../domain/document.js';
import type { Frames } from '../domain/time.js';

export const ARTICLE_VERSION = 1;

export interface ArticleSource {
  title: string;
  creator?: string;
  url?: string;
  accessedAt: string;
  durationFrames: Frames;
}

export interface ArticleClaim {
  /** Verbatim from the transcript, bound to its hash. [U-10, INV-05] */
  text: string;
  hash?: string;
  tSourceFrame: Frames;
  timecode: string;
}

export interface ArticleExchange {
  index: number;
  interventionId: string;
  type: InterventionType;
  /** The human-readable move: CRITIQUE, CORRECTION, CONTEXT… [U-11] */
  typeLabel: string;
  tSourceFrame: Frames;
  timecode: string;
  /** The statement being answered, when the author bound one. */
  claim?: ArticleClaim;
  /**
   * What the source was saying at that moment, when no claim was bound.
   *
   * Bounded to the anchored sentence. The article quotes what is being
   * answered; it does not reproduce the source's transcript.
   */
  context?: string;
  response: {
    /** Transcribed from the author's own take, trimmed to what they kept. */
    text: string | null;
    durationFrames: Frames;
    takeId: string | null;
  };
  /** Where this lands in the rendered video, for a deep link. [U-08] */
  outputStartFrame?: Frames;
  outputTimecode?: string;
}

/**
 * How this was made.  [Doctrine U-15]
 *
 * "Every AI output is labelled, attributed to its model." The article says
 * which engine transcribed what, and states plainly that every word of every
 * response is the author's -- which is the product's central claim about
 * itself and belongs where readers can see it.
 */
export interface ArticleProvenance {
  transcriptionEngine?: string;
  transcriptionModel?: string;
  transcriptVersion?: number;
  /** Engine limits, stated rather than hidden. */
  notes: string[];
}

export interface Article {
  version: number;
  conversationId: string;
  title: string;
  source: ArticleSource;
  /** Generated, non-removable. [U-21, INV-07] */
  attribution: string;
  stats: {
    exchanges: number;
    sourceRatio: number;
    totalOutputFrames: Frames;
    responseWords: number;
  };
  exchanges: ArticleExchange[];
  provenance: ArticleProvenance;
  /** Supplied by the caller, never read from the clock, so the article is
   *  reproducible from its inputs alone. [U-16 §2] */
  generatedAt: string;
}
