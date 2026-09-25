/**
 * The publication bundle.  [Doctrine U-30, §39]
 *
 * "Every export produces a publication bundle alongside the video... The user
 *  finishes the render and has everything required to publish, already
 *  written."
 *
 * The document already holds every field this needs. Making the author retype
 * chapters, a description and an attribution block is needless friction at the
 * most fatiguing moment of the process — the end, when the work is done and
 * all that stands between them and publishing is admin.
 *
 * Pure: (conversation, transcripts, now) -> bundle. Same document, same bundle.
 */

import type { Conversation, Intervention } from '../domain/document.js';
import { acceptedInterventions, selectedTake, takeUsableFrames } from '../domain/document.js';
import { TYPE_PRESENTATION } from '../domain/presentation.js';
import { HOUSE_FPS, formatTimecode, type Frames } from '../domain/time.js';
import { projectTimeline, type Timeline } from '../domain/timeline.js';
import { forDisplay, type Transcript } from '../transcribe/types.js';
import { sentenceAtFrame } from '../transcribe/segmentation.js';

export const BUNDLE_VERSION = 1;

/**
 * Chapter rules that the platforms actually enforce.
 *
 * YouTube ignores a chapter list that does not start at zero, has fewer than
 * three entries, or contains anything shorter than ten seconds. A list that is
 * silently ignored is worse than none, so short chapters are merged rather
 * than emitted and hoped for.
 */
export const MIN_CHAPTER_FRAMES: Frames = 10 * HOUSE_FPS;
export const MIN_CHAPTERS = 3;

/** More than this and the author is choosing from a contact sheet, not picking. */
export const MAX_THUMBNAILS = 6;

export interface Chapter {
  startFrame: Frames;
  timecode: string;
  title: string;
  kind: 'source' | 'response';
}

export interface ThumbnailCandidate {
  id: string;
  kind: 'frame' | 'take' | 'quote';
  /** For a source frame: which frame of the source to grab. */
  sourceFrame?: Frames;
  /** For a take frame: which take, and which frame of it. */
  takeId?: string;
  takeFrame?: Frames;
  /** For a quote card: the claim to set. */
  text?: string;
  label: string;
}

/**
 * How far into a take to grab its thumbnail frame.
 *
 * Not the first kept frame: that is the instant the speaker starts moving, and
 * it is reliably the worst frame in the take — mid-blink, mouth half open. A
 * second in they are settled.
 */
export const TAKE_THUMBNAIL_OFFSET_FRAMES: Frames = HOUSE_FPS;

export interface PublicationBundle {
  version: number;
  conversationId: string;
  title: string;
  suggestedTitles: string[];
  description: string;
  chapters: Chapter[];
  /** Why there are no chapters, when there are none. */
  chaptersNote?: string;
  thumbnails: ThumbnailCandidate[];
  links: {
    article: string;
    captionsSrt: string;
    captionsVtt: string;
    manifest: string;
    watch: string;
  };
  totalOutputFrames: Frames;
  generatedAt: string;
}

export interface BundleInputs {
  conversation: Conversation;
  sourceTranscript?: Transcript | null;
  generatedAt: string;
  timeline?: Timeline;
  attribution: string;
}

export function buildBundle(inputs: BundleInputs): PublicationBundle {
  const { conversation, sourceTranscript, generatedAt, attribution } = inputs;
  const timeline = inputs.timeline ?? projectTimeline(conversation);
  const byId = new Map(acceptedInterventions(conversation).map((i) => [i.id, i]));

  const { chapters, note } = buildChapters(timeline, byId, conversation, sourceTranscript);
  const suggestedTitles = suggestTitles(conversation, sourceTranscript);
  const links = {
    article: `/c/${conversation.id}/article`,
    captionsSrt: `/api/conversations/${conversation.id}/representations?id=captions.srt`,
    captionsVtt: `/api/conversations/${conversation.id}/representations?id=captions.vtt`,
    manifest: `/api/conversations/${conversation.id}/representations?id=manifest.json`,
    watch: `/c/${conversation.id}/watch`,
  };

  return {
    version: BUNDLE_VERSION,
    conversationId: conversation.id,
    title: conversation.title,
    suggestedTitles,
    description: buildDescription(conversation, attribution, chapters, links),
    chapters,
    ...(note ? { chaptersNote: note } : {}),
    thumbnails: thumbnailCandidates(conversation, sourceTranscript),
    links,
    totalOutputFrames: timeline.totalOutputFrames,
    generatedAt,
  };
}

