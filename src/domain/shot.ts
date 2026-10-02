/**
 * Is the camera any good?  [Doctrine CHANNEL §23, §26, §27, D-04,
 * D-21, C-28, C-45]
 *
 * THE BRIEF'S POINT 8, which is the one it says no graphics fix:
 *
 *   *"quite soft, heavily compressed, poorly framed, subject very
 *   close to the bottom edge, large empty wall area, door dominates
 *   the left side, lighting relatively flat… even if you add a
 *   perfect lower third, it will still look like a home webcam
 *   feed."*
 *
 * It is right, and the product said nothing. The Live Studio's
 * camera panel reports the device, the preset and the feed's
 * bitrate — everything about the TRANSPORT and nothing about the
 * PICTURE. An operator could watch their own preview for ten
 * minutes and never be told the room is flat, because nobody was
 * measuring it.
 *
 * STUDIO TWO HAS HAD AN HONEST VERDICT BEFORE RECORDING SINCE IT WAS
 * BUILT. The surface the brief is complaining about has none. That
 * is the same shape as every other finding this month: a capability
 * this product has, on a surface it was never pointed at. [D-19]
 *
 * WHAT IS MEASURED IS WHAT CAN BE MEASURED HONESTLY, and the list is
 * shorter than the brief's. Three things, from a frame and nothing
 * else:
 *
 *   EXPOSURE   too dark or too bright — unambiguous arithmetic.
 *   SPREAD     flat light — the distance between the darkest and
 *              brightest parts of the picture.
 *   WEIGHT     where the detail is, vertically.
 *
 * AND SOFTNESS IS DELIBERATELY ABSENT, although the brief names it
 * first. Sharpness from a frame alone is confounded by content: a
 * person against a plain wall has little detail because the wall
 * has none, not because the lens is soft. Telling an operator their
 * camera is soft when their room is plain is a check that cries
 * wolf, and a control room learns to ignore one of those in a week.
 * [D-04]
 *
 * Nothing here touches the filesystem, the network, a clock or a
 * canvas. The browser's part — ask the video for a frame — is glue.
 */

import { meanLuma } from './confidence.js';

/** A frame, sampled small. 64×36 is plenty for every number here. */
export interface Frame {
  rgba: ArrayLike<number>;
  width: number;
  height: number;
}

export interface Look {
  /** Mean brightness, 0–1. */
  luma: number;
  /** How far apart the dark and bright parts are, 0–1. */
  spread: number;
  /**
   * WHERE THE DETAIL IS, vertically: 0 is all of it at the top, 1 is
   * all of it at the bottom, 0.5 is even.
   */
  weight: number;
}

/** Rec.709 luma of one pixel, 0–1. */
function lumaAt(rgba: ArrayLike<number>, at: number): number {
  return (0.2126 * rgba[at]! + 0.7152 * rgba[at + 1]!
    + 0.0722 * rgba[at + 2]!) / 255;
}

/**
 * THE SPREAD IS A PERCENTILE RANGE, NOT A MIN AND A MAX.
 *
 * One blown highlight off a window and one black doorway would make
 * every picture read as full-range, which is the opposite of what
 * the number is for. The fifth and ninety-fifth percentiles are what
 * a colourist looks at and they ignore exactly those two pixels.
 */
const LOW = 0.05;
const HIGH = 0.95;

export function lookOf(frame: Frame): Look {
  const { rgba, width, height } = frame;
  const lumas: number[] = [];
  /* Detail as the difference between horizontally adjacent pixels,
     summed per row band. Cheap, and it is edges rather than content. */
  let top = 0;
  let bottom = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      if (at + 3 >= rgba.length) continue;
      const here = lumaAt(rgba, at);
      lumas.push(here);
      if (x + 1 < width && at + 7 < rgba.length) {
        const edge = Math.abs(here - lumaAt(rgba, at + 4));
        if (y < height / 2) top += edge; else bottom += edge;
      }
    }
  }
  if (lumas.length === 0) return { luma: 0, spread: 0, weight: 0.5 };
  lumas.sort((a, b) => a - b);
  const at = (part: number) => lumas[
    Math.min(lumas.length - 1, Math.floor(part * lumas.length))]!;
  const detail = top + bottom;
  return {
    luma: meanLuma(rgba),
    spread: at(HIGH) - at(LOW),
    /* A frame with no edges anywhere is even, not top-heavy. */
    weight: detail === 0 ? 0.5 : bottom / detail,
  };
}

/* ------------------------------------------------------------------------ *
 *  What to say about it.
 * ------------------------------------------------------------------------ */

/** Below this the picture is under-lit however the camera gains it up. */
export const TOO_DARK = 0.18;
/** Above this the faces are washing out. */
export const TOO_BRIGHT = 0.78;
/**
 * HOW MUCH RANGE A LIT ROOM HAS.
 *
 * A room with one soft source and no fill reads about 0.5 between
 * the fifth and ninety-fifth percentiles. Under a third of the range
 * is a picture with nothing to model a face with, which is what
 * "lighting is relatively flat" means in numbers.
 */
export const TOO_FLAT = 0.32;
/**
 * AND WHEN THE PICTURE IS BOTTOM-HEAVY ENOUGH TO SAY SO.
 *
 * Three quarters of the frame's detail below the midline is a
 * subject sitting low with a wall above them. Not a fault — a wide
 * shot of a desk is a real shot — so the sentence suggests rather
 * than complains.
 */
export const BOTTOM_HEAVY = 0.75;

export interface ShotProblem {
  code: 'dark' | 'bright' | 'flat' | 'low';
  says: string;
}

/**
 * What is wrong with this shot, or nothing.
 *
 * ONE SENTENCE EACH, EACH NAMING WHAT TO DO. "Exposure is low" is a
 * measurement; "add light on the side you are facing" is a thing an
 * operator can do in the minute before they go on air. [D-21]
 *
 * AND NEVER MORE THAN TWO. A camera panel listing four complaints is
 * a panel somebody stops reading, which is the brief's own point 10
 * pointed at the control room instead of at the picture.
 */
export function shotProblems(look: Look): ShotProblem[] {
  const out: ShotProblem[] = [];
  if (look.luma < TOO_DARK) {
    out.push({ code: 'dark',
      says: 'The picture is dark. A light on the side you are facing does '
        + 'more than turning the camera’s brightness up.' });
  }
  /*
   * NO `else` HERE, AND THAT IS NOT AN OVERSIGHT. One was written
   * and survived every mutation, because `TOO_DARK` is below
   * `TOO_BRIGHT` and no number is both — the branch could never
   * have fired twice. What makes that true is the two constants,
   * not the keyword, so the constants are what the test holds.
   * [C-45]
   */
  if (look.luma > TOO_BRIGHT) {
    out.push({ code: 'bright',
      says: 'The picture is washing out. Move away from the window, or '
        + 'turn a light down.' });
  }
  if (look.spread < TOO_FLAT) {
    out.push({ code: 'flat',
      says: 'The light is flat — there is nothing between the darkest '
        + 'and brightest parts to model a face. One source to the side '
        + 'fixes it.' });
  }
  if (look.weight > BOTTOM_HEAVY) {
    out.push({ code: 'low',
      says: 'Most of the picture is empty above you. Raising the camera to '
        + 'eye level, or moving closer, fills the frame.' });
  }
  return out.slice(0, 2);
}

/** The worst of it in one line, or nothing when the shot is fine. */
export function shotSays(problems: readonly ShotProblem[]): string | null {
  return problems[0]?.says ?? null;
}
