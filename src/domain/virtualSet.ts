/**
 * A virtual set is a scene, not a picture.
 * [Doctrine CHANNEL §27, §28, C-14; STUDIO-TWO §4; D-19]
 *
 *     ┌────────────────────────────────────────────┐
 *     │       BALANCEVID TV                        │
 *     │             HOST                           │
 *     │   Guest 1             Guest 2              │
 *     │       lower third / programme graphics     │
 *     └────────────────────────────────────────────┘
 *
 * *"Background and Virtual Set should not be the same thing. Background
 *  simply replaces what's behind a person. Virtual Set is a complete
 *  production scene."*
 *
 * THE PRODUCT HAD ONE CONTROL FOR BOTH, and it was the background one: a
 * `SpaceLook` is a wash, a pool of light, a band and some grain. That is a
 * backdrop, precisely as §27 defines it, sitting under a panel labelled
 * "Background / Virtual Set".
 *
 * SO WHAT MAKES THIS A SCENE. Of §27's eight parts, two already existed
 * and are not rebuilt here: presenter positions are `LAYOUTS`, shared by
 * the live mixer and the ffmpeg renderer so a quad here and a quad in an
 * export are one table; programme graphics are `marksFor`. What a set
 * ADDS is the furniture between them — a desk, a screen, a riser, a place
 * the logo belongs and a region the lower third owns — and the fact that
 * all of it is DESCRIBED rather than drawn, in fractions of the frame, so
 * one set works at 1280×720 on the canvas and at whatever an export asks
 * for. [D-19, §26 D]
 *
 * *"A reusable scene system rather than a collection of images."* Nothing
 * here is an image. A set is a space id, an arrangement, and a short list
 * of rectangles with a purpose each.
 *
 * AND IT BELONGS TO THE CHANNEL, not to a person. A background is per
 * participant — *"each participant can have an independent background"* —
 * because it is about their room. A set is the station's studio, and §13
 * already says why that lives on the identity: *"a station does not
 * repaint its studio between programmes."*
 */

import type { Rect } from './presentation.js';
import { SPACE_LOOKS } from './environment.js';

/**
 * A piece of furniture, in fractions of the frame.
 *
 * DRAWN, LIKE THE SPACES, and for §4's reason: a photograph of a desk is
 * somebody's photograph of a desk, with a rights line and a perspective
 * that will not match the camera. Two tones and an edge is a desk at
 * broadcast size, and it is a desk this product owns.
 */
export type Piece =
  /**
   * The thing presenters sit behind. Drawn IN FRONT of them, which is
   * what makes it a desk rather than a wall: the bottom of a person
   * disappears behind it and they stop being a cutout standing on air.
   */
  | { kind: 'desk'; rect: Rect; face: string; top: string }
  /**
   * A screen in the set. It shows nothing yet and says so — what would
   * go in it is the programme or the graphics layer, and feeding a
   * monitor its own output is a decision, not a default.
   */
  | { kind: 'screen'; rect: Rect; frame: string; glass: string;
    placement?: Placement }
  /** Something a presenter stands on, drawn behind them. */
  | { kind: 'riser'; rect: Rect; face: string }
  /** A band of the station's colour, for a set that wants one. */
  | { kind: 'band'; rect: Rect; face: string };

/**
 * WHAT A PIECE BELONGS BESIDE, rather than where it was drawn.
 * [STUDIO-TWO §4, S-38, S-40]
 *
 * *"Describe where an element belongs in the scene, not where it
 * happened to be drawn in one frame."*
 *
 * A `rect` says where something is. It does not say what it is relative
 * to — and that is the whole of what S-38 found. News Desk's screen was
 * authored at `x: 0.56` against a 16:9 frame where the presenter
 * occupies a quarter of the width. At 1:1 they occupy 44% and the
 * screen is behind their shoulder; at 9:16 they occupy 79% and it is a
 * sliver.
 *
 * NOTHING IS BROKEN THERE. The rect is drawn exactly where it says. The
 * set element the viewer is meant to see is simply behind the person,
 * which is a sentence about meaning rather than about geometry.
 *
 * AND THE ANSWER IS NOT FOUR LAYOUTS. "If 9:16 move it left, if 1:1
 * shrink it" is a table that grows by one row per shape anybody ever
 * ships in, each tuned by hand and each able to be wrong on its own.
 * One relationship, resolved against the frame in front of it, is the
 * thing the scene exists to hold.
 */
