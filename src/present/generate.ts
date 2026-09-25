/**
 * The conversation, performed live.  [Doctrine D-16, INV-00, U-08, U-31]
 *
 * WHAT THIS IS. Every other representation is the conversation ALREADY
 * PERFORMED — a video, an article, a set of clips, an audio file. This is the
 * conversation as a score: the source plays, it stops at the exact frames the
 * author interrupted, and a person in a room says the response out loud
 * instead of the recording saying it. Then the source resumes.
 *
 * The lecturer, the seminar, the sermon, the newsroom explainer. The same
 * record, performed again, by the person whose argument it is.
 *
 * WHY IT IS A REPRESENTATION AND NOT A NEW MODE OF THE EDITOR. Nothing here is
 * authored. Every stop is an anchor the author already placed; every prompt is
 * a claim they already bound or a response they already recorded; every
 * document is evidence they already attached. A presenter cannot change the
 * conversation from here, and the conversation does not know it is being
 * presented. [INV-00]
 *
 * AND THE STOPS ARE EXACT. A stop is `tSourceFrame`, converted to seconds
 * once, here — the same frame the renderer cuts at. A presentation that
 * paused half a second late would be pausing after the sentence it is about
 * to argue with, which is the one thing this must not do. [U-08, INV-02]
 */

import {
  type Conversation, type Intervention, acceptedInterventions, selectedTake,
  takeUsableFrames,
} from '../domain/document.js';
import { TYPE_PRESENTATION } from '../domain/presentation.js';
import { formatTimecode, HOUSE_FPS, type Frames } from '../domain/time.js';
import { forDisplay, type Transcript } from '../transcribe/types.js';
import { sentenceAtFrame } from '../transcribe/segmentation.js';
import { buildAttribution } from '../domain/plan.js';

export const PRESENTATION_VERSION = 1;

export interface PresentationEvidence {
  title: string;
  url?: string;
  page?: number;
  quote?: string;
  retrievedAt: string;
  archived: boolean;
}

export interface PresentationStop {
  /** 1-based, and what the presenter counts in: "stop 3 of 7". */
  index: number;
  interventionId: string;
  /** The exact frame the author interrupted. The canonical number. [U-08] */
  atFrame: Frames;
  /**
   * The frame's own boundary, in seconds. What "have we reached it" is asked
   * against while the source is running forward.
   */
  atSeconds: number;
  /**
   * Where to SEEK to hold that frame — the middle of it, not its edge.
   *
   * A frame boundary is a knife edge: `atFrame / fps` at 30fps is
   * 4.333333…, and any rounding downwards lands the seek in the frame
   * BEFORE the one the author interrupted. Rounding to milliseconds, which
   * looked harmless at a thirtieth of a second, does exactly that for two
   * frames in three.
   *
   * Seeking to the midpoint is unambiguous at any precision the player has:
   * it is inside frame N by half a frame in both directions. The two numbers
   * are separate because they answer different questions, and computing
   * either one in a script would be doing frame arithmetic where nobody can
   * test it. [U-08, INV-02]
   */
  holdSeconds: number;
  timecode: string;
  /** The move, in the product's own language: CRITIQUE, CORRECTION… [U-11] */
  label: string;
  /**
   * What was just said, and whether it is a quotation.
   *
   * Bound means hash-backed (INV-05), and the stage may show it in quotation
   * marks. Unbound means the sentence the source was on, which is context for
   * the presenter and is never put in quotation marks on a screen a room is
   * reading.
   */
  claim?: { text: string; quoted: boolean };
  /**
   * What the author said when they recorded this, as a PROMPT.
   *
   * Not a script to read out. It is the author's own words off a machine
   * transcript, shown to remind a person of the argument they already made —
   * which is what a presenter's notes are for. Absent when the response was
   * never transcribed, and then the stop still exists, because the stop is
   * the anchor and not the note. [INV-06]
   */
  prompt?: string;
  /** How long they took last time. A presenter budgeting a lecture wants it. */
  recordedSeconds?: number;
  /**
   * The recorded response, playable.
   *
   * A presenter may want to play it rather than say it again — a guest they
   * cannot bring to the room, a take they are happy with, a demonstration of
   * the thing being described. Absent when nothing was recorded.
   */
  takeSrc?: string;
  /** Documents to put on the screen at this stop. [U-33] */
  evidence: PresentationEvidence[];
  /** Marks the author put on this frame. Said, so the presenter can point. */
  marks: number;
}

export interface Presentation {
  version: number;
  conversationId: string;
  title: string;
  attribution: string;
  source: {
    title: string;
    creator?: string;
    /** The proxy, which is what the editor scrubs and what seeks quickly. */
    src?: string;
    durationFrames: Frames;
    durationSeconds: number;
  };
  stops: PresentationStop[];
  /** Everything the presenter needs to plan: the sum of what they will say. */
  budget: { stops: number; recordedSeconds: number; sourceSeconds: number };
  generatedAt: string;
}

