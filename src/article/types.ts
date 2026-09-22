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

/**
 * A formal citation.  [Doctrine U-33 §4]
 *
 * "Every piece of evidence appears in the publication bundle and the article
 *  transcript as a formal citation with its retrieval date."
 *
 * The retrieval date and content hash are what make it verifiable after the
 * page has changed — which is the whole reason the archive exists.
 */
export interface ArticleCitation {
  title: string;
  url?: string;
  retrievedAt: string;
  contentHash?: string;
  /** The cited line, where the author marked one. */
  quote?: string;
  page?: number;
  /** False when the archive failed: stated, never quietly presented as sound. */
  archived: boolean;
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
  /** Evidence cited in this response. [U-33 §4] */
  citations?: ArticleCitation[];
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
