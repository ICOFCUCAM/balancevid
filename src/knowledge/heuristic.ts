/**
 * The local claim detector.  [Doctrine §20 "claim extraction", U-15]
 *
 * Deterministic pattern matching over the source transcript. No model, no
 * network, no cloud dependency for the thing an author does first.
 *
 * It is worth being precise about what this is, because the doctrine's whole
 * posture is that nothing downstream pretends to a precision it does not have
 * (U-03). This does not understand the video. It finds the shapes a checkable
 * statement tends to take — a quantity, an absolute, a causal link, an appeal
 * to authority — and says which shape it found, so the author can judge the
 * suggestion instead of trusting it. A sentence with a number in it is not
 * necessarily a claim; it is, reliably, worth ten seconds of an author's
 * attention, and finding those ten-second candidates in a forty-minute video
 * is the actual work this replaces.
 *
 * It runs on unpunctuated upper-case output from the local transducer, so
 * nothing here may depend on sentence-ending punctuation or casing.
 */

import { newId, quoteHash, sha256 } from '../domain/ids.js';
import type { Suggestion, SuggestionPayload } from '../domain/suggestions.js';
import type { Transcript } from '../transcribe/types.js';
import { forDisplay } from '../transcribe/types.js';
import type { ClaimDetector, DetectOptions, DetectorCharacteristics } from './types.js';
import { provenanceOf } from './types.js';

/** Bumped whenever the rules below change, so provenance stays truthful. */
const VERSION = '1';

/**
 * The rule set, as data.
 *
 * Each rule carries the words an author reads. "Contains a statistic" is a
 * reason someone can agree or disagree with; a score of 0.82 is not.
 */
interface Rule {
  reason: string;
  weight: number;
  test: RegExp;
}

/**
 * Spoken numbers arrive as words, not digits.
 *
 * The local transducer emits "THIRTY PERCENT", never "30%". A figure rule that
 * only matches digits therefore misses most of the figures an author actually
 * wants to check — which is the detector's single strongest signal failing on
 * its most common input.
 */
const NUMBER_WORD = '(?:ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE'
  + '|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|THIRTY|FORTY'
  + '|FIFTY|SIXTY|SEVENTY|EIGHTY|NINETY|HUNDRED|THOUSAND|MILLION|BILLION|TRILLION)';
const SCALE_WORD = '(?:HUNDRED|THOUSAND|MILLION|BILLION|TRILLION)';

const RULES: Rule[] = [
  // A number is the single strongest signal that something is checkable.
  { reason: 'states a figure', weight: 3,
    test: new RegExp(`\\b(\\d+([.,]\\d+)?|${NUMBER_WORD}(\\s+(AND\\s+)?${NUMBER_WORD})*)`
      + '\\s*(%|PERCENT|PER\\s?CENT)\\b', 'i') },
  { reason: 'states a quantity', weight: 3,
    test: new RegExp(`\\b(\\d+([.,]\\d+)?|${NUMBER_WORD})\\s+${SCALE_WORD}\\b`, 'i') },
  // Digits only: "one" and "two" are too common in ordinary speech to count
  // as evidence of a claim on their own.
  { reason: 'gives a number', weight: 2, test: /\b\d+([.,]\d+)?\b/ },
  { reason: 'names a date', weight: 2,
    test: /\b(1[0-9]{3}|20[0-9]{2})\b|\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\b/i },
  // An absolute is checkable by a single counterexample, which is exactly the
  // kind of response this product is for.
  { reason: 'makes an absolute statement', weight: 2,
    test: /\b(NEVER|ALWAYS|ALL|NONE|NO ONE|NOBODY|EVERY|EVERYONE|EVERYBODY|ONLY|THE FIRST|THE LAST|THE ONLY|ENTIRELY|COMPLETELY|WITHOUT EXCEPTION)\b/i },
  { reason: 'makes a superlative claim', weight: 2,
    test: /\b(BEST|WORST|LARGEST|SMALLEST|GREATEST|MOST|LEAST|HIGHEST|LOWEST|FASTEST|SLOWEST)\b/i },
  // Causation is the most common thing a source asserts and never establishes.
  { reason: 'asserts a cause', weight: 3,
    test: /\b(BECAUSE|CAUSED|CAUSES|CAUSING|LED TO|LEADS TO|RESULTED IN|RESULTS IN|DUE TO|THEREFORE|CONSEQUENTLY|AS A RESULT|BROUGHT ABOUT)\b/i },
  { reason: 'claims a change', weight: 2,
    test: /\b(INCREASED|DECREASED|ROSE|FELL|GREW|SHRANK|DOUBLED|HALVED|TRIPLED|DROPPED|SURGED|PLUMMETED|REDUCED)\b/i },
  { reason: 'draws a comparison', weight: 1,
    test: /\b(MORE THAN|LESS THAN|FEWER THAN|TWICE|THREE TIMES|HALF AS|COMPARED (TO|WITH))\b/i },
  // An appeal to authority is checkable precisely because it names its source.
  { reason: 'appeals to a source', weight: 3,
    test: /\b(ACCORDING TO|STUDIES SHOW|RESEARCH SHOWS|SCIENTISTS|RESEARCHERS|EXPERTS|A STUDY|THE DATA SHOWS?|STATISTICS SHOW)\b/i },
];

