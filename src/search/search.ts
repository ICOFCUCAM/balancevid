/**
 * Searching one conversation.  [Doctrine §43, §16, INV-00, D-05]
 *
 * Pure, and derived: no index is stored. The doctrine lists search indices
 * among the representations (D-16), which means the Conversation and its
 * transcripts are the truth and this is recomputed from them. A stored index
 * is a second place for the answer to live, and the second place is always
 * the one that goes stale.
 *
 * Budget: results in under 200 ms (D-05). A forty-minute transcript is a few
 * thousand sentences, so a linear pass is comfortably inside it and needs no
 * structure that could disagree with the document.
 */

import {
  orderedInterventions, selectedTake, type Conversation, type Intervention,
} from '../domain/document.js';
import { formatTimecode, type Frames } from '../domain/time.js';
import { forDisplay, type Transcript } from '../transcribe/types.js';
import { matchLine, parseQuery } from './query.js';
import type { ConversationHits, HitKind, SearchHit } from './types.js';

/**
 * What each kind of hit is worth.
 *
 * A claim the author deliberately bound is a stronger answer to "where did we
 * talk about this" than a passing mention in the source's narration — they
 * chose it. Their own words come next, then their notes, then the source.
 */
const KIND_WEIGHT: Record<HitKind, number> = {
  claim: 5,
  response: 4,
  note: 3,
  evidence: 3,
  source: 2,
};

export interface SearchInputs {
  conversation: Conversation;
  sourceTranscript?: Transcript | null;
  takeTranscripts?: Map<string, Transcript>;
  limit?: number;
  /** False when a stranger is reading something published. */
  owned?: boolean;
}

export function searchConversation(query: string, inputs: SearchInputs): ConversationHits {
  const { conversation, sourceTranscript, takeTranscripts } = inputs;
  const parsed = parseQuery(query);
  const limit = inputs.limit ?? 50;
  const owned = inputs.owned ?? true;

  const hits: SearchHit[] = [];
  if (parsed.empty) {
    return {
      conversationId: conversation.id, title: conversation.title,
      sourceTitle: conversation.source.title, owned, hits, total: 0,
    };
  }

  const add = (
    kind: HitKind, text: string, tSourceFrame: Frames,
    extra: { interventionId?: string; evidenceId?: string } = {},
  ) => {
    const match = matchLine(text, parsed);
    if (!match) return;
    hits.push({
      kind,
      text,
      highlights: match.highlights,
      tSourceFrame,
      timecode: formatTimecode(tSourceFrame),
      ...extra,
      // Complete matches — every term present — rank above partial ones, and
      // an exact-cased hit above one that only matched after folding.
      score: KIND_WEIGHT[kind] * (match.complete ? 2 : 1) + match.exact * 0.5,
    });
  };

  // What the source said. The reason §43 exists: "every time the speaker
  // mentions Norway", with a frame for each.
  if (sourceTranscript) {
    for (const sentence of sourceTranscript.sentences) {
      add('source', forDisplay(sentence.text, sourceTranscript.characteristics),
        sentence.startFrame);
    }
  }

  for (const intervention of orderedInterventions(conversation)) {
    const at = intervention.anchor.tSourceFrame;

    if (intervention.anchor.quote) {
      add('claim', intervention.anchor.quote, at, { interventionId: intervention.id });
    }
    if (intervention.note) {
      add('note', intervention.note, at, { interventionId: intervention.id });
    }
    for (const evidence of intervention.evidence ?? []) {
      add('evidence', evidence.title, at,
        { interventionId: intervention.id, evidenceId: evidence.id });
      if (evidence.locator.quote) {
        add('evidence', evidence.locator.quote, at,
          { interventionId: intervention.id, evidenceId: evidence.id });
      }
    }

    // What the author themselves said, from the take that will be published.
    const transcript = takeTranscriptFor(intervention, takeTranscripts);
    if (transcript) {
      for (const sentence of transcript.sentences) {
        add('response', forDisplay(sentence.text, transcript.characteristics), at,
          { interventionId: intervention.id });
      }
    }
  }

  // Strongest first; ties broken by position so the order is total and the
  // same query twice gives the same list.
  hits.sort((a, b) => b.score - a.score || a.tSourceFrame - b.tSourceFrame);

  return {
    conversationId: conversation.id,
    title: conversation.title,
    sourceTitle: conversation.source.title,
    owned,
    hits: hits.slice(0, limit),
    total: hits.length,
  };
}

function takeTranscriptFor(
  intervention: Intervention, takes?: Map<string, Transcript>,
): Transcript | undefined {
  if (!takes) return undefined;
  const take = selectedTake(intervention);
  return take ? takes.get(take.id) : undefined;
}
