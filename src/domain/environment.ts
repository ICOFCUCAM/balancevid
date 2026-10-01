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

/* ------------------------------------------------------------------------ *
 *  Measuring a plate.  [§4, CHANNEL §26]
 * ------------------------------------------------------------------------ */

/**
 * The size the picture is reduced to before its movement is counted.
 *
 * Small on purpose: what is being measured is how much the ROOM moves, and
 * at 160×90 a passing car still moves and a single hot pixel does not. It
 * also makes the count cheap enough to run in a browser between frames,
 * which is what let the control room measure a plate at all. [CHANNEL §26]
 */
export const PLATE_PROBE = { width: 160, height: 90 } as const;

/**
 * How many frames are averaged into the still, and counted for movement.
 *
 * Averaging is what makes the plate a picture of the ROOM rather than a
 * picture of one moment of the room's noise — differencing against a single
 * noisy frame puts that frame's noise into every matte for ever.
 */
export const PLATE_FRAMES = 16;

/**
 * The per-pixel movement, in levels of 255, at which a room cannot be matted.
 *
 * Chosen from what the numbers mean rather than from taste: a still camera on
 * a lit wall sits around 1–3, a phone in a dim room around 8–15, and by 20 the
 * picture moves as much with nobody in it as a person moving slowly does.
 */
export const UNUSABLE_NOISE_LEVELS = 20;

/**
 * How much the room moves on its own, from the sums of its grey frames.
 *
 * PER-PIXEL STANDARD DEVIATION OVER TIME, averaged over the picture. Taken
 * as a sum and a sum of squares so neither caller has to hold every frame in
 * memory, and pure so the ffmpeg path and the browser path cannot disagree
 * about whether a room can be matted — which they would, and the disagreement
 * would be a studio that promises a clean key and a render that does not
 * deliver one. [D-19]
 */
export function noiseFrom(
  sum: Float64Array | number[], sumSquares: Float64Array | number[],
  frames: number, pixels: number,
): { noise: number; quality: number } {
  if (frames < 2 || pixels < 1) return { noise: 1, quality: 0 };
  let totalDeviation = 0;
  for (let i = 0; i < pixels; i += 1) {
    const mean = sum[i]! / frames;
    /* Clamped at zero: floating-point subtraction of two close numbers can
       land a hair below it, and Math.sqrt of that is NaN in the average. */
    const variance = Math.max(0, sumSquares[i]! / frames - mean * mean);
    totalDeviation += Math.sqrt(variance);
  }
  const levels = totalDeviation / pixels;
  return {
    noise: levels / 255,
    quality: Math.max(0, Math.min(1, 1 - levels / UNUSABLE_NOISE_LEVELS)),
  };
}

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
  /**
   * HOW FAR THE BACK OF THE ROOM IS, 0..1.
   *
   * STORED RATHER THAN DERIVED, unlike the grounding, and for a reason
   * worth stating: everything `groundingFor` needs is implied by the
   * light and the walls, and this is not. A cathedral and a vocal booth
   * can be the same colour and the same brightness and be forty metres
   * apart in depth. Nothing already on this record knows that, so the
   * record has to say it.
   *
   * Required rather than optional, so a space added tomorrow has to
   * answer the question rather than silently being a cupboard. [D-19]
   */
  depth: number;
}

