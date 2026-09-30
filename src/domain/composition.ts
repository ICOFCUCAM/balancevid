/**
 * One person, composited.  [Doctrine CHANNEL §26, §27, C-14; STUDIO-TWO §4]
 *
 *     CAMERA / GUEST
 *            │
 *     PERSON SEGMENTATION
 *            │
 *            ├── foreground: person
 *            └── background: selected environment
 *                        │
 *                   COMPOSITOR  →  PROGRAMME
 *
 * *"The key is that the virtual background must actually become part of the
 *  master composition, not just a CSS background behind a preview."*
 *
 * WHAT C-14 FOUND, and it is the reason this file exists rather than a
 * bigger grid of buttons: `channel.identity.spaceId` was written by the ten
 * set buttons and **read by nothing**. Not by `marksFor`, not by the playout
 * engine, not by the canvas mixer — which fills `#05070a` and draws raw
 * video. The ten squares were a preference with no consumer, which is the
 * exact failure §26 warns about, arrived at from the other side: not even a
 * CSS background behind a preview.
 *
 * AND THE COMPOSITOR ALREADY EXISTS. `src/render/matte.ts` and `compose.ts`
 * do all of this for a Studio Two performance — a measured plate-difference
 * matte, feather and threshold tied to the room's own noise, a drawn space,
 * a blurred backdrop, and an honest verdict before the author records. It
 * runs in ffmpeg, offline. The work is not inventing a compositor; it is
 * bringing that one onto the live canvas. So the PARAMETERS live here,
 * shared by both paths, and the two renderers read one table. [D-19]
 *
 * WHY NOT A SEGMENTATION MODEL, which the brief's §26 names. `environment.ts`
 * argues the case and it is the product's, not a convenience:
 *
 *   *"There is no segmentation model here guessing where a person ends;
 *    there is a PLATE… It is exact where it is exact… Its precondition is
 *    knowable IN ADVANCE… It fails honestly."*
 *
 * A model is a per-frame guess, and S-6's warning is about exactly what a
 * per-frame guess does on a moving picture: a flickering edge and a hand
 * that disappears on the beat. A plate is arithmetic against a still of the
 * same room, and its failure mode is knowable before anybody goes on air.
 * So the two keys offered are the two the brief itself ranks — **chroma when
 * there is a green screen, which it calls the higher-quality path, and the
 * measured plate otherwise** — and when there is neither, there is no matte
 * and the studio says so rather than shipping an approximation of somebody's
 * silhouette.
 */

import { SPACE_LOOKS, matteFeather, matteThreshold, type RoomPlate } from './environment.js';

/* ------------------------------------------------------------------------ *
 *  The background library.  [§26 A]
 * ------------------------------------------------------------------------ */

/**
 * *"Instead of 10 tiny buttons: Studio / Performance / Places."*
 *
 * THE SAME ELEVEN SPACES, IN THREE SHELVES. Not a new table — `SPACE_LOOKS`
 * is Studio Two's and stays the only one — an ORDER over it, which is the
 * same relationship a deck has to the library. A set added to `SPACE_LOOKS`
 * and to no shelf would be invisible, so the test holds the two together.
 * [D-19, §20's decks]
 */
export interface SpaceShelf {
  id: 'studio' | 'performance' | 'places';
  label: string;
  /** Why these belong together, said once rather than guessed at. */
  says: string;
  spaceIds: readonly string[];
}

export const SPACE_SHELVES: readonly SpaceShelf[] = [
  {
    id: 'studio', label: 'Studio',
    says: 'Rooms built to be broadcast from.',
    spaceIds: ['recording_studio', 'modern_room', 'night_studio'],
  },
  {
    id: 'performance', label: 'Performance',
    says: 'Rooms built to be performed in.',
    spaceIds: ['concert_stage', 'theatre', 'church', 'university_hall'],
  },
  {
    id: 'places', label: 'Places',
    says: 'Somewhere else entirely.',
    spaceIds: ['city', 'beach', 'forest', 'mountain'],
  },
];

/* ------------------------------------------------------------------------ *
 *  What goes behind.
 * ------------------------------------------------------------------------ */

export type Backdrop =
  /** Their own room, as it is. No matte is needed and none is taken. */
  | { kind: 'none' }
  /** Their own room, out of focus. The dependable middle. [STUDIO-TWO §4] */
  | { kind: 'blur' }
  /** A drawn space, by id from `SPACE_LOOKS`. */
  | { kind: 'space'; spaceId: string };

/** Their own room, softened — the same sigma the render path uses. */
export const BLUR_SIGMA = 24;

/* ------------------------------------------------------------------------ *
 *  How the person is separated from it.  [§26 C]
 * ------------------------------------------------------------------------ */

export type Key =
  /** Nothing separates them, so nothing can go behind them. */
  | { kind: 'none' }
  /**
   * The measured plate difference. `threshold` and `feather` are not
   * chosen: they are computed from the plate's own noise and quality, so a
   * noisy camera gets a forgiving key and a clean one gets a tight one.
   */
  | { kind: 'plate'; threshold: number; feather: number }
  /**
   * A green screen, which the brief ranks above segmentation and is right
   * to: a key against a known colour is exact per pixel and costs nothing
   * per frame, where a model is a guess repeated thirty times a second.
   */
  | {
    kind: 'chroma';
    /** The screen's colour, as `#rrggbb`. Sampled, or the conventional green. */
    colour: string;
    /** How far from that colour still counts as screen, 0..1. */
    similarity: number;
    /** How soft the edge of that decision is, 0..1. */
    smoothness: number;
    /** How much of the screen's colour to pull out of the person, 0..1. */
    spill: number;
  };

