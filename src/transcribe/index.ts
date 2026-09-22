/**
 * The transcriber registry.  [Doctrine D-14 "no engine lock-in"]
 *
 * Callers ask for "a transcriber", not for a named engine. Adding a cloud
 * engine is registering it here; nothing that consumes a transcript changes.
 */

import { SherpaTranscriber } from './sherpa.js';
import type { Transcriber } from './types.js';

export * from './types.js';
export * from './segmentation.js';

const REGISTRY: Transcriber[] = [new SherpaTranscriber()];

export function register(transcriber: Transcriber): void {
  REGISTRY.unshift(transcriber);
}

export function all(): readonly Transcriber[] {
  return REGISTRY;
}

/**
 * The first engine that can actually run.
 *
 * Returns null rather than throwing: a source with no transcript is a
 * degraded conversation, not a broken one. Everything that depends on the
 * transcript is additive, and the core loop -- watch, interrupt, respond,
 * resume, render -- works without one.
 */
export async function resolveTranscriber(preferredId?: string): Promise<Transcriber | null> {
  const ordered = preferredId
    ? [...REGISTRY].sort((a, b) => (a.id === preferredId ? -1 : b.id === preferredId ? 1 : 0))
    : REGISTRY;
  for (const transcriber of ordered) {
    if (await transcriber.available()) return transcriber;
  }
  return null;
}