export const SPACE_LOOKS: Record<string, SpaceLook> = {
  recording_studio: {
    id: 'recording_studio', label: 'Recording Studio',
    /* a treated room with the walls close enough to touch */
    depth: 0.25,
    top: '0x1a1d24', bottom: '0x0b0d11',
    glow: { x: 0.5, y: 0.35, colour: '0x3a4a5e', strength: 0.55 },
    vignette: 0.9, grain: 12,
  },
  concert_stage: {
    id: 'concert_stage', label: 'Concert Stage',
    /* a hall that goes back further than the light reaches */
    depth: 0.85,
    top: '0x120a1e', bottom: '0x05030a',
    glow: { x: 0.5, y: 0.18, colour: '0x8a4fd0', strength: 0.8 },
    vignette: 1.1, grain: 16,
    band: { y: 0.86, height: 0.14, colour: '0x0a0710' },
  },
  modern_room: {
    id: 'modern_room', label: 'Modern Room',
    /* a room, and you can see where it ends */
    depth: 0.3,
    top: '0xe8e4dc', bottom: '0xc7c0b4',
    glow: { x: 0.28, y: 0.3, colour: '0xfffaf0', strength: 0.5 },
    vignette: 0.5, grain: 8,
    band: { y: 0.82, height: 0.18, colour: '0xa89c8a' },
  },
  university_hall: {
    id: 'university_hall', label: 'University Hall',
    /* a lecture hall seen from the front */
    depth: 0.7,
    top: '0x3a2f26', bottom: '0x1b1510',
    glow: { x: 0.5, y: 0.25, colour: '0xd8b877', strength: 0.45 },
    vignette: 0.95, grain: 10,
  },
  church: {
    id: 'church', label: 'Church',
    /* a nave is long, and that is most of what a nave is */
    depth: 0.9,
    top: '0x2b3550', bottom: '0x0e1220',
    glow: { x: 0.5, y: 0.2, colour: '0xf0d9a0', strength: 0.6 },
    vignette: 1.0, grain: 9,
  },
  theatre: {
    id: 'theatre', label: 'Theatre',
    /* an auditorium behind the lip */
    depth: 0.8,
    top: '0x3d0d14', bottom: '0x120406',
    glow: { x: 0.5, y: 0.3, colour: '0xc03a44', strength: 0.5 },
    vignette: 1.15, grain: 14,
  },
  beach: {
    id: 'beach', label: 'Beach',
    /* the horizon is the horizon */
    depth: 1,
    top: '0x7fc4e8', bottom: '0xe8d9b5',
    glow: { x: 0.72, y: 0.22, colour: '0xfff2cc', strength: 0.7 },
    vignette: 0.35, grain: 6,
    band: { y: 0.62, height: 0.06, colour: '0x2f7fa8' },
  },
  forest: {
    id: 'forest', label: 'Forest',
    /* trees close behind, and more of them beyond */
    depth: 0.6,
    top: '0x2c4a2a', bottom: '0x0f1c10',
    glow: { x: 0.4, y: 0.15, colour: '0xa8d08a', strength: 0.5 },
    vignette: 0.95, grain: 13,
  },
  city: {
    id: 'city', label: 'City',
    /* a skyline is as far as seeing goes */
    depth: 0.95,
    top: '0x1b2433', bottom: '0x080b12',
    glow: { x: 0.65, y: 0.55, colour: '0x5f8fd0', strength: 0.5 },
    vignette: 0.85, grain: 15,
    band: { y: 0.7, height: 0.3, colour: '0x101722' },
  },
  mountain: {
    id: 'mountain', label: 'Mountain',
    /* the far ridge */
    depth: 1,
    top: '0x8fb4d9', bottom: '0xcfd9e2',
    glow: { x: 0.35, y: 0.2, colour: '0xffffff', strength: 0.55 },
    vignette: 0.45, grain: 7,
    band: { y: 0.66, height: 0.34, colour: '0x6b7d92' },
  },
  night_studio: {
    id: 'night_studio', label: 'Night Studio',
    /* the same small room with the lights down */
    depth: 0.3,
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

/* ------------------------------------------------------------------------ *
 *  Standing in the room, rather than in front of a picture of it.
 *  [STUDIO-TWO §4, S-6; D-19, U-16]
 * ------------------------------------------------------------------------ */

/**
 * WHY A GOOD MATTE STILL LOOKS PASTED ON.
 *
 * The matte was never the problem. It is differenced against the room's own
 * measured noise, eroded, dilated twice and feathered, and the edge it
 * produces is clean. A clean edge is exactly what makes the composite look
 * wrong: nothing in a real room has one.
 *
 * TWO THINGS ARE MISSING AND BOTH ARE ABOUT LIGHT.
 *
 *   A person in a room is LIT BY THAT ROOM. Some of the wall's colour lands
 *     on the edge of their shoulder and their hair — that is what a camera
 *     records, and a cut-out has none of it, so their outline stays the
 *     colour of the room they were actually standing in. This is the single
 *     biggest reason a composite reads as a sticker.
 *   A person in a room STANDS ON SOMETHING. With no shadow they float, and
 *     the eye reads floating as fake long before it can say why.
 *
 * NEITHER IS A NEW CONTROL, AND THAT IS THE POINT. A "light wrap" slider is
 * a thing the operator has to understand, get wrong, and be blamed for. The
 * room already declares where its light is and how strong — `glow` — and how
 * bright its walls are. Everything below is DERIVED from that, so choosing
 * Concert Stage gets a concert stage's wrap and a concert stage's shadow
 * without anybody being asked a question about compositing.
 *
 * DERIVED RATHER THAN STORED, so it is deterministic and the shot cache
 * still means what it says, and so a space added tomorrow is grounded
 * correctly by existing. [U-16, D-19]
 */
export interface Grounding {
  /** 0..1 — how much of the room's own colour lands on their edge. */
  wrap: number;
  /** 0..1 — how dark the contact shadow is under them. */
  shadow: number;
  /** Where the shadow falls, as a fraction of the frame. Away from the light. */
  shadowX: number;
  shadowY: number;
  /** How soft it is, as a fraction of the frame's smaller side. */
  shadowBlur: number;
}

/** 0..1 for a `0xrrggbb`, by the usual luma weights. */
export function brightnessOf(hex: string): number {
  const n = Number.parseInt(hex.replace(/^0x/i, ''), 16);
  if (!Number.isFinite(n)) return 0.5;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function groundingFor(look: SpaceLook): Grounding {
  /* The walls and the light pool together: a dark stage with one hard
     spotlight throws less colour than a white room with a window. */
  const walls = (brightnessOf(look.top) + brightnessOf(look.bottom)) / 2;
  const lit = 0.5 * look.glow.strength + 0.5 * walls;

  /*
   * A CEILING ON BOTH, because this is a correction and not an effect.
   * Wrap past about a third starts eating the performer's own edge, and a
   * shadow past about half is a second person on the floor.
   */
  const wrap = Math.min(0.34, Math.max(0.08, 0.10 + 0.30 * lit));
  const shadow = Math.min(0.48, Math.max(0.12, 0.14 + 0.34 * look.glow.strength));

  /*
   * AND IT FALLS AWAY FROM THE LIGHT. The room already says where its
   * light pool is; a shadow that ignored that would contradict the very
   * backdrop it is drawn on. Light on the left throws the shadow right.
   */
  const shadowX = (0.5 - look.glow.x) * 0.12;
  /* Down, always: a light high in the room puts it under their feet, a
     low one stretches it out behind them. */
  const shadowY = 0.012 + 0.036 * look.glow.y;
  /* A contact shadow is soft. A sharp one is a cut-out of a cut-out. */
  const shadowBlur = 0.035;

  return { wrap, shadow, shadowX, shadowY, shadowBlur };
}

/**
 * How soft the back of the room is, in pixels of blur.
 * [STUDIO-TWO §4, S-6]
 *
 * A CAMERA FOCUSED ON A PERFORMER DOES NOT ALSO FOCUS ON THE WALL BEHIND
 * THEM, and the further back that wall is the less it does. Every drawn
 * space has been rendered pin-sharp from edge to edge, which is the one
 * thing no photograph of a room has ever looked like — and it is why
 * they read as wallpaper rather than as somewhere.
 *
 * SMALL, THOUGH. This is a backdrop, not a portrait lens wide open: a
 * cathedral blurred to a smear is a different error from a cathedral
 * blurred not at all, and the second one at least keeps the place
 * recognisable. A quarter of a percent of the frame at the far end.
 *
 * Expressed against the frame's smaller side, so the same room is the
 * same room at any output size. [D-06]
 */
export function defocusFor(look: SpaceLook, smallSide: number): number {
  const sigma = (0.0008 + 0.0042 * Math.min(1, Math.max(0, look.depth)))
    * smallSide;
  return Math.max(1, Math.round(sigma));
}

/**
 * A colour, further from the light.
 *
 * Used where one surface has to read as continuous with another and
 * further away — a floor receding from the horizon it meets. Mixing
 * towards black rather than reducing lightness keeps it the same colour,
 * which is what "the same floor, further off" means.
 */
export function darken(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace(/^0x/i, ''), 16);
  if (!Number.isFinite(n)) return hex;
  const keep = Math.min(1, Math.max(0, 1 - amount));
  const part = (shift: number) =>
    Math.round(((n >> shift) & 255) * keep).toString(16).padStart(2, '0');
  return `0x${part(16)}${part(8)}${part(0)}`;
}

/**
 * Does this space's band reach the bottom of the frame?
 *
 * A BAND IS TWO DIFFERENT THINGS and the record already tells them
 * apart without having been asked to. Beach's runs from 0.62 for six
 * hundredths of the frame: that is a sea line, a horizon, a rule across
 * the picture. Concert Stage's runs from 0.86 to the very bottom: that
 * is not a line, it is the FLOOR, and it has been drawn as a flat
 * stripe of one colour since the spaces were made.
 *
 * A floor that is one flat colour is the thing that makes a drawn room
 * look like a stage flat, because a real floor recedes.
 */
export function bandIsFloor(band: SpaceLook['band']): boolean {
  return band !== undefined && band.y + band.height > 0.99;
}

/**
 * The ground, and where it meets the wall.  [STUDIO-TWO §4, S-6]
 *
 * SIX OF THE ELEVEN SPACES HAD NO FLOOR AT ALL. Four declared a band
 * that reaches the bottom of the frame, which is a floor drawn as a flat
 * stripe; one declared a thin sea line; and the other six — Recording
 * Studio, University Hall, Church, Theatre, Forest, Night Studio — were
 * a wash, a light pool, a vignette and some grain. A cathedral rendered
 * as a brown gradient is not a cathedral, and no amount of grain makes
 * a gradient into a place.
 *
 * WHERE THE LINE GOES IS GEOMETRY, NOT TASTE. Stand close to a wall and
 * the line where it meets the floor is LOW in the frame: you see a lot
 * of wall and little ground. Stand at the back of a nave and it rises
 * towards the horizon. So the line follows `depth`, which is the one
 * thing the record already knows about how far away the back of the
 * room is.
 *
 * AND ITS COLOUR IS THE WALL'S, FURTHER FROM THE LIGHT. A floor painted
 * a colour nobody chose would be a second decision per space and six
 * chances to pick wrong; taking the wash's own lower colour and moving
 * it away from the light keeps every room one room. A space that wants
 * a floor of its own says so with a `band`, exactly as four already do.
 */
export function floorOf(look: SpaceLook): {
  y: number; from: string; to: string;
} | null {
  if (look.band) {
    /* A declared floor keeps its own colour; a declared LINE is a
       horizon and not the ground, and gets no floor from here. */
    return bandIsFloor(look.band)
      ? { y: look.band.y, from: look.band.colour,
        to: darken(look.band.colour, 0.45) }
      : null;
  }
  const depth = Math.min(1, Math.max(0, look.depth));
  /*
   * THE FAR EDGE CATCHES THE LIGHT AND THE NEAR EDGE DOES NOT.
   *
   * The first version darkened the wall's colour at both ends, which is
   * wrong in exactly the rooms that needed it most: darkening a
   * near-black concert hall by half gives another near-black, and the
   * floor was measurable and invisible. A floor is lit from ABOVE, so
   * where it meets the wall it picks up the room's own light, and it
   * falls away towards the camera. That is what makes the join read as
   * a join rather than as a slightly different black.
   *
   * Mixed towards the light's own colour, not towards white, so a
   * purple stage gets a purple floor and a candle-lit nave a warm one.
   */
  return {
    y: 0.74 + 0.12 * (1 - depth),
    from: mix(look.bottom, look.glow.colour, 0.16 + 0.22 * look.glow.strength),
    to: darken(look.bottom, 0.45),
  };
}

/**
 * Two colours, part of the way between.
 *
 * `t` of 0 is all of the first and 1 is all of the second. Per channel
 * and linear, which is not how light actually adds but is how every
 * other blend in this file behaves, and being consistent with the
 * neighbours matters more here than being right about gamma.
 */
export function mix(from: string, to: string, t: number): string {
  const a = Number.parseInt(from.replace(/^0x/i, ''), 16);
  const b = Number.parseInt(to.replace(/^0x/i, ''), 16);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return from;
  const k = Math.min(1, Math.max(0, t));
  const part = (shift: number) => {
    const one = (a >> shift) & 255;
    const two = (b >> shift) & 255;
    return Math.round(one + (two - one) * k).toString(16).padStart(2, '0');
  };
  return `0x${part(16)}${part(8)}${part(0)}`;
}

/**
 * For a picture somebody supplied, which declares no light of its own.
 *
 * THE COLOUR STILL COMES FROM THE PICTURE — the wrap is a blurred copy of
 * whatever is behind them, so a beach wraps sand and a cathedral wraps
 * stone without anybody measuring it. Only the STRENGTH is a guess here,
 * and it is a modest one: too little wrap looks like a sticker, and too
 * much looks like a halo, and of the two the sticker is the one that can
 * be fixed by supplying a better picture.
 */
export const SUPPLIED_GROUNDING: Grounding = {
  wrap: 0.18, shadow: 0.26, shadowX: 0, shadowY: 0.022, shadowBlur: 0.035,
};

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
  /*
   * MONOCHROME, not "black and white".  [§4]
   *
   * The one treatment that is a decision about the WHOLE picture rather than
   * a correction to it, which is why it belongs here and not among the
   * spaces: a black-and-white verse against colour choruses is an edit, and
   * cutting between the two is something a performance does. Contrast is
   * lifted with it because a desaturated picture reads flat — taking the
   * colour out and changing nothing else looks like a fault in the camera.
   */
  monochrome: {
    id: 'monochrome', label: 'Monochrome',
    hint: 'The colour taken out. For a verse that should feel older.',
    saturation: 0, contrast: 1.14,
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
