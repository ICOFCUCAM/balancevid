/**
 * Searching a conversation.  [Doctrine §43, §16, D-05, D-12]
 *
 * §16's closing line — "a searchable intellectual record of the conversation"
 * — is the one the doctrine calls one of its most valuable sentences. §43 is
 * the mechanism: find every moment something was said, and jump to it.
 *
 * What makes this more than a text box is that a hit carries a FRAME. Every
 * result is a place you can go, and from there interrupt — so searching and
 * responding are one motion rather than two.
 */

import type { Frames } from '../domain/time.js';

/**
 * What matched.
 *
 * Not one undifferentiated pile of text: an author looking for "Norway" cares
 * whether the source said it, whether they themselves said it, or whether it
 * is the claim they bound. The kind is shown, never inferred from context.
 */
export type HitKind =
  | 'source'     // the source's own words, from its transcript
  | 'response'   // the author's words, from a take transcript
  | 'claim'      // a claim the author bound to an intervention
  | 'evidence'   // an attached document's title or cited line
  | 'note';      // the author's written note on an intervention

export interface Highlight {
  start: number;
  end: number;
}

export interface SearchHit {
  kind: HitKind;
  /** The line, as it should be shown — display-cased, never the raw ASR. */
  text: string;
  /** Ranges within `text` that matched, for the UI to mark. */
  highlights: Highlight[];
  /**
   * Where to go. On the SOURCE clock, because that is the clock the author
   * navigates in and the one an interruption is anchored to (U-08).
   */
  tSourceFrame: Frames;
  timecode: string;
  interventionId?: string;
  evidenceId?: string;
  /** Higher is better. Explained by `kind`, never shown as a bare number. */
  score: number;
}

export interface ConversationHits {
  conversationId: string;
  title: string;
  sourceTitle: string;
  /** False when the caller is a stranger reading something published. */
  owned: boolean;
  hits: SearchHit[];
  total: number;
}

export interface Query {
  /** Bare words must all appear; "quoted words" must appear together. */
  terms: string[];
  phrases: string[];
  /** Nothing to search for. */
  empty: boolean;
}
