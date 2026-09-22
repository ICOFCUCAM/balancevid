/**
 * The AI boundary, as code.  [Doctrine U-15, §20, U-34]
 *
 * U-15 exists because §20's "the user remains the creator" is a sentiment, and
 * sentiments erode under product pressure. The upgrade's own words: the
 * boundary has to be written down now, while it costs nothing to hold. This
 * module is the boundary written down in a form that a build can fail on.
 *
 * Three rules do the work:
 *
 *   1. A suggestion is not a document. Nothing here is rendered, quoted or
 *      published. The only way out of this module is a human acceptance.
 *   2. Every element that came from a suggestion records WHERE it came from --
 *      model, version, prompt hash, and the person who accepted it. U-15 asks
 *      for exactly those four fields.
 *   3. The forbidden list is expressed in the TYPES, not in a comment. There
 *      is no payload that produces a take, no payload that carries a verdict,
 *      and no payload that rewrites a quote. A future contributor who wants to
 *      generate the response audio in the user's cloned voice has to delete
 *      something that is clearly load-bearing to do it.
 *
 * The boundary is also the marketing: every word in the response is a human's.
 */

import { normaliseQuote, quoteHash, sha256, type Id } from './ids.js';
import type { Frames } from './time.js';

export type SuggestionId = Id<'sug'>;

/**
 * What AI is permitted to do, as data rather than prose.  [U-15]
 *
 * Kept machine-readable so the permitted list can be asserted in a test and
 * shown to the user verbatim. A capability that is not in this list does not
 * exist, and there is no "other".
 */
export const AI_MAY = [
  'read', 'transcribe', 'segment', 'index', 'search', 'summarise',
  'surface claims', 'retrieve sources', 'check facts against references',
  'suggest structure', 'draft text the user then speaks or edits',
  'generate captions', 'propose chapters', 'propose layouts',
] as const;

export const AI_MAY_NOT = [
  'speak in the user\'s voice',
  'generate a response the user did not say',
  'alter a source quote',
  'alter what the user recorded themselves saying',
  'assert a fact-check verdict as the product\'s own',
] as const;

/**
 * What produced a suggestion, recorded rather than assumed.
 *
 * Mirrors the transcript's `characteristics` (U-03): a heuristic detector and
 * a language model are both "the machine" to a user, and the difference
 * matters enormously to how much weight the suggestion deserves. `model` names
 * what actually ran — never a friendly label.
 */
export interface Provenance {
  model: string;
  version: string;
  /**
   * What it was asked. Hashed, so the document stays auditable without
   * carrying prompt prose that would itself become a thing people edit.
   */
  promptHash: string;
  generatedAt: string;
}

/** A human said yes. Without this, nothing below reaches a render. [U-15] */
export interface Acceptance {
  acceptedBy: string;
  acceptedAt: string;
}

/**
 * Where a document element came from, when it did not come from a person.
 *
 * Absent on everything an author made themselves, which is the overwhelming
 * majority of a conversation and should stay that way.
 */
export interface AiOrigin extends Provenance, Acceptance {
  suggestionId: SuggestionId;
}

/**
 * The payloads a suggestion may carry.
 *
 * This union IS the forbidden list. Note what has no variant: recorded speech,
 * response narration, a rewritten quote, a verdict. Those are not omissions to
 * be filled in later.
 */
export type SuggestionPayload =
  | {
    kind: 'claim';
    /** Verbatim from the transcript. Never rewritten. [U-15 "may not alter a source quote"] */
    quote: string;
    quoteHash: string;
    startFrame: Frames;
    endFrame: Frames;
    /** Why this was surfaced, in words the author can judge. Never a score alone. */
    reasons: string[];
    score: number;
  }
  | {
    kind: 'evidence';
    /**
     * Retrieval-grounded, always. U-34: an assertion without a retrievable
     * source is not returned at all -- not with a caveat, not greyed out.
     */
    url: string;
    title: string;
    retrievedAt: string;
    excerpt: string;
    /** U-34 §2: contradicting evidence is mandatory and carries equal weight. */
    stance: 'supports' | 'contradicts';
  }
  | {
    kind: 'structure';
    /** A shape to consider, never words to say. [U-15] */
    outline: string[];
  };

export interface Suggestion {
  id: SuggestionId;
  provenance: Provenance;
  payload: SuggestionPayload;
}

