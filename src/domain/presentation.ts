/**
 * Presentation profiles: export targets, layouts, and the type→look mapping.
 *
 * Layouts are DATA, not branches in code (U-18). Adding a layout is authoring
 * an entry here, not writing a filter graph by hand.
 *
 * Type drives presentation (U-11). This is the mechanism by which a user who
 * only pressed the spacebar and spoke still gets a video that looks
 * deliberately art-directed — which is the difference between this product and
 * a screen recorder.
 */

import { HOUSE_FPS } from './time.js';
import type { InterventionType } from './document.js';

export interface ExportProfile {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  /** EBU R128 targets. Non-negotiable per INV-11. [Doctrine U-17] */
  loudnessLufs: number;
  truePeakDb: number;
}

export const EXPORT_PROFILES: Record<string, ExportProfile> = {
  youtube_16x9: { id: 'youtube_16x9', label: 'YouTube 16:9', width: 1920, height: 1080, fps: HOUSE_FPS, loudnessLufs: -14, truePeakDb: -1 },
  square_1x1:   { id: 'square_1x1',   label: 'Square 1:1',  width: 1080, height: 1080, fps: HOUSE_FPS, loudnessLufs: -14, truePeakDb: -1 },
  portrait_4x5: { id: 'portrait_4x5', label: 'Portrait 4:5', width: 1080, height: 1350, fps: HOUSE_FPS, loudnessLufs: -14, truePeakDb: -1 },
  vertical_9x16:{ id: 'vertical_9x16',label: 'Vertical 9:16',width: 1080, height: 1920, fps: HOUSE_FPS, loudnessLufs: -14, truePeakDb: -1 },
};

/**
 * The shape of a canvas, as a layout cares about it.  [Doctrine U-18, U-22]
 *
 * Four profiles, not four sets of layouts: what a composition needs to know
 * is whether it is being drawn wide, roughly square, tall, or very tall. 4:5
 * and 1:1 want the same arrangement as each other far more often than 4:5 and
 * 9:16 do, and binding a layout to a named profile would mean editing every
 * layout to add a format.
 */
export type AspectFamily = 'landscape' | 'square' | 'portrait' | 'tall';

export function aspectFamily(profile: ExportProfile): AspectFamily {
  const ratio = profile.width / profile.height;
  if (ratio >= 1.2) return 'landscape';
  if (ratio >= 0.9) return 'square';
  if (ratio >= 0.7) return 'portrait';
  return 'tall';
}

/** Normalised rect, 0–1 relative to canvas. Resolution independent. [U-12, U-18] */
export interface Rect { x: number; y: number; w: number; h: number }

export type LayerSource = 'source' | 'user' | 'still' | 'screen' | 'evidence';

export interface Layer {
  source: LayerSource;
  rect: Rect;
  fit: 'cover' | 'contain';
  z: number;
  /**
   * Crop the source to the part of it the response is about.  [U-12, U-22]
   *
   * A wide frame shown whole in a narrow panel is a letterboxed strip in which
   * the thing being discussed is a few pixels across. The author has already
   * said which part matters — they pointed at it, circled it, drew an arrow to
   * it — so a reframed panel follows the marks instead of showing everything
   * and hoping.
   *
   * Only reframes set this. On a wide canvas the whole picture is visible at a
   * useful size already, and cropping it would throw away context nobody asked
   * to lose.
   */
  followFocus?: boolean;
  /** Source audio ducks under the response where both are present. [U-17 §5] */
  duckDb?: number;
}