export interface Placement {
  /** What it stands next to. One relation for now; the shape allows more. */
  relation: 'beside-performer';
  /** Which side of them. */
  side: 'left' | 'right';
  /**
   * The least clear frame it needs beside them to be worth placing.
   *
   * NOT the gap it keeps — that is whatever it was drawn with, and is
   * preserved. This is the floor below which there is no point: a
   * screen with two hundredths of a frame to live in is not a screen.
   */
  clearance: number;
  /**
   * What to do when the room runs out.
   *
   * `keep` holds its authored width and is dropped when it will not
   * fit; `shrink` narrows into whatever is left until it reaches
   * `atLeast`.
   */
  scale: 'keep' | 'shrink';
  /**
   * Narrower than this and it is not worth drawing.
   *
   * A set element squeezed to a stripe is not a smaller version of
   * itself, it is a mark nobody can read. Dropping it is the honest
   * outcome: the set adapts to the frame rather than littering it.
   */
  atLeast: number;
}

/** Where in the frame a piece is drawn relative to the people. */
export function inFront(piece: Piece): boolean {
  return piece.kind === 'desk';
}

export interface VirtualSet {
  id: string;
  label: string;
  /** What it is for, so a person choosing one is not guessing. */
  says: string;
  /** The room behind it all, from `SPACE_LOOKS`. A set is not a new space. */
  spaceId: string;
  /**
   * Where the people go, by count.
   *
   * A LAYOUT ID PER HEAD COUNT, not a list of rectangles: `LAYOUTS` is the
   * composition engine and its rects are the same ones `render/compose.ts`
   * gives ffmpeg. A set that carried its own geometry would be a second
   * answer to "where does the second person go", and the two would differ
   * in an export. [D-19]
   */
  positions: Record<number, string>;
  furniture: readonly Piece[];
  /** Where the station's mark belongs in this scene. */
  logo: Rect;
  /**
   * The strip the lower third owns.
   *
   * `marksFor` places a lower third by CORNER, which is right for a set
   * that is somebody's own room and wrong for one with a desk in it — a
   * name sitting on the desk's front edge is a name nobody can read. A
   * set names the region instead, and the identity honours it.
   */
  lowerThird: Rect;
  /**
   * How the people are lit to sit in this room, −1..1.
   *
   * Part of the SET rather than of the person, because it is a property of
   * where they are standing: a concert stage is dark and a news studio is
   * flat and bright, and a presenter who looks right in one looks wrong in
   * the other. A person's own lighting adjustment is added to it. [§26 D]
   */
  light: number;
}

/* ------------------------------------------------------------------------ *
 *  The sets.
 * ------------------------------------------------------------------------ */

/** The station's ink, where a set wants a piece in the channel's colour. */
const INK = '#2a3340';

