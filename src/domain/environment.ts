/**
 * The environment, and the matte it needs.
 * [Doctrine STUDIO-TWO §4, S-6, D-16, INV-16]
 *
 * "You can record in your bedroom while the finished performance makes it look
 *  as though you are in a studio. And I would not permanently bake the
 *  background into the raw recording."
 *
 * The first half is the feature. The second half is the doctrine: the
 * environment is a FIELD of the take, the composited picture is a render of
 * it, and Bedroom → Studio is a re-plan rather than another afternoon of
 * singing.
 *
 * WHAT S-6 SAID WOULD DECIDE THIS, and was right about: the matte. A virtual
 * background is only as good as the separation between the performer and the
 * room, and a bad matte on a music video — a flickering edge, a hand that
 * disappears on the beat — is markedly worse than no background at all.
 *
 * SO THE MATTE IS MEASURED, NOT GUESSED. There is no segmentation model here
 * guessing where a person ends; there is a PLATE — three seconds of the room
 * with nobody in it — and everything that differs from the plate by more than
 * the room's own measured noise is the performer. That is an old technique and
 * it is chosen for three reasons:
 *
 *   1. It is exact where it is exact. A still camera and a plate give a matte
 *      with no per-frame guessing in it at all, which is the flicker S-6
 *      warned about, structurally absent.
 *   2. Its precondition is knowable IN ADVANCE and can be stated to the author
 *      before they record five takes: a room whose own noise is high will not
 *      matte well, and the answer is a light or a plainer wall.
 *   3. It fails honestly. When there is no plate there is no matte, and the
 *      product says so rather than shipping an approximation of somebody's
 *      silhouette.
 *
 * The cost is that the author must step out of shot for three seconds and the
 * camera must not move. That is a real cost, stated plainly in the studio,
 * and it buys a matte the product can be measured against.
 */

import type { AssetId } from './document.js';
import type { Environment, EnvironmentKind } from './performance.js';

/* ------------------------------------------------------------------------ *
 *  The plate.
 * ------------------------------------------------------------------------ */

/**
 * The room with nobody in it, measured.
 *
 * Belongs to the PERFORMANCE rather than to a take, because one plate serves
 * every take recorded in that room afterwards — and because re-plating (a
 * light changed, the camera knocked) is then one act rather than a property
 * of whichever take happened to be next.
 */
export interface RoomPlate {
  assetId: AssetId;
  /** What the author calls it, if anything: "Front room, lamp on". */
  label?: string;
  /**
   * How much a pixel moves when nothing in the room does, 0..1.
   *
   * MEASURED from the plate's own frames, and it is the number everything
   * else here rests on: the matte threshold is a multiple of it, so a noisy
   * camera gets a forgiving key and a clean one gets a tight one, without
   * anybody choosing a number.
   */
  noise: number;
  /**
   * How well a matte from this plate will hold up, 0..1. Measured.
   *
   * Shown to the author BEFORE they record, because if it is poor the answer
   * is a light or a different wall and that is worth knowing at take one
   * rather than after five. [S-6]
   */
  quality: number;
  width: number;
  height: number;
  capturedAt: string;
}

/**
 * Below this, a matte will flicker and the product says so.
 *
 * Not a refusal — the author may know something the measurement does not, and
 * a product that refuses on a number is a product that is wrong in public. It
 * is a warning with a reason attached. [S-6]
 */
export const MATTE_USABLE_QUALITY = 0.55;

/**
 * How many times the room's own noise a pixel must move to be a person.
 *
 * Three is the conventional answer for separating signal from noise and it is
 * the one used here: at three standard deviations the room's own shimmer is
 * essentially never mistaken for a performer, and a performer standing in
 * front of a wall the same colour as their shirt is the case no threshold
 * saves — which is what the measured quality is for.
 */
export const MATTE_NOISE_MULTIPLE = 3;

/** 0..255, for the luma threshold the render applies to the difference. */
export function matteThreshold(plate: RoomPlate): number {
  return Math.max(6, Math.min(96, Math.round(plate.noise * 255 * MATTE_NOISE_MULTIPLE)));
}

/**
 * How much the matte's edge is softened, in pixels of the panel.
 *
 * A hard-edged key looks cut out; a feather of a few pixels reads as depth.
 * Tied to the measured quality rather than fixed: a poorer key needs a softer
 * edge to hide what it got wrong, which is the one honest thing softness does.
 */
export function matteFeather(plate: RoomPlate): number {
  return plate.quality >= 0.8 ? 2 : plate.quality >= MATTE_USABLE_QUALITY ? 3 : 5;
}