/**
 * Chapters on the OUTPUT clock.  [Doctrine §39, U-08]
 *
 * Section 39 wanted a claim and its response as neighbouring entries. That is
 * what a viewer scrubbing the bar is looking for: not "source" and "response"
 * but what was said and what was said back.
 */
function buildChapters(
  timeline: Timeline,
  byId: Map<string, Intervention>,
  conversation: Conversation,
  transcript?: Transcript | null,
): { chapters: Chapter[]; note?: string } {
  const merged = mergedChapters(timeline, byId, conversation, transcript);

  /*
   * THE VETO BELOW IS YOUTUBE'S, NOT THE CONVERSATION'S.
   *
   * A list the platform silently ignores is worse than none, so the bundle
   * emits nothing rather than something that will not appear. That is a fact
   * about a description box, and `mergedChapters` above it is the list itself
   * — which is why it is separate: an MP3's chapter list has no minimum and
   * no requirement to begin at zero, and borrowing this rule for it produced
   * an audio file with no chapters at all. [D-16]
   */
  if (merged.length === 0 || merged[0]!.startFrame !== 0) {
    return { chapters: [], note: 'chapters must start at 00:00, and this export does not' };
  }
  if (merged.length < MIN_CHAPTERS) {
    return {
      chapters: [],
      note: `platforms ignore a list of fewer than ${MIN_CHAPTERS} chapters, ` +
        'and merging the short ones left too few — a longer conversation will have them',
    };
  }
  return { chapters: merged };
}

/**
 * The same list, for anything that is not a description box.
 *
 * Takes a Conversation rather than a projected timeline, because that is what
 * every caller outside this file has.
 */
export function conversationChapters(
  conversation: Conversation,
  sourceTranscript?: Transcript | null,
  timeline?: Timeline,
): Chapter[] {
  return mergedChapters(
    timeline ?? projectTimeline(conversation),
    new Map(acceptedInterventions(conversation).map((i) => [i.id, i])),
    conversation,
    sourceTranscript,
  );
}

/**
 * The conversation's own chapter list, before any platform has an opinion.
 *
 * One entry per run of source and per response, with anything too short to be
 * usable merged into the one before it. This is what a player's chapter menu
 * gets and what the description box gets; only the description box then has
 * to satisfy YouTube.
 */
export function mergedChapters(
  timeline: Timeline,
  byId: Map<string, Intervention>,
  conversation: Conversation,
  transcript?: Transcript | null,
): Chapter[] {
  const raw: Chapter[] = [];

  for (const item of timeline.items) {
    if (item.kind === 'source') {
      raw.push({
        startFrame: item.outputStartFrame,
        timecode: formatTimecode(item.outputStartFrame),
        kind: 'source',
        title: raw.length === 0
          ? conversation.source.title
          : `${conversation.source.title}, continued`,
      });
      continue;
    }
    const intervention = byId.get(item.interventionId);
    if (!intervention) continue;
    const label = TYPE_PRESENTATION[intervention.type].lowerThird;
    const claim = claimFor(intervention, transcript);
    raw.push({
      startFrame: item.outputStartFrame,
      timecode: formatTimecode(item.outputStartFrame),
      kind: 'response',
      title: claim ? `${titleCase(label)}: ${truncate(claim, 70)}` : titleCase(label),
    });
  }

  // Merge anything too short to be accepted, keeping the entry that names the
  // more specific thing.
  const merged: Chapter[] = [];
  for (const chapter of raw) {
    const previous = merged.at(-1);
    if (previous && chapter.startFrame - previous.startFrame < MIN_CHAPTER_FRAMES) {
      if (chapter.kind === 'response' && previous.kind === 'source') {
        previous.title = chapter.title;
        previous.kind = 'response';
      }
      continue;
    }
    merged.push({ ...chapter });
  }
  return merged;
}