export const VIRTUAL_SETS: readonly VirtualSet[] = [
  {
    id: 'news_desk',
    label: 'News Desk',
    says: 'One or two people behind a desk. The shape of a bulletin.',
    spaceId: 'modern_room',
    positions: { 1: 'performance_full', 2: 'performance_half' },
    furniture: [
      { kind: 'band', rect: { x: 0, y: 0.58, w: 1, h: 0.04 }, face: INK },
      {
        kind: 'screen', rect: { x: 0.56, y: 0.12, w: 0.4, h: 0.4 },
        /* Authored right of a presenter who filled a quarter of a
           16:9 frame. The relationship is what it meant. [S-40] */
        placement: { relation: 'beside-performer', side: 'right',
          clearance: 0.02, scale: 'shrink', atLeast: 0.12 },
        frame: '#151a22', glass: '#1d2733',
      },
      {
        kind: 'desk', rect: { x: 0, y: 0.72, w: 1, h: 0.28 },
        face: '#1a222c', top: '#2c3947',
      },
    ],
    logo: { x: 0.04, y: 0.06, w: 0.22, h: 0.08 },
    lowerThird: { x: 0.05, y: 0.6, w: 0.5, h: 0.1 },
    /* A news studio is flat and bright, and a face lit for a bedroom is
       half a stop under it. */
    light: 0.18,
  },
  {
    id: 'talk_show',
    label: 'Talk Show',
    says: 'A host and up to three guests, no desk between them.',
    spaceId: 'recording_studio',
    positions: {
      1: 'performance_full', 2: 'performance_half',
      3: 'performance_thirds', 4: 'performance_quad',
    },
    furniture: [
      { kind: 'riser', rect: { x: 0, y: 0.84, w: 1, h: 0.16 }, face: '#12181f' },
      {
        kind: 'screen', rect: { x: 0.06, y: 0.08, w: 0.26, h: 0.3 },
        placement: { relation: 'beside-performer', side: 'left',
          clearance: 0.02, scale: 'shrink', atLeast: 0.1 },
        frame: '#151a22', glass: '#1b2430',
      },
      {
        kind: 'screen', rect: { x: 0.68, y: 0.08, w: 0.26, h: 0.3 },
        placement: { relation: 'beside-performer', side: 'right',
          clearance: 0.02, scale: 'shrink', atLeast: 0.1 },
        frame: '#151a22', glass: '#1b2430',
      },
    ],
    logo: { x: 0.39, y: 0.05, w: 0.22, h: 0.07 },
    lowerThird: { x: 0.05, y: 0.76, w: 0.55, h: 0.1 },
    light: 0.08,
  },
  {
    id: 'stage',
    label: 'Stage',
    says: 'A performance, lit from above. No furniture in the way.',
    spaceId: 'concert_stage',
    positions: {
      1: 'performance_full', 2: 'performance_half',
      3: 'performance_thirds', 4: 'performance_quad',
    },
    furniture: [
      { kind: 'riser', rect: { x: 0.1, y: 0.86, w: 0.8, h: 0.14 }, face: '#0a0710' },
    ],
    logo: { x: 0.78, y: 0.05, w: 0.18, h: 0.06 },
    lowerThird: { x: 0.05, y: 0.78, w: 0.5, h: 0.1 },
    /* A stage is dark and the light comes from above and behind; a face
       carried in from a bright room has to come DOWN to belong in it. */
    light: -0.14,
  },
  {
    id: 'lecture',
    label: 'Lecture',
    says: 'One person beside a screen. What a talk looks like.',
    spaceId: 'university_hall',
    positions: { 1: 'performance_full', 2: 'performance_half' },
    furniture: [
      {
        kind: 'screen', rect: { x: 0.44, y: 0.12, w: 0.5, h: 0.52 },
        placement: { relation: 'beside-performer', side: 'right',
          clearance: 0.02, scale: 'shrink', atLeast: 0.14 },
        frame: '#100d0a', glass: '#1d1913',
      },
      {
        kind: 'desk', rect: { x: 0, y: 0.8, w: 0.42, h: 0.2 },
        face: '#241b12', top: '#3a2c1d',
      },
    ],
    logo: { x: 0.05, y: 0.06, w: 0.2, h: 0.07 },
    lowerThird: { x: 0.05, y: 0.66, w: 0.36, h: 0.1 },
    light: 0.1,
  },
];

export function setById(id: string | undefined): VirtualSet | null {
  return VIRTUAL_SETS.find((one) => one.id === id) ?? null;
}

