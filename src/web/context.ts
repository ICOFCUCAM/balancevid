/**
 * Loading a representation context.  [Doctrine D-16]
 *
 * Gathers exactly what the registry's generators declare they read: the
 * Conversation, and the transcripts that belong to its knowledge layer.
 * Nothing here touches ffmpeg, so the web tier keeps its inability to render
 * (U-23).
 */

import type { RepresentationContext } from '../representations/registry.js';
import { loadConversation } from '../store/repository.js';
import { loadAllTakeTranscripts, loadTranscript } from '../store/transcripts.js';

export async function loadRepresentationContext(
  conversationId: string, generatedAt = new Date().toISOString(),
): Promise<RepresentationContext> {
  const conversation = await loadConversation(conversationId);
  const source = await loadTranscript(conversationId);
  const takeTranscripts = await loadAllTakeTranscripts(conversationId);
  return {
    conversation,
    sourceTranscript: source?.transcript ?? null,
    ...(source ? { transcriptVersion: source.version } : {}),
    takeTranscripts,
    generatedAt,
  };
}