/** Broadcast green, which is what a screen bought for the purpose is. */
export const CHROMA_GREEN = '#00b140';

export const CHROMA_DEFAULTS = {
  colour: CHROMA_GREEN,
  /*
   * MEASURED CHOICES, not tuned by eye on one shot. 0.34 is wide enough to
   * hold an unevenly lit screen and narrow enough to keep a green shirt;
   * the smoothness is one third of it, which is the ratio that puts the
   * soft band on the edge rather than through the middle of it; and a
   * little spill removal, because the one thing everybody notices in a bad
   * key is a green rim on a cheek.
   */
  similarity: 0.34,
  smoothness: 0.11,
  spill: 0.4,
} as const;

/* ------------------------------------------------------------------------ *
 *  Where they sit in it.  [§26 D]
 * ------------------------------------------------------------------------ */

/**
 * *"Then a host can sit naturally inside the virtual environment instead of
 *  appearing as a floating cutout."*
 *
 * ALL FRACTIONS OF THE PANEL, never pixels, because the same composition is
 * drawn at 1280×720 on the live canvas and at whatever the export asks for
 * in the renderer, and a number in pixels would mean two different things
 * in the two places. The same reason `LAYOUTS` is in fractions. [D-19]
 */
export interface Frame {
  /** Where the centre of the person sits, 0..1 of the panel. */
  x: number;
  y: number;
  /** How large they are drawn, against filling the panel. */
  scale: number;
  /** How much of the top of the source to cut away, 0..1. */
  crop: number;
  /** Mirrored, which is what most people expect of their own camera. */
  flip: boolean;
}

export const CENTRED: Frame = { x: 0.5, y: 0.5, scale: 1, crop: 0, flip: false };

/** −1 is a stop down, +1 a stop up. Zero is the camera as it came. */
export type Light = number;

export interface Composition {
  backdrop: Backdrop;
  key: Key;
  frame: Frame;
  light: Light;
  /** Their own room, softened, behind them — distinct from a blur backdrop. */
  backgroundBlur: number;
}

export const NO_COMPOSITION: Composition = {
  backdrop: { kind: 'none' },
  key: { kind: 'none' },
  frame: CENTRED,
  light: 0,
  backgroundBlur: 0,
};

/* ------------------------------------------------------------------------ *
 *  What is possible, and what to say when it is not.
 * ------------------------------------------------------------------------ */

/**
 * Which key this person can actually have.
 *
 * IN THE BRIEF'S OWN ORDER. *"If a person has a green screen, chroma key can
 * be offered as the higher-quality path. If they don't, segmentation should
 * be used."* — and the plate is this product's segmentation, measured rather
 * than guessed.
 */
export function keyFor(
  { plate, greenScreen }: { plate?: RoomPlate; greenScreen?: boolean },
): Key {
  if (greenScreen) return { kind: 'chroma', ...CHROMA_DEFAULTS };
  if (plate) {
    return {
      kind: 'plate',
      threshold: matteThreshold(plate),
      feather: matteFeather(plate),
    };
  }
  return { kind: 'none' };
}

/**
 * Why there is no background behind this person, in their language.
 *
 * SAID RATHER THAN SHOWN AS A GREYED CONTROL. A disabled swatch teaches
 * somebody that the feature is broken; a sentence teaches them what to do,
 * and both of the two things to do are small. [U-19, S-6]
 */
export function whyNoBackdrop(key: Key): string | null {
  if (key.kind !== 'none') return null;
  return 'Nothing separates this person from their room yet. Take a plate — '
    + 'three seconds of the room with nobody in it — or turn on the green '
    + 'screen if there is one behind them.';
}

/** Is this a background the compositor can actually draw? */
export function drawable(composition: Composition): boolean {
  if (composition.backdrop.kind === 'none') return true;
  /*
   * A BLUR NEEDS NO MATTE AND A SPACE DOES. Blurring their whole room is
   * one operation on one picture; putting a concert stage behind them is
   * two pictures and a decision about every pixel. Offering "Blur" when
   * there is no plate is the honest middle the render path already
   * offers. [STUDIO-TWO §4]
   */
  if (composition.backdrop.kind === 'blur') return true;
  return composition.key.kind !== 'none';
}

/** A space id this product knows how to light, or nothing. */
export function spaceOf(backdrop: Backdrop): string | null {
  return backdrop.kind === 'space' && SPACE_LOOKS[backdrop.spaceId]
    ? backdrop.spaceId : null;
}

/**
 * The rectangle a person is drawn into, in pixels of the panel.
 *
 * COVER, THEN MOVED AND SCALED. The base is the same `cover` every other
 * renderer in this product uses — a letterboxed person inside a panel that
 * is itself letterboxed is a face four hundred pixels from the nearest edge
 * — and the frame's own numbers move it from there.
 */
export function boxFor(
  frame: Frame, panel: { w: number; h: number },
  source: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const safe = Math.max(0.2, Math.min(4, frame.scale));
  const visible = Math.max(0.05, 1 - Math.min(0.9, Math.max(0, frame.crop)));
  const cover = Math.max(
    panel.w / Math.max(1, source.w),
    panel.h / Math.max(1, source.h * visible));
  const w = source.w * cover * safe;
  const h = source.h * visible * cover * safe;
  return {
    x: frame.x * panel.w - w / 2,
    y: frame.y * panel.h - h / 2,
    w,
    h,
  };
}