/**
 * Which arrangement this set puts this many people in.
 *
 * FALLING BACK RATHER THAN REFUSING. A News Desk is drawn for one or two,
 * and a third guest arriving mid-programme must not black the picture
 * out: the set keeps its furniture and the people are arranged by the
 * largest count it knows. A set that could only ever hold its own number
 * would be a set nobody dares switch to while on air.
 */
export function arrangementIn(set: VirtualSet, count: number): string {
  /*
   * ONE LINE, NOT THREE. A `Math.max(1, count)` clamp stood above this
   * and an exact-match fast path above that, and a mutation sweep
   * removed each of them without a single assertion noticing — because
   * the filter already returns the exact count when it exists, and
   * `?? known[0]` already answers for nobody. Two guards nothing can
   * observe, in a function whose whole job is to always answer.
   */
  const known = Object.keys(set.positions).map(Number).sort((a, b) => a - b);
  const under = known.filter((one) => one <= count).pop() ?? known[0]!;
  return set.positions[under]!;
}

/** How many people this set was drawn for. */
export function holds(set: VirtualSet): number {
  return Math.max(...Object.keys(set.positions).map(Number));
}

/**
 * HOW FAR THE GLASS SITS INSIDE THE BEZEL.  [CHANNEL §27, C-23]
 *
 * A monitor is a frame and a piece of glass, and until now only the
 * things that DREW one knew where the glass was — an inset worked out
 * inline, twice, in two renderers. They disagreed. The canvas took a
 * hundred-and-twenty-thousandths of the monitor's WIDTH and the
 * chain took four hundredths of its SMALLER SIDE, which on News
 * Desk's monitor at 1280×720 is six pixels against twelve. The same
 * screen, drawn with twice the bezel in an export as on the air.
 *
 * It mattered little while the glass was dark and empty. The moment
 * something is shown on it, it is the rectangle the picture has to
 * land in, and two answers is a shared screen sitting proud of its
 * own bezel in one of the two places.
 *
 * THE CHAIN'S RULE IS THE ONE KEPT, on its merits rather than its
 * seniority: a fraction of the SMALLER side gives a monitor the same
 * bezel whichever way round it is, where a fraction of the width
 * gives a wide one a thick frame and a tall one a thin one. The
 * control room moves to match the export, which is the direction this
 * disagreement has gone every time it has been measured.
 */
export const SCREEN_INSET = 0.04;

/** The glass of a monitor, in the pixels of a frame this size. */
export function glassOf(
  rect: Rect, frame: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const box = place(rect, frame);
  /* At least two pixels, because a bezel nobody can see is a monitor
     drawn as a rectangle of one colour — which is the thing `spaceArt`
     says a screen must not be. */
  const inset = Math.max(2, Math.round(Math.min(box.w, box.h) * SCREEN_INSET));
  return {
    x: box.x + inset, y: box.y + inset,
    /* Never negative: a monitor smaller than its own bezel has no
       glass, and a renderer handed a negative width draws backwards. */
    w: Math.max(0, box.w - inset * 2),
    h: Math.max(0, box.h - inset * 2),
  };
}

/** A rectangle in fractions, as pixels of a frame. */
export function place(
  rect: Rect, frame: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  return {
    x: rect.x * frame.w, y: rect.y * frame.h,
    w: rect.w * frame.w, h: rect.h * frame.h,
  };
}

/**
 * Is every set drawable by this product?
 *
 * A set naming a space `SPACE_LOOKS` has not got is a set the renderer
 * throws on, and it would throw at the moment somebody put it on air.
 */
export function unlightable(
  sets: readonly VirtualSet[] = VIRTUAL_SETS,
): string[] {
  /* Taking the list rather than closing over it, so the rule can be
     shown to bite on a set that names a room nobody has drawn — a
     predicate that can only ever be asked about correct input is a
     predicate no test can prove. */
  return sets.filter((one) => !SPACE_LOOKS[one.spaceId]).map((one) => one.id);
}
