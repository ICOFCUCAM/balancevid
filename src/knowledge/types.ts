/**
 * The claim detector interface.  [Doctrine §20, U-15, D-14 "no engine lock-in"]
 *
 * Callers ask for "a detector", never for a named engine — the same shape the
 * transcriber registry uses, and for the same reason. A cloud model can be
 * registered here later without anything that consumes a claim changing, and
 * more importantly without the ACCEPTANCE machinery changing: whatever
 * produces a suggestion, it enters the document by exactly one path, and a
 * human stands at it.
 *
 * Detectors are pure functions of a transcript. They do not read the
 * Conversation, cannot see the author's decisions, and cannot write anything.
 * That is deliberate: a detector that could see what was accepted could learn
 * to propose what it expects to be accepted, which is how a suggestion engine
 * turns into an echo chamber.
 */

import type { Provenance, Suggestion } from '../domain/suggestions.js';
import type { Transcript } from '../transcribe/types.js';

export interface DetectOptions {
  /** Most callers want the strongest handful, not everything. */
  limit?: number;
  /** Injected so a detector's output is reproducible from its inputs. [U-16] */
  generatedAt?: string;
}

/**
 * What a detector can and cannot do, recorded rather than assumed.
 *
 * Mirrors the transcript's `EngineCharacteristics` (U-03). A keyword detector
 * and a language model are both "the machine" to an author, and the
 * difference decides how much weight a suggestion deserves. Shown in the UI,
 * not buried: nothing downstream may pretend to a precision the engine does
 * not have.
 */
export interface DetectorCharacteristics {
  /** True for a language model; false for pattern matching. */
  semantic: boolean;
  /** Whether the same transcript always yields the same suggestions. */
  deterministic: boolean;
  /** Whether running it sends the source's words off this machine. */
  local: boolean;
  /** Plain words for the author, shown next to the suggestions. */
  summary: string;
}

export interface ClaimDetector {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly characteristics: DetectorCharacteristics;
  /** Whether this engine can run right now (model present, key configured). */
  available(): Promise<boolean>;
  detect(transcript: Transcript, options?: DetectOptions): Promise<Suggestion[]>;
}

/** The provenance stamp a detector puts on everything it produces. [U-15] */
export function provenanceOf(
  detector: ClaimDetector, promptHash: string, generatedAt: string,
): Provenance {
  return { model: detector.id, version: detector.version, promptHash, generatedAt };
}