/**
 * An author's decision about one suggestion.
 *
 * Stored on the Conversation because a decision is a fact about the work, not
 * something regenerable from the transcript. The suggestions themselves are
 * NOT stored: they are derived from the transcript and recomputed on demand,
 * because anything that can be regenerated and is stored anyway is a fork
 * waiting to happen (D-16, INV-00).
 */
export type SuggestionStatus = 'suggested' | 'accepted' | 'edited' | 'rejected';

export interface SuggestionDecision {
  /** Stable across re-detection: derived from content, not from a run. */
  suggestionKey: string;
  /**
   * `suggested` is never stored — it is the absence of a decision. Storing it
   * would make "the author has not looked at this yet" and "the author looked
   * and moved on" the same state, and they are not.
   */
  status: 'accepted' | 'edited' | 'rejected';
  /**
   * Present only when the author narrowed the span.
   *
   * Editing a claim means tightening it — the detector proposes a whole
   * VAD-segmented sentence and the author wants the clause that matters. It
   * does NOT mean rewriting it: the edited text is verified to still be
   * present in the source transcript, because a "quote" that the source never
   * said is not a quote, whoever typed it (INV-05, U-15).
   */
  editedQuote?: string;
  editedQuoteHash?: string;
  by: string;
  at: string;
  /** What suggested it, kept even after rejection so the record is complete. */
  provenance: Provenance;
}

/**
 * The identity of a suggestion, independent of when it was generated.
 *
 * Detection runs again every time the transcript is read, so a run-scoped id
 * would make yesterday's dismissal reappear as a new proposal today. Keying on
 * content means a dismissal stays dismissed, and a re-transcription that
 * changes the WORDS correctly produces a new suggestion (INV-05's logic,
 * applied to the knowledge layer).
 */
export function suggestionKey(payload: SuggestionPayload): string {
  switch (payload.kind) {
    case 'claim':
      return sha256(`claim:${normaliseQuote(payload.quote)}`);
    case 'evidence':
      return sha256(`evidence:${payload.url.trim().toLowerCase()}`);
    case 'structure':
      return sha256(`structure:${payload.outline.map(normaliseQuote).join('|')}`);
  }
}

export class BoundaryViolation extends Error {
  constructor(public readonly rule: string, message: string) {
    super(`[${rule}] ${message}`);
    this.name = 'BoundaryViolation';
  }
}

/**
 * INV-06 — Every AI-derived field has an accepted_by.  [D-09, U-15]
 *
 * The invariant already existed in the table and in the audit log's
 * `acceptedBy`; this is where it becomes checkable on the document itself.
 *
 * Asserted rather than trusted (D-09). The four fields U-15 requires are
 * checked for presence AND for being non-empty, because a provenance record
 * of empty strings is the shape this rule degrades into first.
 */
export function assertAcceptedOrigin(origin: AiOrigin | undefined, what: string): void {
  if (!origin) return; // Made by a person. The normal case.
  const missing = (['model', 'version', 'promptHash', 'acceptedBy', 'acceptedAt'] as const)
    .filter((field) => !String(origin[field] ?? '').trim());
  if (missing.length > 0) {
    throw new BoundaryViolation('INV-06',
      `${what} came from a suggestion but does not record ${missing.join(', ')} [U-15]`);
  }
}

/**
 * A claim suggestion may only ever carry text the source actually contains.
 *
 * This is "AI may not alter a source quote" made checkable: the payload's hash
 * must be the hash of its own text, and the caller compares that against the
 * transcript. A suggestion that paraphrases fails here rather than reaching a
 * quote card that misquotes someone. [U-15, INV-05]
 */
export function assertQuoteUnaltered(payload: SuggestionPayload): void {
  if (payload.kind !== 'claim') return;
  if (payload.quoteHash !== quoteHash(payload.quote)) {
    throw new BoundaryViolation('INV-06',
      'a claim suggestion does not match its own quote hash — it was altered [U-15]');
  }
}

/**
 * Research results that U-34 permits to exist.
 *
 * Filtering here rather than at the UI means an ungrounded result cannot be
 * shown by a future caller that forgets to filter. "Not returned at all" is a
 * stronger rule than "not displayed", and it is the one U-34 asks for.
 */
export function groundedOnly(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter((suggestion) => {
    if (suggestion.payload.kind !== 'evidence') return true;
    return Boolean(suggestion.payload.url?.trim() && suggestion.payload.retrievedAt?.trim());
  });
}
