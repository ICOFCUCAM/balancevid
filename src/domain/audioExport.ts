/**
 * The conversation, to listen to.  [Doctrine U-22, U-30, D-16, INV-00, INV-11]
 *
 * "Not everything should become video." A conversation is mostly people
 * talking, and a lot of listening happens where watching cannot — driving,
 * walking, washing up. So the same conversation becomes an audio file, with
 * chapters at the moments the author interrupted.
 *
 * IT IS NOT A NEW EDIT. The audio is taken from a finished render rather than
 * composed again: the same shots, the same cuts, the same mastering decisions,
 * addressed by the same plan hash (INV-00, U-16). The alternative — an audio
 * pipeline that assembles the takes itself — is a second composition that
 * would eventually disagree with the video about where a cut is, and the
 * disagreement would be inaudible until somebody noticed a sentence missing.
 *
 * AND THE PRODUCT SAYS WHAT LISTENING COSTS. A response that circles a road on
 * a map, or shows a document and zooms to the cited line, does not survive
 * being listened to: the words are all there and the subject is not. That is
 * not a reason to withhold the feature; it is a reason to say so, with a
 * number, before somebody publishes a podcast in which a third of their
 * argument points at a picture nobody can see. The count is measured from the
 * document — marks and evidence, which is exactly what "points at something"
 * means here — rather than guessed at from the prose.
 */

import type { Conversation, Intervention } from './document.js';
import { acceptedInterventions, selectedTake, takeUsableFrames } from './document.js';
import { HOUSE_FPS, type Frames } from './time.js';

/**
 * Where spoken word is mastered to.  [U-17, INV-11]
 *
 * Louder than the video's -14 LUFS, because a podcast is listened to against
 * traffic and a dishwasher rather than in front of a screen, and -16 is where
 * the spoken-word platforms put it. A second normalisation of an
 * already-mastered track is a small gain change, not a re-squash: the video's
 * master used a limiter to reach a ceiling, and this moves the whole thing by
 * about two decibels underneath it.
 */
export const PODCAST_LOUDNESS_LUFS = -16;
export const PODCAST_TRUE_PEAK_DB = -1;

/**
 * Stereo, at a rate that does not cost the argument anything.
 *
 * 160 kbit/s rather than a speech-tuned 96: a conversation carries room tone,
 * two voices recorded on different equipment, and sometimes music from the
 * source being discussed. The extra half-megabyte a minute is not the thing
 * worth saving.
 */
export const PODCAST_BITRATE = '160k';

export interface AudioChapter {
  /** Milliseconds, which is what an ID3 chapter frame is measured in. */
  startMs: number;
  endMs: number;
  title: string;
}

/**
 * Chapters, in the units a player wants them.
 *
 * Built from the bundle's chapters — the same list the author pastes into
 * YouTube — so the video's chapters and the audio's cannot describe the same
 * conversation differently. [D-16]
 */
export function audioChapters(
  chapters: { startFrame: Frames; title: string }[],
  totalFrames: Frames,
  fps: number = HOUSE_FPS,
): AudioChapter[] {
  const ms = (frames: Frames) => Math.max(0, Math.round((frames / fps) * 1000));
  const out: AudioChapter[] = [];
  const ordered = [...chapters].sort((a, b) => a.startFrame - b.startFrame);

  for (const [index, chapter] of ordered.entries()) {
    const startMs = ms(chapter.startFrame);
    const endMs = index + 1 < ordered.length
      ? ms(ordered[index + 1]!.startFrame)
      : ms(totalFrames);
    /*
     * A chapter that starts where it ends is one a player either ignores or
     * renders as an unreachable marker. Dropped rather than shipped: this
     * list exists to be used without editing.
     */
    if (endMs <= startMs) continue;
    out.push({ startMs, endMs, title: chapter.title });
  }
  return out;
}

export interface ListeningCost {
  /** Responses that point at something on screen. */
  pointing: number;
  /** Responses in the conversation at all. */
  total: number;
  /** Said plainly, or absent when there is nothing to say. */
  note?: string;
}

/**
 * What this conversation loses when it is only listened to.
 *
 * A response points at the picture when the author marked the frame or
 * attached evidence — both of which are statements about something visible.
 * Nothing else is guessed at: a response that merely disagrees in words loses
 * nothing at all by being heard rather than watched.
 */
export function listeningCost(conversation: Conversation): ListeningCost {
  const responses = acceptedInterventions(conversation).filter((intervention) => {
    const take = selectedTake(intervention);
    return take && takeUsableFrames(take) > 0;
  });
  const pointing = responses.filter(pointsAtPicture).length;
  if (responses.length === 0 || pointing === 0) {
    return { pointing, total: responses.length };
  }
  const which = pointing === 1 ? 'response points' : 'responses point';
  return {
    pointing,
    total: responses.length,
    note: `${pointing} of your ${responses.length} ${which} at something on `
      + 'screen — a mark on the frame, or a document. Those parts will be heard '
      + 'and not seen.',
  };
}

export function pointsAtPicture(intervention: Intervention): boolean {
  return (intervention.annotations?.length ?? 0) > 0
    || (intervention.evidence?.length ?? 0) > 0;
}