export interface Layout {
  id: string;
  label: string;
  layers: Layer[];
  /**
   * What fills the canvas behind the layers.
   *
   * Two 16:9 panels side by side inside a 16:9 frame cannot fill it, and flat
   * black bars are the difference between a video that looks composed and one
   * that looks cropped. A blurred, over-scaled source fills the space the way
   * an editor would.
   */
  backdrop?: 'black' | 'blur';
  /**
   * What this layout becomes on a canvas of another shape.  [U-18, U-22]
   *
   * A 16:9 arrangement reframed by scaling is the thing this exists to avoid:
   * `side_by_side` shrunk into 9:16 is two postage stamps with a band of
   * blur above and below them, and nobody watches it. A layout therefore
   * names what it turns into, and the planner reads it.
   *
   * Absent for a family means "this arrangement already works there".
   */
  reframe?: Partial<Record<AspectFamily, string>>;
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

export const LAYOUTS: Record<string, Layout> = {
  full_source: {
    id: 'full_source', label: 'Source full screen',
    layers: [{ source: 'source', rect: FULL, fit: 'cover', z: 0 }],
  },
  full_user: {
    id: 'full_user', label: 'You full screen',
    layers: [{ source: 'user', rect: FULL, fit: 'cover', z: 0 }],
    // A face fills any canvas. Nothing to rearrange.
  },
  pip: {
    id: 'pip', label: 'Picture in picture',
    layers: [
      { source: 'source', rect: FULL, fit: 'cover', z: 0, duckDb: -18 },
      { source: 'user', rect: { x: 0.68, y: 0.66, w: 0.28, h: 0.28 }, fit: 'cover', z: 1 },
    ],
    reframe: { square: 'stacked_square', portrait: 'stacked_portrait', tall: 'vertical_stack' },
  },
  side_by_side: {
    id: 'side_by_side', label: 'Side by side',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.25, w: 0.5, h: 0.5 }, fit: 'cover', z: 0, duckDb: -18 },
      { source: 'user', rect: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, fit: 'cover', z: 1 },
    ],
    /*
     * Side by side is the arrangement that breaks worst on a tall canvas, and
     * the one that reframes most naturally: what is beside becomes above.
     */
    reframe: { square: 'stacked_square', portrait: 'stacked_portrait', tall: 'vertical_stack' },
  },
  freeze_pip: {
    id: 'freeze_pip', label: 'Frozen frame with you',
    layers: [
      { source: 'still', rect: FULL, fit: 'cover', z: 0 },
      { source: 'user', rect: { x: 0.68, y: 0.66, w: 0.28, h: 0.28 }, fit: 'cover', z: 1 },
    ],
    reframe: { square: 'stacked_square', portrait: 'stacked_portrait', tall: 'vertical_stack' },
  },
  evidence_split: {
    id: 'evidence_split', label: 'Evidence and you',
    // Black, not blurred: this layout shows no frozen source frame to blur,
    // and a plain ground is the right setting for a document anyway.
    backdrop: 'black',
    layers: [
      { source: 'evidence', rect: { x: 0.02, y: 0.10, w: 0.62, h: 0.80 }, fit: 'contain', z: 0 },
      { source: 'user', rect: { x: 0.66, y: 0.30, w: 0.32, h: 0.32 }, fit: 'cover', z: 1 },
    ],
    reframe: { square: 'evidence_stack', portrait: 'evidence_stack', tall: 'evidence_stack' },
  },
  /**
   * The author is the speaker; the source is kept in view.  [U-18]
   *
   * The inverse of picture-in-picture, and a different rhetorical move: in
   * `pip` the source is still talking and the author is commenting over it;
   * here the author has the floor and the source is the thing being held up.
   */
  presenter_focus: {
    id: 'presenter_focus', label: 'You speaking, source alongside',
    backdrop: 'blur',
    layers: [
      { source: 'user', rect: { x: 0.02, y: 0.14, w: 0.62, h: 0.72 }, fit: 'cover', z: 1 },
      { source: 'source', rect: { x: 0.66, y: 0.32, w: 0.32, h: 0.36 }, fit: 'contain', z: 0, duckDb: -18 },
    ],
    reframe: { square: 'stacked_square', portrait: 'stacked_portrait', tall: 'presenter_tall' },
  },
  /**
   * Three panels: the moment, the moment frozen, and the author.  [U-18]
   *
   * For the response whose whole point is "look at this, while I tell you
   * what is in it" — the source carries on in the first panel while the
   * second holds the frame being discussed.
   */
  triptych: {
    id: 'triptych', label: 'Source, detail, and you',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0.005, y: 0.31, w: 0.33, h: 0.38 }, fit: 'contain', z: 0, duckDb: -18 },
      { source: 'still', rect: { x: 0.335, y: 0.31, w: 0.33, h: 0.38 }, fit: 'contain', z: 1 },
      { source: 'user', rect: { x: 0.665, y: 0.31, w: 0.33, h: 0.38 }, fit: 'cover', z: 2 },
    ],
    // Three panels across do not survive a tall canvas; two stacked do.
    reframe: { square: 'stacked_square', portrait: 'stacked_portrait', tall: 'vertical_stack' },
  },
  /*
   * The stacked family: what is beside becomes above.  [U-22 §3]
   *
   * One arrangement in three proportions, because a 9:16 story, a 4:5 feed
   * post and a 1:1 square want the same thing — the moment on top, the answer
   * underneath — in different amounts. The source panel follows the marks
   * (`followFocus`), which is what makes the meaning survive the reframe
   * rather than only the pixels.
   */
  vertical_stack: {
    id: 'vertical_stack', label: 'Stacked (vertical)',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.08, w: 1, h: 0.30 }, fit: 'contain', z: 0,
        duckDb: -18, followFocus: true },
      { source: 'user', rect: { x: 0, y: 0.40, w: 1, h: 0.34 }, fit: 'cover', z: 1 },
    ],
  },
  /** 4:5. Less tall, so both panels are larger and the gap is smaller. */
  stacked_portrait: {
    id: 'stacked_portrait', label: 'Stacked (portrait)',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.06, w: 1, h: 0.40 }, fit: 'contain', z: 0,
        duckDb: -18, followFocus: true },
      { source: 'user', rect: { x: 0, y: 0.50, w: 1, h: 0.44 }, fit: 'cover', z: 1 },
    ],
  },
  /** 1:1. Two halves, near enough. */
  stacked_square: {
    id: 'stacked_square', label: 'Stacked (square)',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.04, w: 1, h: 0.44 }, fit: 'contain', z: 0,
        duckDb: -18, followFocus: true },
      { source: 'user', rect: { x: 0, y: 0.52, w: 1, h: 0.44 }, fit: 'cover', z: 1 },
    ],
  },
  /**
   * Presenter focus, made tall: the speaker keeps the room, the source rides
   * above them rather than beside.
   */
  presenter_tall: {
    id: 'presenter_tall', label: 'You speaking (vertical)',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.06, w: 1, h: 0.24 }, fit: 'contain', z: 0,
        duckDb: -18, followFocus: true },
      { source: 'user', rect: { x: 0, y: 0.32, w: 1, h: 0.46 }, fit: 'cover', z: 1 },
    ],
  },
  /** A document needs height, so it takes the larger share. */
  evidence_stack: {
    id: 'evidence_stack', label: 'Evidence above you',
    backdrop: 'black',
    layers: [
      { source: 'evidence', rect: { x: 0.02, y: 0.04, w: 0.96, h: 0.52 }, fit: 'contain', z: 0 },
      { source: 'user', rect: { x: 0.10, y: 0.60, w: 0.80, h: 0.30 }, fit: 'cover', z: 1 },
    ],
  },
  /**
   * The source alone on a tall canvas.  [Doctrine U-22 §3]
   *
   * Contained rather than cropped: a 16:9 frame cropped to 9:16 loses most of
   * what is in it, and the lower third of a vertical clip belongs to the
   * captions anyway.
   */
  vertical_source: {
    id: 'vertical_source', label: 'Source (vertical)',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.20, w: 1, h: 0.36 }, fit: 'contain', z: 0 },
    ],
  },
  /** The response alone on a tall canvas: a face reads best large. */
  vertical_user: {
    id: 'vertical_user', label: 'You (vertical)',
    backdrop: 'black',
    layers: [
      { source: 'user', rect: { x: 0, y: 0.12, w: 1, h: 0.56 }, fit: 'cover', z: 0 },
    ],
  },
};

