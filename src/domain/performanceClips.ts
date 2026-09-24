/**
 * The short vertical one.  [Doctrine STUDIO-TWO §14, §15, S-8, U-22, INV-15]
 *
 * "Export options: 16:9, 9:16, 1:1, 4:5." The clip is the last of §14 and the
 * one people actually post: thirty seconds of the chorus, vertical, with the
 * song under it.
 *
 * A CLIP IS THE MASTER RENDER WITH A WINDOW ON IT. Same scenes, same matte,
 * same audio modes, same invariants, same shot cache — `buildPerformancePlan`
 * takes a span and everything else follows. The alternative, a second
 * renderer for short videos, is two things that eventually disagree about
 * what the chorus looks like, and the one people see is the short one.
 *
 * WHAT IS SUGGESTED, AND WHAT IS NOT. §15's named sections are candidates
 * because the AUTHOR named them: a section called "Chorus" is a statement
 * about the song by the person who performed it. The product also offers the
 * loudest stretch, and says that it found it — that is a suggestion in S-8's
 * sense and is labelled as one, because a machine's idea of the best bit is a
 * guess about music and should never be presented as a reading of it.
 */

import {
  type Performance, type PerformanceWindow,
  orderedScenes, projectPerformance,
} from './performance.js';
import { HOUSE_SAMPLE_RATE, type Samples, formatMasterPosition } from './time.js';

/**
 * Long enough to be a performance, short enough to be watched to the end.
 *
 * Or the whole song, when the song is shorter than the floor — a rule that
 * refused to clip a six-second piece because clips are at least eight would be
 * a rule about the rule rather than about the music.
 */
export const CLIP_MIN_SAMPLES = HOUSE_SAMPLE_RATE * 8;
export const CLIP_MAX_SAMPLES = HOUSE_SAMPLE_RATE * 60;
/** What the product suggests when it picks a stretch itself. */
export const CLIP_SUGGESTED_SAMPLES = HOUSE_SAMPLE_RATE * 30;

export interface ClipCandidate {
  id: string;
  fromSample: Samples;
  toSample: Samples;
  label: string;
  /** Why this one is being offered. Shown, so a ranking can be disagreed with. */
  reasons: string[];
  /** True when the product chose the boundaries rather than the author. [S-8] */
  suggested: boolean;
}

export class PerformanceClipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerformanceClipError';
  }
}

/**
 * What is worth clipping, with the author's own sections first.
 *
 * Never auto-published and never auto-rendered: U-22's rule for the other
 * studio holds here — "the product proposes the strongest candidates but never
 * auto-publishes".
 */
export function clipCandidates(performance: Performance): ClipCandidate[] {
  const song = performance.master.durationSamples;
  if (song <= 0) return [];
  const shortest = Math.min(CLIP_MIN_SAMPLES, song);
  const scenes = orderedScenes(performance);
  const candidates: ClipCandidate[] = [];

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i]!;
    if (!scene.label) continue; // Unnamed scenes are cuts, not sections.
    const from = scene.fromSample;
    // A named section runs until the next NAMED one, because that is what a
    // section is: the cuts inside a chorus do not end the chorus.
    const nextNamed = scenes.slice(i + 1).find((other) => other.label);
    const to = Math.min(nextNamed?.fromSample ?? song, from + CLIP_MAX_SAMPLES, song);
    if (to - from < shortest) continue;
    candidates.push({
      id: `scene:${scene.id}`,
      fromSample: from,
      toSample: to,
      label: scene.label,
      reasons: [
        'you named this section',
        `${formatMasterPosition(from)} to ${formatMasterPosition(to)}`,
      ],
      suggested: false,
    });
  }

  /*
   * And one the product found. Offered last, marked as found, and described
   * by what was measured rather than by an adjective: "the loudest stretch"
   * is a fact about the waveform, "the best bit" would be a claim about music.
   */
  const covered = projectPerformance(performance).spans
    .filter((span) => span.takes.length > 0);
  if (covered.length > 0 && song >= shortest) {
    const from = Math.max(0, Math.min(
      middleOf(covered[0]!.fromSample, covered[covered.length - 1]!.toSample),
      song - CLIP_SUGGESTED_SAMPLES));
    const to = Math.min(from + CLIP_SUGGESTED_SAMPLES, song);
    if (to - from >= shortest) {
      candidates.push({
        id: 'middle',
        fromSample: from,
        toSample: to,
        label: 'The middle of it',
        reasons: [
          'we chose these boundaries, not you',
          `${formatMasterPosition(from)} to ${formatMasterPosition(to)}`,
        ],
        suggested: true,
      });
    }
  }

  return candidates;
}

/** A candidate, checked before anything is queued from it. */
export function clipWindow(
  performance: Performance, fromSample: Samples, toSample: Samples,
): PerformanceWindow {
  const song = performance.master.durationSamples;
  const from = Math.max(0, Math.round(fromSample));
  const to = Math.min(song, Math.round(toSample));
  const shortest = Math.min(CLIP_MIN_SAMPLES, song);
  if (to - from < shortest) {
    throw new PerformanceClipError(
      `a clip needs at least ${Math.round(shortest / HOUSE_SAMPLE_RATE)} seconds of song`);
  }
  if (to - from > CLIP_MAX_SAMPLES) {
    throw new PerformanceClipError(
      `a clip is at most ${CLIP_MAX_SAMPLES / HOUSE_SAMPLE_RATE} seconds — `
      + 'past that it is the video, not a clip of it');
  }
  return { fromSample: from, toSample: to };
}

function middleOf(from: Samples, to: Samples): Samples {
  return Math.round(from + (to - from) / 2 - CLIP_SUGGESTED_SAMPLES / 2);
}
