/**
 * Article generation.  [Doctrine U-14, D-16]
 *
 * Pure: (conversation, transcripts, now) -> Article. No I/O, no clock, no
 * randomness, so the same Conversation always yields the same article and the
 * rebuild test in D-16 can assert it.
 *
 * A deliberate limit: the article quotes the statement being answered and
 * prints the author's own words in full. It does NOT reproduce the source's
 * transcript. That is both the legally defensible shape (U-35: proportionate,
 * transformative, attributed) and the better read -- a document of an argument,
 * not a copy of someone else's video with remarks attached.
 */

import type { Conversation, Take } from '../domain/document.js';
import { orderedInterventions, selectedTake } from '../domain/document.js';
import { TYPE_PRESENTATION } from '../domain/presentation.js';
import { formatTimecode, type Frames } from '../domain/time.js';
import { chainAttribution } from '../domain/publish.js';
import { projectTimeline, sourceRatio, type Timeline } from '../domain/timeline.js';
import { forDisplay, type Transcript } from '../transcribe/types.js';
import { sentenceAtFrame } from '../transcribe/segmentation.js';
import {
  ARTICLE_VERSION, type Article, type ArticleCitation, type ArticleExchange,
  type ArticleProvenance,
} from './types.js';

export interface ArticleInputs {
  conversation: Conversation;
  sourceTranscript?: Transcript | null;
  transcriptVersion?: number;
  takeTranscripts?: Map<string, Transcript>;
  /** Injected, not read from the clock. */
  generatedAt: string;
  timeline?: Timeline;
}

export function generateArticle(inputs: ArticleInputs): Article {
  const { conversation, sourceTranscript, takeTranscripts, generatedAt } = inputs;
  const timeline = inputs.timeline ?? projectTimeline(conversation);

  const outputStarts = new Map<string, Frames>();
  for (const item of timeline.items) {
    if (item.kind === 'response') outputStarts.set(item.interventionId, item.outputStartFrame);
  }

  const exchanges: ArticleExchange[] = orderedInterventions(conversation).map((ivn, index) => {
    const take = selectedTake(ivn);
    const presentation = TYPE_PRESENTATION[ivn.type];
    const outputStartFrame = outputStarts.get(ivn.id);

    const exchange: ArticleExchange = {
      index: index + 1,
      interventionId: ivn.id,
      type: ivn.type,
      typeLabel: presentation.lowerThird,
      tSourceFrame: ivn.anchor.tSourceFrame,
      timecode: formatTimecode(ivn.anchor.tSourceFrame),
      response: {
        text: take ? responseText(take, takeTranscripts?.get(take.id)) : null,
        durationFrames: take ? take.mediaOutFrame - take.mediaInFrame : 0,
        takeId: take?.id ?? null,
      },
      ...(outputStartFrame !== undefined
        ? { outputStartFrame, outputTimecode: formatTimecode(outputStartFrame) }
        : {}),
      ...(() => {
        const citations = (ivn.evidence ?? []).map((evidence): ArticleCitation => ({
          title: evidence.title,
          ...(evidence.url ? { url: evidence.url } : {}),
          retrievedAt: evidence.retrievedAt,
          ...(evidence.contentHash ? { contentHash: evidence.contentHash } : {}),
          ...(evidence.locator.quote ? { quote: evidence.locator.quote } : {}),
          ...(evidence.locator.page !== undefined ? { page: evidence.locator.page } : {}),
          archived: evidence.archived,
        }));
        return citations.length > 0 ? { citations } : {};
      })(),
    };

    if (ivn.anchor.quote) {
      exchange.claim = {
        text: ivn.anchor.quote,
        ...(ivn.anchor.quoteHash ? { hash: ivn.anchor.quoteHash } : {}),
        tSourceFrame: ivn.anchor.tSourceFrame,
        timecode: formatTimecode(ivn.anchor.tSourceFrame),
      };
    } else if (sourceTranscript) {
      // No claim was bound, so give the reader the one sentence the author was
      // answering -- enough to follow the argument, not a reproduction.
      const sentence = sentenceAtFrame(sourceTranscript.sentences, ivn.anchor.tSourceFrame);
      if (sentence) exchange.context = forDisplay(sentence.text, sourceTranscript.characteristics);
    }

    return exchange;
  });

  const responseWords = exchanges.reduce(
    (n, e) => n + (e.response.text ? e.response.text.split(/\s+/).filter(Boolean).length : 0), 0);

  return {
    version: ARTICLE_VERSION,
    conversationId: conversation.id,
    title: conversation.title,
    source: {
      title: conversation.source.title,
      ...(conversation.source.creator ? { creator: conversation.source.creator } : {}),
      ...(conversation.source.url ? { url: conversation.source.url } : {}),
      accessedAt: conversation.createdAt,
      durationFrames: conversation.source.durationFrames,
    },
    attribution: attributionLine(conversation),
    stats: {
      exchanges: exchanges.length,
      sourceRatio: Number(sourceRatio(timeline).toFixed(4)),
      totalOutputFrames: timeline.totalOutputFrames,
      responseWords,
    },
    exchanges,
    provenance: provenanceOf(sourceTranscript, inputs.transcriptVersion),
    generatedAt,
  };
}

/**
 * The author's own words, trimmed to what they kept.
 *
 * Pre-roll and anything trimmed away are excluded: the article reports what
 * the author chose to say, not everything the microphone heard. [U-04, U-06]
 */
function responseText(take: Take, transcript?: Transcript): string | null {
  if (!transcript) return null;
  const kept = transcript.sentences.filter(
    (s) => s.endFrame > take.mediaInFrame && s.startFrame < take.mediaOutFrame);
  const text = kept
    .map((s) => forDisplay(s.text, transcript.characteristics))
    .join(' ')
    .trim();
  return text || null;
}

function attributionLine(conversation: Conversation): string {
  if (conversation.lineage) return chainAttribution(conversation, conversation.createdAt);
  const { title, creator, url } = conversation.source;
  const parts = [`Source: "${title}"`];
  if (creator) parts.push(`by ${creator}`);
  if (url) parts.push(url);
  parts.push(`Accessed ${conversation.createdAt.slice(0, 10)}`);
  return parts.join(' · ');
}

function provenanceOf(
  transcript: Transcript | null | undefined, version?: number,
): ArticleProvenance {
  const notes: string[] = [
    'Every word of every response was spoken by the author. No response text was generated.',
  ];
  if (!transcript) {
    notes.push('No transcript was available, so responses are listed without their text.');
    return { notes };
  }
  if (!transcript.characteristics.punctuation) {
    notes.push(
      'The transcription engine emits no punctuation; sentence boundaries were inferred from pauses in speech.',
    );
  }
  if (!transcript.characteristics.speakerLabels) {
    notes.push('The engine does not separate speakers; the source is treated as one voice.');
  }
  return {
    transcriptionEngine: transcript.engine,
    transcriptionModel: transcript.model,
    ...(version ? { transcriptVersion: version } : {}),
    notes,
  };
}