/**
 * Shapes that make a sentence a poor candidate.
 *
 * Subtractive rather than disqualifying: a hedged sentence can still be worth
 * answering, it is just a weaker candidate than a flat assertion, and the
 * author is the one who decides.
 */
const PENALTIES: Rule[] = [
  { reason: 'is hedged', weight: -3,
    test: /\b(MAYBE|PERHAPS|MIGHT|MAY BE|COULD BE|POSSIBLY|PROBABLY|I THINK|I BELIEVE|I FEEL|IT SEEMS|SOMEWHAT|ARGUABLY|APPARENTLY)\b/i },
  { reason: 'is an opinion', weight: -3,
    test: /\b(I LIKE|I LOVE|I HATE|IN MY OPINION|I PREFER|MY FAVOURITE|MY FAVORITE|BEAUTIFUL|UGLY)\b/i },
  // Unpunctuated output means a question has to be recognised by its opening.
  { reason: 'is a question', weight: -4,
    test: /^\s*(WHAT|WHY|HOW|WHO|WHEN|WHERE|WHICH|IS|ARE|WAS|WERE|DO|DOES|DID|CAN|COULD|WOULD|SHOULD|HAVE|HAS)\b/i },
];

/** Below this, a sentence is not worth an author's attention. */
const THRESHOLD = 2;
/** Fewer words than this cannot carry a checkable claim. */
const MIN_WORDS = 5;
/**
 * Longer than this and it is a paragraph, not a quotable claim.
 *
 * The local segmenter already caps a sentence at 16 words, so this never fires
 * today. It is not dead: the detector takes any registered transcript, and an
 * engine with real punctuation emits sentences many times that length. A claim
 * card is a quote, not a paragraph.
 */
const MAX_WORDS = 60;

export const HEURISTIC_CHARACTERISTICS: DetectorCharacteristics = {
  semantic: false,
  deterministic: true,
  local: true,
  summary: 'Finds the shapes a checkable statement takes — figures, absolutes, '
    + 'causes, appeals to a source — and names which one it found. It does not '
    + 'understand the video, and it cannot tell you whether a claim is true.',
};

export class HeuristicClaimDetector implements ClaimDetector {
  readonly id = 'heuristic-claims';
  readonly label = 'Local claim finder';
  readonly version = VERSION;
  readonly characteristics = HEURISTIC_CHARACTERISTICS;

  /** No model to download and no key to configure: it is always available. */
  async available(): Promise<boolean> { return true; }

  async detect(transcript: Transcript, options: DetectOptions = {}): Promise<Suggestion[]> {
    return detectClaims(transcript, options);
  }
}

/**
 * Pure, and exported separately so it can be tested without the registry.
 *
 * The prompt hash stands in for "what it was asked": for a rule-based detector
 * the rules ARE the prompt, so hashing them means a provenance record
 * identifies the exact rule set that produced a suggestion — and a rule change
 * without a version bump becomes visible rather than silent.
 */
export function detectClaims(
  transcript: Transcript, options: DetectOptions = {},
): Suggestion[] {
  const generatedAt = options.generatedAt ?? transcript.createdAt;
  const limit = options.limit ?? 12;
  const detector = new HeuristicClaimDetector();
  const promptHash = rulesHash();

  const scored: { payload: SuggestionPayload; score: number }[] = [];

  for (const sentence of transcript.sentences) {
    const words = sentence.text.trim().split(/\s+/).filter(Boolean);
    if (words.length < MIN_WORDS || words.length > MAX_WORDS) continue;

    const reasons: string[] = [];
    let score = 0;
    for (const rule of [...RULES, ...PENALTIES]) {
      if (!rule.test.test(sentence.text)) continue;
      score += rule.weight;
      // Penalties are not shown as reasons TO look; they only lower the rank.
      if (rule.weight > 0) reasons.push(rule.reason);
    }
    if (score < THRESHOLD || reasons.length === 0) continue;

    // Verbatim. The author reads it as the source said it, and the hash binds
    // it to those exact words (INV-05, and U-15's "may not alter a quote").
    const quote = forDisplay(sentence.text, transcript.characteristics);
    scored.push({
      score,
      payload: {
        kind: 'claim',
        quote,
        quoteHash: quoteHash(quote),
        startFrame: sentence.startFrame,
        endFrame: sentence.endFrame,
        reasons,
        score,
      },
    });
  }

  // Strongest first; ties broken by position so the order is total and stable.
  scored.sort((a, b) => b.score - a.score
    || positionOf(a.payload) - positionOf(b.payload));

  return scored.slice(0, limit).map(({ payload }) => ({
    id: newId('sug'),
    provenance: provenanceOf(detector, promptHash, generatedAt),
    payload,
  }));
}

function positionOf(payload: SuggestionPayload): number {
  return payload.kind === 'claim' ? payload.startFrame : 0;
}

/** The rules are the prompt. Hash them, so a silent rule change is visible. */
export function rulesHash(): string {
  return sha256(JSON.stringify([...RULES, ...PENALTIES]
    .map((r) => [r.reason, r.weight, r.test.source])));
}