export type Transition = 'hard_cut' | 'soft_cut';

export interface TypePresentation {
  layoutId: string;
  /** Lower-third label. Tells the viewer what kind of move this is. [U-11] */
  lowerThird: string;
  accent: string;
  transition: Transition;
}

/** [Doctrine U-11] The table that turns "I pressed space and talked" into an edit. */
export const TYPE_PRESENTATION: Record<InterventionType, TypePresentation> = {
  explain:             { layoutId: 'full_user',   lowerThird: 'EXPLANATION',      accent: '#8A8F98', transition: 'soft_cut' },
  critique:            { layoutId: 'side_by_side',lowerThird: 'CRITIQUE',         accent: '#C2603C', transition: 'hard_cut' },
  correct:             { layoutId: 'freeze_pip',  lowerThird: 'CORRECTION',       accent: '#D94A38', transition: 'hard_cut' },
  context:             { layoutId: 'pip',         lowerThird: 'CONTEXT',          accent: '#3E7CA6', transition: 'soft_cut' },
  question:            { layoutId: 'full_user',   lowerThird: 'QUESTION',         accent: '#4A83B4', transition: 'soft_cut' },
  agree:               { layoutId: 'pip',         lowerThird: 'AGREED',           accent: '#4F8A5B', transition: 'soft_cut' },
  expand:              { layoutId: 'full_user',   lowerThird: 'FURTHER',          accent: '#8A8F98', transition: 'soft_cut' },
  fact_check:          { layoutId: 'freeze_pip',  lowerThird: 'FACT CHECK',       accent: '#C99A2E', transition: 'hard_cut' },
  counterargument:     { layoutId: 'side_by_side',lowerThird: 'COUNTERARGUMENT',  accent: '#B5553F', transition: 'hard_cut' },
  personal_experience: { layoutId: 'full_user',   lowerThird: 'MY EXPERIENCE',    accent: '#A9705A', transition: 'soft_cut' },
  teaching:            { layoutId: 'full_user',   lowerThird: 'TEACHING',         accent: '#3E7CA6', transition: 'soft_cut' },
};

export function layoutForType(type: InterventionType, override?: string): Layout {
  const id = override ?? TYPE_PRESENTATION[type].layoutId;
  const layout = LAYOUTS[id];
  if (!layout) throw new Error(`unknown layout: ${id}`);
  return layout;
}

/**
 * The layout, reframed for the canvas it is being drawn on.  [U-18, U-22 §3]
 *
 * The author composes once, on a wide canvas, and the same composition is
 * published in four shapes. Scaling it would be the "convert to vertical"
 * button this product exists to be better than: the arrangement has to change,
 * not just its size.
 *
 * The author's own choice is never overruled — an explicit layout that names a
 * reframe still gets it, because choosing "side by side" is choosing an
 * arrangement, and the tall form of that arrangement is stacked. What they do
 * not get is two postage stamps.
 */
export function layoutForProfile(
  type: InterventionType, override: string | undefined, profile: ExportProfile,
): Layout {
  const base = layoutForType(type, override);
  const family = aspectFamily(profile);
  if (family === 'landscape') return base;
  const reframedId = base.reframe?.[family];
  if (!reframedId) return base;
  const reframed = LAYOUTS[reframedId];
  if (!reframed) throw new Error(`unknown reframe: ${reframedId} (from ${base.id})`);
  return reframed;
}