/** Does this environment need the performer separated from the room? */
export function needsMatte(environment: Environment): boolean {
  return environment.kind !== 'original';
}

/** What to tell the author about a plate, in their language rather than ours. */
export function plateVerdict(plate: RoomPlate): { ok: boolean; text: string } {
  if (plate.quality >= 0.8) {
    return { ok: true, text: 'Clean separation. Backgrounds will hold up.' };
  }
  if (plate.quality >= MATTE_USABLE_QUALITY) {
    return {
      ok: true,
      text: 'Usable. Edges may soften where you move fast — more light on you '
        + 'than on the wall behind you is the fix.',
    };
  }
  return {
    ok: false,
    text: 'This room will not separate cleanly: the picture moves about as much '
      + 'when nobody is in it as it does when somebody is. More light, a plainer '
      + 'wall, or stay with the room you are in.',
  };
}

/* ------------------------------------------------------------------------ *
 *  The spaces.  [§4]
 * ------------------------------------------------------------------------ */

/**
 * A supplied space, as a recipe rather than a photograph.
 *
 * S-6 said the spaces are content the product ships and therefore each needs
 * a rights line of its own. BUILDING THEM DISSOLVED THAT PROBLEM: every space
 * here is DRAWN — two colours, a light, a vignette and some grain, evaluated
 * at the export's own resolution — so there is nothing to licence, nothing to
 * credit, and nothing that was somebody's photograph before it was a backdrop.
 *
 * The honest consequence, which the studio states: "Beach" is a stylised
 * backdrop in the colours of a beach, not a photograph of one. An author who
 * wants a real place behind them supplies their own picture (`custom`), and
 * that picture's rights are theirs — which is the same shape as U-01 and for
 * the same reason.
 */
export interface SpaceLook {
  id: string;
  label: string;
  /** The wash, top to bottom. */
  top: string;
  bottom: string;
  /** A light pool, as a fraction of the canvas. */
  glow: { x: number; y: number; colour: string; strength: number };
  /** How far the corners fall off. 0 is none. */
  vignette: number;
  /** Film grain, 0..40. A perfectly smooth backdrop reads as a screensaver. */
  grain: number;
  /** A band across the picture — a horizon, a stage lip, a balcony rail. */
  band?: { y: number; height: number; colour: string };
}

export const SPACE_LOOKS: Record<string, SpaceLook> = {
  recording_studio: {
    id: 'recording_studio', label: 'Recording Studio',
    top: '0x1a1d24', bottom: '0x0b0d11',
    glow: { x: 0.5, y: 0.35, colour: '0x3a4a5e', strength: 0.55 },
    vignette: 0.9, grain: 12,
  },
  concert_stage: {
    id: 'concert_stage', label: 'Concert Stage',
    top: '0x120a1e', bottom: '0x05030a',
    glow: { x: 0.5, y: 0.18, colour: '0x8a4fd0', strength: 0.8 },
    vignette: 1.1, grain: 16,
    band: { y: 0.86, height: 0.14, colour: '0x0a0710' },
  },
  modern_room: {
    id: 'modern_room', label: 'Modern Room',
    top: '0xe8e4dc', bottom: '0xc7c0b4',
    glow: { x: 0.28, y: 0.3, colour: '0xfffaf0', strength: 0.5 },
    vignette: 0.5, grain: 8,
    band: { y: 0.82, height: 0.18, colour: '0xa89c8a' },
  },
  university_hall: {
    id: 'university_hall', label: 'University Hall',
    top: '0x3a2f26', bottom: '0x1b1510',
    glow: { x: 0.5, y: 0.25, colour: '0xd8b877', strength: 0.45 },
    vignette: 0.95, grain: 10,
  },
  church: {
    id: 'church', label: 'Church',
    top: '0x2b3550', bottom: '0x0e1220',
    glow: { x: 0.5, y: 0.2, colour: '0xf0d9a0', strength: 0.6 },
    vignette: 1.0, grain: 9,
  },
  theatre: {
    id: 'theatre', label: 'Theatre',
    top: '0x3d0d14', bottom: '0x120406',
    glow: { x: 0.5, y: 0.3, colour: '0xc03a44', strength: 0.5 },
    vignette: 1.15, grain: 14,
  },
  beach: {
    id: 'beach', label: 'Beach',
    top: '0x7fc4e8', bottom: '0xe8d9b5',
    glow: { x: 0.72, y: 0.22, colour: '0xfff2cc', strength: 0.7 },
    vignette: 0.35, grain: 6,
    band: { y: 0.62, height: 0.06, colour: '0x2f7fa8' },
  },
  forest: {
    id: 'forest', label: 'Forest',
    top: '0x2c4a2a', bottom: '0x0f1c10',
    glow: { x: 0.4, y: 0.15, colour: '0xa8d08a', strength: 0.5 },
    vignette: 0.95, grain: 13,
  },
  city: {
    id: 'city', label: 'City',
    top: '0x1b2433', bottom: '0x080b12',
    glow: { x: 0.65, y: 0.55, colour: '0x5f8fd0', strength: 0.5 },
    vignette: 0.85, grain: 15,
    band: { y: 0.7, height: 0.3, colour: '0x101722' },
  },
  mountain: {
    id: 'mountain', label: 'Mountain',
    top: '0x8fb4d9', bottom: '0xcfd9e2',
    glow: { x: 0.35, y: 0.2, colour: '0xffffff', strength: 0.55 },
    vignette: 0.45, grain: 7,
    band: { y: 0.66, height: 0.34, colour: '0x6b7d92' },
  },
  night_studio: {
    id: 'night_studio', label: 'Night Studio',
    top: '0x0d1117', bottom: '0x05070a',
    glow: { x: 0.5, y: 0.4, colour: '0x2b5f8a', strength: 0.65 },
    vignette: 1.2, grain: 18,
  },
};