export interface PresentationInputs {
  conversation: Conversation;
  sourceTranscript?: Transcript | null;
  takeTranscripts?: Map<string, Transcript>;
  /** Injected, never read from the clock, so this is reproducible. [U-16 §2] */
  generatedAt: string;
}

export function generatePresentation(inputs: PresentationInputs): Presentation {
  const { conversation, sourceTranscript, takeTranscripts } = inputs;
  const source = conversation.source;

  /*
   * EVERY intervention is a stop, recorded or not.
   *
   * A presenter who has marked a moment and not yet recorded an answer still
   * means to stop there — that is the whole point of presenting rather than
   * playing a file. Dropping unrecorded ones would silently shorten the
   * lecture, and the one place this must agree with the author is where the
   * source stops.
   */
  const stops = acceptedInterventions(conversation).map((intervention, position) =>
    stopFor(intervention, position + 1, sourceTranscript, takeTranscripts, conversation.id));

  const recordedSeconds = stops.reduce(
    (sum, stop) => sum + (stop.recordedSeconds ?? 0), 0);

  return {
    version: PRESENTATION_VERSION,
    conversationId: conversation.id,
    title: conversation.title,
    attribution: buildAttribution(conversation, inputs.generatedAt).text,
    source: {
      title: source.title,
      ...(source.creator ? { creator: source.creator } : {}),
      ...(source.mezzanineAssetId
        ? { src: `/api/conversations/${conversation.id}/source` } : {}),
      durationFrames: source.durationFrames,
      durationSeconds: round(source.durationFrames / HOUSE_FPS),
    },
    stops,
    budget: {
      stops: stops.length,
      recordedSeconds: Math.round(recordedSeconds),
      sourceSeconds: Math.round(source.durationFrames / HOUSE_FPS),
    },
    generatedAt: inputs.generatedAt,
  };
}

function stopFor(
  intervention: Intervention,
  index: number,
  sourceTranscript: Transcript | null | undefined,
  takeTranscripts: Map<string, Transcript> | undefined,
  conversationId: string,
): PresentationStop {
  const take = selectedTake(intervention);
  const atFrame = intervention.anchor.tSourceFrame;

  /*
   * The claim, or the sentence the source was on. Same distinction the article
   * and the cards draw: a bound statement hashes to what was said and may be
   * quoted; an inferred one is context for the person speaking and is not.
   * [INV-05]
   */
  const bound = intervention.anchor.quote;
  const context = bound ? undefined : contextAt(sourceTranscript, atFrame);
  const claim = bound
    ? { text: bound, quoted: true }
    : context ? { text: context, quoted: false } : undefined;

  const transcript = take ? takeTranscripts?.get(take.id) : undefined;
  const prompt = take && transcript ? promptFrom(take, transcript) : undefined;
  const usable = take ? takeUsableFrames(take) : 0;

  return {
    index,
    interventionId: intervention.id,
    atFrame,
    atSeconds: round(atFrame / HOUSE_FPS),
    holdSeconds: round((atFrame + 0.5) / HOUSE_FPS),
    timecode: formatTimecode(atFrame).slice(0, 8),
    label: TYPE_PRESENTATION[intervention.type].lowerThird,
    ...(claim ? { claim } : {}),
    ...(prompt ? { prompt } : {}),
    ...(usable > 0 ? { recordedSeconds: round(usable / HOUSE_FPS) } : {}),
    ...(take && usable > 0
      ? { takeSrc: `/api/conversations/${conversationId}/takes/${take.id}/media` }
      : {}),
    evidence: (intervention.evidence ?? []).map((item) => ({
      title: item.title,
      ...(item.url ? { url: item.url } : {}),
      ...(item.locator.page !== undefined ? { page: item.locator.page } : {}),
      ...(item.locator.quote ? { quote: item.locator.quote } : {}),
      retrievedAt: item.retrievedAt,
      archived: item.archived,
    })),
    marks: intervention.annotations?.length ?? 0,
  };
}

/** The sentence the source was on, bounded to that sentence. [U-35] */
function contextAt(
  transcript: Transcript | null | undefined, frame: Frames,
): string | undefined {
  if (!transcript) return undefined;
  const sentence = sentenceAtFrame(transcript.sentences, Math.max(0, frame - 1));
  return sentence ? forDisplay(sentence.text, transcript.characteristics) : undefined;
}

/** The author's own words, trimmed to what they kept. Same rule as the article. */
function promptFrom(
  take: { id: string; mediaInFrame: Frames; mediaOutFrame: Frames },
  transcript: Transcript,
): string | undefined {
  const text = transcript.sentences
    .filter((sentence) => sentence.endFrame > take.mediaInFrame
      && sentence.startFrame < take.mediaOutFrame)
    .map((sentence) => forDisplay(sentence.text, transcript.characteristics))
    .join(' ')
    .trim();
  return text || undefined;
}

/**
 * Microseconds, not milliseconds.
 *
 * A millisecond is a thirtieth of a frame, which sounds like plenty until the
 * rounding goes the wrong way across a frame boundary. Six places is below
 * anything a player resolves and costs three characters.
 */
function round(seconds: number): number {
  return Math.round(seconds * 1_000_000) / 1_000_000;
}
