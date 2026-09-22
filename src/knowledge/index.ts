/**
 * The knowledge layer.  [Doctrine §20, §21, U-15, INV-00]
 *
 * The chain this closes:
 *
 *   source transcript -> suggested claim -> the author accepts, edits or
 *   rejects it -> the bound response -> its evidence -> a deep link into the
 *   moment -> the Conversation Document
 *
 * Every arrow in that chain is a human decision except the first, and the
 * first produces nothing that anyone can publish.
 *
 * Note what is NOT stored: the suggestions. They are derived from the
 * transcript and recomputed on every read, because anything regenerable that
 * is stored anyway is a fork waiting to happen (INV-00, D-16). Only the
 * author's DECISIONS are document state — a decision is a fact about the work
 * and nothing can regenerate it.
 *
 * That has a consequence worth stating plainly, because it is the property the
 * whole boundary rests on: an unaccepted suggestion cannot leak into an
 * article, a bundle, a manifest or a render, not because every writer
 * remembers to filter it out, but because it was never in the document to
 * filter.
 */

import type { Conversation } from '../domain/document.js';
import type {
  Suggestion, SuggestionDecision, SuggestionStatus,
} from '../domain/suggestions.js';
import { suggestionKey } from '../domain/suggestions.js';
import type { Transcript } from '../transcribe/types.js';
import { HeuristicClaimDetector } from './heuristic.js';
import type { ClaimDetector, DetectOptions } from './types.js';

export * from './types.js';
export { detectClaims, rulesHash, HEURISTIC_CHARACTERISTICS } from './heuristic.js';

const REGISTRY: ClaimDetector[] = [new HeuristicClaimDetector()];

export function register(detector: ClaimDetector): void {
  REGISTRY.unshift(detector);
}

export function all(): readonly ClaimDetector[] {
  return REGISTRY;
}

/**
 * The first detector that can actually run.
 *
 * Returns null rather than throwing, exactly as the transcriber registry does:
 * a conversation with no suggestions is a normal conversation, and the core
 * loop never depended on them.
 */
export async function resolveDetector(preferredId?: string): Promise<ClaimDetector | null> {
  const ordered = preferredId
    ? [...REGISTRY].sort((a, b) => (a.id === preferredId ? -1 : b.id === preferredId ? 1 : 0))
    : REGISTRY;
  for (const detector of ordered) {
    if (await detector.available()) return detector;
  }
  return null;
}

/** A suggestion together with what the author has done about it. */
export interface ReviewedClaim {
  suggestion: Suggestion;
  key: string;
  status: SuggestionStatus;
  decision?: SuggestionDecision;
  /**
   * What would be bound if this were accepted as it stands: the author's
   * narrowed text where they edited, the source's words otherwise. Kept
   * separate from `suggestion` so the three voices stay distinguishable —
   * what the source said, what the machine proposed, what the author chose.
   */
  effectiveQuote: string;
}

/**
 * Join detected suggestions with the decisions already recorded.
 *
 * A rejected claim keeps its place in the list rather than vanishing: an
 * author who dismissed something by accident needs to find it again, and a
 * list that silently shrinks is one nobody trusts.
 */
export function reviewClaims(
  suggestions: Suggestion[], decisions: SuggestionDecision[] = [],
): ReviewedClaim[] {
  const byKey = new Map(decisions.map((d) => [d.suggestionKey, d]));
  return suggestions.map((suggestion) => {
    const key = suggestionKey(suggestion.payload);
    const decision = byKey.get(key);
    const proposed = suggestion.payload.kind === 'claim' ? suggestion.payload.quote : '';
    return {
      suggestion,
      key,
      status: decision?.status ?? 'suggested',
      ...(decision ? { decision } : {}),
      effectiveQuote: decision?.editedQuote ?? proposed,
    };
  });
}

/**
 * Suggestions for a conversation, with the author's decisions applied.
 *
 * Class B is not an omission. Nothing is ever downloaded from an embedded
 * provider (U-35 §6), so there is no media to transcribe, so there is no
 * transcript for a detector to read. The knowledge layer is honestly
 * unavailable there rather than quietly empty, and the caller is told which.
 */
export async function claimsFor(
  conversation: Conversation,
  transcript: Transcript | null,
  options: DetectOptions & { detectorId?: string } = {},
): Promise<{
  claims: ReviewedClaim[];
  detector: ClaimDetector | null;
  unavailable?: string;
}> {
  if (conversation.source.class === 'B') {
    return {
      claims: [],
      detector: null,
      unavailable: 'an embedded source is never downloaded, so it has no transcript '
        + 'to read claims from [U-01, U-35 §6]',
    };
  }
  if (!transcript) {
    return { claims: [], detector: null, unavailable: 'this source has not been transcribed yet' };
  }
  const detector = await resolveDetector(options.detectorId);
  if (!detector) return { claims: [], detector: null, unavailable: 'no claim detector is available' };

  const suggestions = await detector.detect(transcript, options);
  return { claims: reviewClaims(suggestions, conversation.claimDecisions ?? []), detector };
}
