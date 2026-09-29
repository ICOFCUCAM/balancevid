/**
 * How one shot becomes the next.  [Doctrine STUDIO-TWO §11, S-8, U-18]
 *
 * §11 lists eight. S-8 said four of them earn their place first — Cut,
 * Dissolve, Fade and Beat cut — and that *Match movement* is a research
 * problem wearing the costume of a transition. That judgement stands, and it
 * is the same one the Studio's Explain toolkit made when it shipped six tools
 * rather than sixteen: a transition that works three times in five is worse
 * than one the author never had, because they only find out at the export.
 *
 * BEAT CUT IS NOT IN THIS TABLE, deliberately. A beat cut is a cut — the
 * transition is not what makes it one, the PLACEMENT is. It belongs to the
 * beat grid and to snapping, which is where it is built, and putting it here
 * as a fifth style would make a cut on a beat a different object from a cut,
 * which it is not.
 *
 * A TRANSITION IS A LENGTH OF TIME, and the song does not get longer to make
 * room for it. A dissolve is therefore paid for out of the two shots it joins
 * — half from the end of one, half from the start of the next — so the finished
 * video is exactly as long as the music either way (INV-03). That has a
 * precondition the planner has to check: both takes must have picture across
 * the whole overlap, including the part that lies outside their own scenes.
 */

import { HOUSE_FPS, type Frames } from './time.js';

export interface Transition {
  id: string;
  label: string;
  /** How it looks, said in the studio rather than in a tooltip. */
  hint: string;
  /** Total frames of overlap. Zero is a cut. */
  frames: Frames;
  /**
   * How the two pictures are mixed over the overlap.
   *
   * `dissolve` crosses one into the other; `black` takes the first down to
   * nothing and brings the second up from it. A cut mixes nothing, because
   * there is no overlap to mix across.
   */
  mix: 'none' | 'dissolve' | 'black';
}

/**
 * WHICH SHOT PAYS FOR THE OVERLAP.  [MASTER-EDIT §3, INV-03]
 *
 * Centred is what every editor defaults to and what an author dragging a
 * boundary expects: the moment they chose is the middle of the change. The
 * other two exist because that moment is often a downbeat, and a change that
 * has FINISHED by the downbeat reads differently from one that starts there.
 * `before` spends the whole overlap out of the outgoing shot, so the new
 * picture is fully up on the boundary; `after` spends it out of the incoming
 * one, so the old picture is still whole as the boundary passes.
 *
 * None of the three makes the song longer. That is the point of naming them
 * at all: the question is never "how much time do I add", it is "who pays".
 */
export type TransitionAlign = 'centred' | 'before' | 'after';

export const TRANSITION_ALIGNS: Record<TransitionAlign, { label: string; hint: string }> = {
  before: {
    label: 'Ends on the cut',
    hint: 'The arriving shot is fully up by the boundary. Paid by the one leaving.',
  },
  centred: {
    label: 'Centred',
    hint: 'Half from each side. The boundary is the middle of the change.',
  },
  after: {
    label: 'Begins on the cut',
    hint: 'The leaving shot is still whole at the boundary. Paid by the one arriving.',
  },
};

export const DEFAULT_TRANSITION_ALIGN: TransitionAlign = 'centred';

export function isTransitionAlign(value: string): value is TransitionAlign {
  return Object.hasOwn(TRANSITION_ALIGNS, value);
}

/**
 * The longest a mix may be, before anything is asked of the neighbours.
 *
 * Two seconds. Past that a dissolve stops being a join between two shots and
 * becomes a shot of its own that happens to hold two performances, and an
 * author who wants that wants a layout rather than a transition. The
 * neighbours usually bind first and bind harder; this is the ceiling that
 * does not depend on where the boundary happens to sit.
 */
export const MAX_TRANSITION_FRAMES: Frames = Math.round(HOUSE_FPS * 2);

/** A transition is a length of time, so the shortest one is one frame. */
export const MIN_TRANSITION_FRAMES: Frames = 1;

/** A third of a second: long enough to read as a dissolve, short enough to
 *  stay musical at any tempo this product is likely to see. */
const DISSOLVE_FRAMES = Math.round(HOUSE_FPS / 3);
/** Longer, because a fade through black is a punctuation mark. */
const FADE_FRAMES = Math.round(HOUSE_FPS * 0.8);

