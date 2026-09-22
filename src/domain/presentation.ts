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
  vertical_9x16:{ id: 'vertical_9x16',label: 'Vertical 9:16',width: 1080, height: 1920, fps: HOUSE_FPS, loudnessLufs: -14, truePeakDb: -1 },
};

/** Normalised rect, 0–1 relative to canvas. Resolution independent. [U-12, U-18] */
export interface Rect { x: number; y: number; w: number; h: number }

export type LayerSource = 'source' | 'user' | 'still' | 'screen' | 'evidence';

export interface Layer {
  source: LayerSource;
  rect: Rect;
  fit: 'cover' | 'contain';
  z: number;
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
  /** Each layout declares its own behaviour per aspect ratio. [U-18, U-22] */
  verticalLayoutId?: string;
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
    verticalLayoutId: 'full_user',
  },
  pip: {
    id: 'pip', label: 'Picture in picture',
    layers: [
      { source: 'source', rect: FULL, fit: 'cover', z: 0, duckDb: -18 },
      { source: 'user', rect: { x: 0.68, y: 0.66, w: 0.28, h: 0.28 }, fit: 'cover', z: 1 },
    ],
    verticalLayoutId: 'vertical_stack',
  },
  side_by_side: {
    id: 'side_by_side', label: 'Side by side',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.25, w: 0.5, h: 0.5 }, fit: 'cover', z: 0, duckDb: -18 },
      { source: 'user', rect: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, fit: 'cover', z: 1 },
    ],
    verticalLayoutId: 'vertical_stack',
  },
  freeze_pip: {
    id: 'freeze_pip', label: 'Frozen frame with you',
    layers: [
      { source: 'still', rect: FULL, fit: 'cover', z: 0 },
      { source: 'user', rect: { x: 0.68, y: 0.66, w: 0.28, h: 0.28 }, fit: 'cover', z: 1 },
    ],
    verticalLayoutId: 'vertical_stack',
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
    verticalLayoutId: 'vertical_stack',
  },
  vertical_stack: {
    id: 'vertical_stack', label: 'Stacked (vertical)',
    backdrop: 'blur',
    layers: [
      { source: 'source', rect: { x: 0, y: 0.08, w: 1, h: 0.30 }, fit: 'contain', z: 0, duckDb: -18 },
      { source: 'user', rect: { x: 0, y: 0.40, w: 1, h: 0.34 }, fit: 'cover', z: 1 },
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