/**
 * Titles drawn from the claims.  [Doctrine U-30]
 *
 * Suggestions, in the author's own material — never generated prose. The
 * strongest thing a response has to offer is usually the sentence it is
 * answering (U-15: AI may suggest structure; it does not write for them).
 */
function suggestTitles(conversation: Conversation, transcript?: Transcript | null): string[] {
  const titles: string[] = [];
  const source = conversation.source.title;

  for (const intervention of acceptedInterventions(conversation)) {
    const claim = claimFor(intervention, transcript);
    if (!claim) continue;
    const label = TYPE_PRESENTATION[intervention.type].lowerThird.toLocaleLowerCase();
    titles.push(`"${truncate(claim, 80)}" — a ${label}`);
    if (titles.length >= 3) break;
  }

  titles.push(`My response to "${source}"`);
  titles.push(`${source}: what I would add`);
  return [...new Set(titles)].slice(0, 5);
}

function buildDescription(
  conversation: Conversation,
  attribution: string,
  chapters: Chapter[],
  links: PublicationBundle['links'],
): string {
  const lines: string[] = [];
  lines.push(conversation.title, '');
  // Generated, and not optional. [U-21, INV-07]
  lines.push(attribution, '');

  if (chapters.length > 0) {
    lines.push('Chapters');
    for (const chapter of chapters) {
      // Platforms read HH:MM:SS, not frames.
      lines.push(`${chapter.timecode.slice(0, 8)} ${chapter.title}`);
    }
    lines.push('');
  }

  lines.push('Read this conversation as a document:', links.article, '');
  lines.push('Captions are included with this video.');
  return lines.join('\n');
}

/**
 * Thumbnail candidates.  [Doctrine U-30]
 *
 * Frames the author already chose — the moments they stopped at — and the
 * claims they bound. Nothing invented: a thumbnail that promises something the
 * video does not contain is the thing this product exists to argue against.
 */
function thumbnailCandidates(
  conversation: Conversation, transcript?: Transcript | null,
): ThumbnailCandidate[] {
  const candidates: ThumbnailCandidate[] = [];
  for (const intervention of acceptedInterventions(conversation)) {
    candidates.push({
      id: `frame_${intervention.id}`,
      kind: 'frame',
      sourceFrame: intervention.anchor.tSourceFrame,
      label: `The moment at ${formatTimecode(intervention.anchor.tSourceFrame)}`,
    });

    // The responder's own face, from the take that will actually be published.
    const take = selectedTake(intervention);
    if (take && takeUsableFrames(take) > 0) {
      candidates.push({
        id: `take_${intervention.id}`,
        kind: 'take',
        takeId: take.id,
        takeFrame: Math.min(
          take.mediaInFrame + TAKE_THUMBNAIL_OFFSET_FRAMES, take.mediaOutFrame - 1),
        label: `Answering at ${formatTimecode(intervention.anchor.tSourceFrame)}`,
      });
    }

    const claim = claimFor(intervention, transcript);
    if (claim) {
      candidates.push({
        id: `quote_${intervention.id}`,
        kind: 'quote',
        text: truncate(claim, 120),
        label: 'The claim, as typography',
      });
    }
    if (candidates.length >= MAX_THUMBNAILS) break;
  }
  return candidates.slice(0, MAX_THUMBNAILS);
}

function claimFor(intervention: Intervention, transcript?: Transcript | null): string | undefined {
  if (intervention.anchor.quote) return intervention.anchor.quote;
  if (!transcript) return undefined;
  const sentence = sentenceAtFrame(
    transcript.sentences, Math.max(0, intervention.anchor.tSourceFrame - 1));
  return sentence ? forDisplay(sentence.text, transcript.characteristics) : undefined;
}

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

function titleCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLocaleLowerCase();
}
