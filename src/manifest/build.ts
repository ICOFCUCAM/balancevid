/**
 * The Conversation Manifest.  [Doctrine U-01, D-08]
 *
 * The Class B export: a description of the conversation that a companion
 * player can drive. It plays the provider's own embed up to each interruption,
 * pauses it, plays the response, and resumes the provider at exactly the frame
 * it stopped on.
 *
 * "The product's answer to rights concerns is not minimal compliance — it is
 *  an architecture that makes responding beneficial to the person being
 *  responded to." (D-08) The viewer watches the original on the original's
 *  player: their views, their analytics, their revenue.
 *
 * It is not a Class B special case. A Class A conversation has a manifest too,
 * driving our own player instead of a provider's — which is why the companion
 * experience can be built and tested without depending on a third party.
 */

import type { Conversation } from '../domain/document.js';
import { orderedInterventions, selectedTake } from '../domain/document.js';
import { TYPE_PRESENTATION } from '../domain/presentation.js';
import type { ProviderId } from '../domain/providers.js';
import { HOUSE_FPS, formatTimecode, type Frames } from '../domain/time.js';
import { projectTimeline, type Timeline } from '../domain/timeline.js';
import type { Cue } from '../render/subtitles.js';
import { buildCues } from '../render/cues.js';
import type { Transcript } from '../transcribe/types.js';

export const MANIFEST_VERSION = 1;

export interface ManifestSourceSegment {
  kind: 'source';
  sourceInFrame: Frames;
  sourceOutFrame: Frames;
  durationFrames: Frames;
  /** For a human reading the manifest, and for chapter markers. */
  fromTimecode: string;
  toTimecode: string;
}

export interface ManifestResponseSegment {
  kind: 'response';
  interventionId: string;
  type: string;
  typeLabel: string;
  /** The statement being answered, where one is bound. [U-10] */
  claim?: string;
  /** Same-origin URL for the response media. */
  mediaUrl: string;
  mediaInFrame: Frames;
  mediaOutFrame: Frames;
  durationFrames: Frames;
  /** The frame of the source this interrupts — and resumes at. [U-07] */
  anchorFrame: Frames;
}

export type ManifestSegment = ManifestSourceSegment | ManifestResponseSegment;

export interface ConversationManifest {
  version: number;
  conversationId: string;
  title: string;
  /** Generated, non-removable, exactly as in every other export. [U-21] */
  attribution: string;
  fps: number;
  source: {
    class: 'A' | 'B';
    title: string;
    creator?: string;
    durationFrames: Frames;
    /** Class B: the provider's own player. */
    provider?: ProviderId;
    videoId?: string;
    embedUrl?: string;
    /** Where a viewer should go to watch the original on the provider. */
    canonicalUrl?: string;
    /** Class A: our own playback URL. */
    playbackUrl?: string;
  };
  segments: ManifestSegment[];
  captions: Cue[];
  totalOutputFrames: Frames;
  generatedAt: string;
}

export interface ManifestInputs {
  conversation: Conversation;
  sourceTranscript?: Transcript | null;
  takeTranscripts?: Map<string, Transcript>;
  generatedAt: string;
  timeline?: Timeline;
}

export function buildManifest(inputs: ManifestInputs): ConversationManifest {
  const { conversation, generatedAt } = inputs;
  const timeline = inputs.timeline ?? projectTimeline(conversation);
  const byId = new Map(orderedInterventions(conversation).map((i) => [i.id, i]));

  const segments: ManifestSegment[] = timeline.items.map((item): ManifestSegment => {
    if (item.kind === 'source') {
      return {
        kind: 'source',
        sourceInFrame: item.sourceInFrame,
        sourceOutFrame: item.sourceOutFrame,
        durationFrames: item.durationFrames,
        fromTimecode: formatTimecode(item.sourceInFrame),
        toTimecode: formatTimecode(item.sourceOutFrame),
      };
    }
    const intervention = byId.get(item.interventionId);
    const take = intervention ? selectedTake(intervention) : null;
    return {
      kind: 'response',
      interventionId: item.interventionId,
      type: intervention?.type ?? 'explain',
      typeLabel: intervention ? TYPE_PRESENTATION[intervention.type].lowerThird : 'RESPONSE',
      ...(intervention?.anchor.quote ? { claim: intervention.anchor.quote } : {}),
      mediaUrl: `/api/conversations/${conversation.id}/takes/${item.takeId}/media`,
      mediaInFrame: item.mediaInFrame,
      mediaOutFrame: item.mediaOutFrame,
      durationFrames: item.durationFrames,
      anchorFrame: item.anchorFrame,
      ...(take ? {} : {}),
    };
  });

  const { source } = conversation;
  return {
    version: MANIFEST_VERSION,
    conversationId: conversation.id,
    title: conversation.title,
    attribution: attributionLine(conversation),
    fps: HOUSE_FPS,
    source: {
      class: source.class,
      title: source.title,
      ...(source.creator ? { creator: source.creator } : {}),
      durationFrames: source.durationFrames,
      ...(source.provider ? { provider: source.provider } : {}),
      ...(source.providerVideoId ? { videoId: source.providerVideoId } : {}),
      ...(source.embedUrl ? { embedUrl: source.embedUrl } : {}),
      ...(source.url ? { canonicalUrl: source.url } : {}),
      ...(source.class === 'A'
        ? { playbackUrl: `/api/conversations/${conversation.id}/source` }
        : {}),
    },
    segments,
    captions: buildCues(conversation, timeline, {
      source: inputs.sourceTranscript ?? null,
      ...(inputs.takeTranscripts ? { takes: inputs.takeTranscripts } : {}),
    }),
    totalOutputFrames: timeline.totalOutputFrames,
    generatedAt,
  };
}

function attributionLine(conversation: Conversation): string {
  const { title, creator, url } = conversation.source;
  const parts = [`Source: "${title}"`];
  if (creator) parts.push(`by ${creator}`);
  if (url) parts.push(url);
  parts.push(`Accessed ${conversation.createdAt.slice(0, 10)}`);
  return parts.join(' · ');
}
