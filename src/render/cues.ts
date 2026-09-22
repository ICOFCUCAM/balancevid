/**
 * Caption cues.  [Doctrine U-19, U-08, INV-07]
 *
 * Captions live on the OUTPUT clock; transcripts live on the source clock and
 * on each take's own media clock. This module is the mapping, and it is the
 * only place that mapping is allowed to happen -- getting it wrong puts a
 * speaker's words over the other speaker's face.
 *
 * Both speakers are captioned and labelled. "In a product about disagreement,
 * who is speaking must never be ambiguous for one second of the output." (U-20)
 */

import type { Conversation } from '../domain/document.js';
import type { Timeline } from '../domain/timeline.js';
import type { Frames } from '../domain/time.js';
import { forDisplay, type Transcript, type TranscriptSentence } from '../transcribe/types.js';
import type { Cue } from './subtitles.js';

export interface CueSources {
  /** The source transcript, on the source clock. */
  source?: Transcript | null;
  /** Take transcripts by take id, each on its own media clock. */
  takes?: Map<string, Transcript>;
}

export function buildCues(
  _conversation: Conversation, timeline: Timeline, transcripts: CueSources,
): Cue[] {
  const cues: Cue[] = [];

  for (const item of timeline.items) {
    if (item.kind === 'source') {
      const transcript = transcripts.source;
      if (!transcript) continue;
      for (const sentence of overlapping(transcript.sentences, item.sourceInFrame, item.sourceOutFrame)) {
        // A sentence straddling a cut is clipped, not dropped: the viewer
        // hears the first half, so they must read the first half.
        const start = Math.max(sentence.startFrame, item.sourceInFrame);
        const end = Math.min(sentence.endFrame, item.sourceOutFrame);
        push(cues, {
          startFrame: item.outputStartFrame + (start - item.sourceInFrame),
          endFrame: item.outputStartFrame + (end - item.sourceInFrame),
          speaker: 'source',
          text: forDisplay(sentence.text, transcript.characteristics),
        });
      }
      continue;
    }

    const transcript = transcripts.takes?.get(item.takeId);
    if (!transcript) continue;
    const shift = item.outputStartFrame + item.padHeadFrames - item.mediaInFrame;
    for (const sentence of overlapping(transcript.sentences, item.mediaInFrame, item.mediaOutFrame)) {
      const start = Math.max(sentence.startFrame, item.mediaInFrame);
      const end = Math.min(sentence.endFrame, item.mediaOutFrame);
      push(cues, {
        startFrame: start + shift,
        endFrame: end + shift,
        speaker: 'user',
        text: forDisplay(sentence.text, transcript.characteristics),
      });
    }
  }

  return cues.sort((a, b) => a.startFrame - b.startFrame);
}

function overlapping(
  sentences: TranscriptSentence[], from: Frames, to: Frames,
): TranscriptSentence[] {
  return sentences.filter((s) => s.endFrame > from && s.startFrame < to);
}

/** Drop empty or inverted cues rather than emitting a subtitle nobody can read. */
function push(cues: Cue[], cue: Cue): void {
  if (!cue.text.trim()) return;
  if (cue.endFrame <= cue.startFrame) return;
  const previous = cues.at(-1);
  // Overlapping cues make libass stack them; nudge the boundary instead.
  if (previous && cue.startFrame < previous.endFrame) previous.endFrame = cue.startFrame;
  cues.push(cue);
}