export const TRANSITIONS: Record<string, Transition> = {
  cut: {
    id: 'cut', label: 'Cut', mix: 'none', frames: 0,
    hint: 'Instant. The default, and the right answer most of the time.',
  },
  dissolve: {
    id: 'dissolve', label: 'Dissolve', mix: 'dissolve', frames: DISSOLVE_FRAMES,
    hint: 'One performance melts into the other.',
  },
  fade: {
    id: 'fade', label: 'Fade through black', mix: 'black', frames: FADE_FRAMES,
    hint: 'A breath between sections.',
  },
};

export const DEFAULT_TRANSITION = 'cut';

export function transitionFor(id: string | undefined): Transition {
  return TRANSITIONS[id ?? DEFAULT_TRANSITION] ?? TRANSITIONS['cut']!;
}

export function isTransition(id: string): boolean {
  return Object.hasOwn(TRANSITIONS, id);
}

/**
 * The transition a scene actually has: the style, plus the author's length.
 *
 * A COPY, NEVER THE TABLE ROW. `TRANSITIONS` is module state shared by every
 * performance in the process; writing one author's duration into it would
 * change the dissolve in everybody else's song, and the bug would present as
 * a render that came out wrong for no reason anybody could point at. So the
 * override is applied to a copy and the table stays the table.
 */
export function transitionOf(
  scene: { transition?: string; transitionFrames?: Frames },
): Transition {
  const style = transitionFor(scene.transition);
  if (style.frames === 0) return style;             /* A cut has no length. */
  if (scene.transitionFrames === undefined) return style;
  return { ...style, frames: scene.transitionFrames };
}

export function transitionAlignOf(scene: { transitionAlign?: string }): TransitionAlign {
  const value = scene.transitionAlign;
  return value !== undefined && isTransitionAlign(value) ? value : DEFAULT_TRANSITION_ALIGN;
}

/**
 * The mix, as a per-pixel expression over the overlap.
 * [§11, S-8, INV-02]
 *
 * WHY AN EXPRESSION AND NOT `xfade`. ffmpeg's own crossfade is specified in
 * seconds and decides for itself how many frames that is; asked for exactly
 * ten frames at thirty a second it produced seven, and the render came out
 * three frames shorter than the song it was supposed to be exactly as long as.
 * A ramp over the frame INDEX cannot do that: frame zero is entirely the
 * outgoing picture, the last frame is entirely the incoming one, and there are
 * exactly as many frames in between as were paid for.
 *
 * Both pictures are mixed in RGB. In YUV, "nothing" is not zero — black is
 * Y=16 with the colour planes at their midpoint — so multiplying a YUV frame
 * by zero on the way to a fade produces a green flash rather than darkness.
 *
 * Returned with ordinary commas in it. Escaping them is the renderer's job,
 * because comma-as-filter-separator is a fact about ffmpeg's command line and
 * not about how a dissolve works.
 */
export function mixExpression(transition: Transition, frames: Frames): string {
  // The last frame is index frames-1, and it must be entirely the arriving
  // picture; dividing by `frames` would leave the overlap one frame short of
  // finishing, which is a flicker back to the old shot at the join.
  const last = Math.max(1, frames - 1);
  if (transition.mix === 'black') {
    // Down to nothing by the middle, up again from it.
    return `A*max(0,1-2*N/${last})+B*max(0,2*N/${last}-1)`;
  }
  return `A*(1-N/${last})+B*(N/${last})`;
}

/**
 * How the overlap is paid for, in frames taken from each side.
 *
 * Centred by default, which is what every editor's default does and what an
 * author dragging a boundary expects: the moment they chose is the middle of
 * the change, not the end of it. An odd length gives the extra frame to the
 * outgoing shot, so a one-frame asymmetry always falls on the picture being
 * left rather than the one being arrived at.
 *
 * The other two alignments put the whole overlap on one side. They are not
 * the centred split with a zero substituted in — they answer a different
 * question, which is which shot the author is willing to lose time from —
 * but they are answered HERE rather than anywhere else because every
 * consumer of a transition needs exactly these two numbers out of it. [D-19]
 */
export function overlapSplit(
  transition: Transition, align: TransitionAlign = DEFAULT_TRANSITION_ALIGN,
): { before: Frames; after: Frames } {
  if (align === 'before') return { before: transition.frames, after: 0 };
  if (align === 'after') return { before: 0, after: transition.frames };
  const after = Math.floor(transition.frames / 2);
  return { before: transition.frames - after, after };
}