export function lookFor(spaceId: string | undefined): SpaceLook {
  const look = spaceId ? SPACE_LOOKS[spaceId] : undefined;
  if (!look) throw new Error(`unknown space: ${spaceId}`);
  return look;
}

/** Said in the studio, so nobody expects a photograph. [§4, S-6] */
export const SPACES_ARE_DRAWN =
  'The supplied spaces are drawn rather than photographed — stage lighting in '
  + 'the colours of the place, not a picture of it. For a real place behind '
  + 'you, use your own image.';

export const ENVIRONMENT_KINDS: readonly EnvironmentKind[] =
  ['original', 'blur', 'space', 'custom'];

/* ------------------------------------------------------------------------ *
 *  Treatments over the picture.  [Doctrine STUDIO-TWO §4, U-18]
 * ------------------------------------------------------------------------ */

/**
 * What an effect may do, as data rather than as a branch.
 *
 * The same discipline as the spaces above and as layouts (U-18): adding one is
 * a row, and the renderer never learns an effect's name. Each is a short
 * description of a grade, and the renderer turns it into filters — so the
 * table can be read by somebody deciding whether a look is worth having
 * without reading any ffmpeg.
 *
 * WHAT IS NOT HERE is a slider. These are checked looks, the same position
 * the caption styles take: a brightness control and a saturation control are
 * a way to produce a performance nobody can see, offered by the product that
 * composited it.
 */
export interface EffectLook {
  id: string;
  label: string;
  /** What it is for, in the author's language. */
  hint: string;
  /** Multipliers on the picture, 1 meaning unchanged. */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** Warmth, in the same units the space looks use: positive is warmer. */
  warmth?: number;
  /** A darkened edge, 0 for none. Sends the eye to the middle. */
  vignette?: number;
  /**
   * A bright pool over the performer, as a fraction of the panel's width.
   *
   * Distinct from the vignette rather than a stronger version of it: a
   * vignette darkens the edges of whatever is there, and a spotlight adds
   * light in one place. On a performance with a drawn space behind it the two
   * read completely differently.
   */
  spotlight?: number;
}

export const EFFECT_LOOKS: Record<string, EffectLook> = {
  lighting: {
    id: 'lighting', label: 'Lighting',
    hint: 'A key light on you and the edges pulled down. For a flat room.',
    brightness: 1.06, contrast: 1.12, vignette: 0.9,
  },
  colour: {
    id: 'colour', label: 'Colour',
    hint: 'Warmer and richer. For footage that came out grey.',
    contrast: 1.08, saturation: 1.22, warmth: 0.06,
  },
  spotlight: {
    id: 'spotlight', label: 'Spotlight',
    hint: 'A pool of light around you, the rest in shadow. For a stage.',
    brightness: 0.94, contrast: 1.1, vignette: 1.4, spotlight: 0.55,
  },
};

/**
 * The effect a take asks for, or nothing.
 *
 * Nothing is the answer for a take that asked for none AND for one naming an
 * effect this build does not have — a performance made against a look that
 * was later removed renders ungraded rather than refusing to render, because
 * the take is the work and the grade is a decision about it.
 */
export function effectFor(id: string | undefined): EffectLook | undefined {
  return id ? EFFECT_LOOKS[id] : undefined;
}
