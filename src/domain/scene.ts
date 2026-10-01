/**
 * One scene, told once.  [Doctrine STUDIO-TWO §4, S-34; CHANNEL §27; D-19]
 *
 *     Scene
 *     ├── background
 *     ├── horizon
 *     ├── floor plane
 *     ├── performer zone
 *     ├── perspective
 *     ├── depth
 *     ├── lighting
 *     └── foreground elements
 *
 * THAT DIAGRAM WAS NOT A SPECIFICATION FOR A NEW SYSTEM. Measured against
 * the code, it turned out to be a checklist against TWO systems that had
 * grown up on opposite sides of it:
 *
 *   `SPACE_LOOKS` is Studio Two's — eleven drawn rooms rendered
 *     server-side by ffmpeg, carrying the background, the horizon, the
 *     floor, the depth, the lighting and now the perspective; and
 *   `VIRTUAL_SETS` is Online TV's — four sets drawn on a browser canvas,
 *     carrying a `spaceId` that points INTO `SPACE_LOOKS`, plus the
 *     performer zone and the foreground elements.
 *
 * Seven of the eight fields existed. The gap was one missing field, now
 * built, and ONE SPLIT: two of the eight were reachable only from the
 * control room, so Studio Two had no way to know where a performer
 * belongs or what stands in front of them.
 *
 * WHAT THIS FILE IS, AND WHAT IT IS NOT. It is the shared scene TRUTH: one
 * description both surfaces can read. It is not shared rendering. The
 * server chain still draws a space with ffmpeg filters and the canvas
 * still draws a set with 2D passes, because those are two different jobs
 * on two different machines and merging them would be a rewrite in
 * exchange for nothing. Nothing here renders anything.
 *
 * IT IMPORTS BOTH AND NEITHER IMPORTS IT, which is the whole reason it is
 * its own file: `virtualSet.ts` already reads `environment.ts` for the
 * room behind a set, and putting the join in either of them would be a
 * cycle.
 */

import {
  type SpaceLook, GLOW_REACH, floorOf, lookFor, perspectiveOf,
} from './environment.js';
import {
  type Piece, type VirtualSet, glassOf, inFront, setById,
} from './virtualSet.js';

/**
 * Where a person belongs in this scene.
 *
 * THE SCENE'S SPATIAL REFERENCE, not a measurement of anybody. Nobody is
 * being placed at a pixel: this is what the room says about where its
 * ground is and where somebody standing on it would be looked at from,
 * which is the thing a compositor needs before it can judge whether a
 * person has been dropped in convincingly.
 */
export interface PerformerZone {
  /**
   * Where the ground under them is, as a fraction of frame height.
   *
   * Not the horizon: the horizon is where the floor STOPS, and a person
   * standing at the back wall is a person pressed against it. Halfway
   * down the visible floor is where somebody stands in a room.
   */
  standsAt: number;
  /**
   * Where a standing adult's eyes fall, as a fraction of frame height.
   *
   * THE HORIZON, AND THAT IS NOT A COINCIDENCE. The horizon in any
   * photograph sits at the height of the lens, so a person of roughly
   * the camera operator's height has their eyes ON it. It is the oldest
   * rule in staging a shot, it needs no new data, and it is the
   * reference the eyeline work will measure a real take against.
   *
   * Null where the scene has no horizon to speak of.
   */
  eyeline: number | null;
  /**
   * Which arrangement this scene puts this many people in.
   *
   * A layout id per head count, from the set. Empty for a plain drawn
   * room, which has an opinion about its floor and none about how many
   * people are standing on it.
   */
  positions: Readonly<Record<number, string>>;
  /**
   * HOW MUCH OF THE FRAME'S WIDTH A PERFORMER TAKES UP, at the shape the
   * sets were drawn for.  [S-38, S-40]
   *
   * The field S-38 found missing. The zone said where the ground is,
   * where the eyes are, and which arrangement holds N people — and
   * nothing about how much room a person needs, which is the one thing
   * every other element in the scene has to work around.
   *
   * Measured rather than guessed: a presenter shot 16:9 occupies about
   * a quarter of the width, which is what the four-shape render read
   * back and what the sets were drawn against.
   */
  occupies: number;
}

/**
 * The shape the sets were drawn for.
 *
 * Not a preference — a fact about the existing content. Every rect in
 * `VIRTUAL_SETS` was authored against a 16:9 control-room frame, so it
 * is the frame their numbers mean something in, and the one everything
 * else is resolved relative to.
 */
export const SET_REFERENCE_ASPECT = 16 / 9;

/**
 * A quarter of the width, which is what a presenter actually measured.
 *
 * S-38 rendered News Desk at four shapes and read the performer's span
 * off the pixels: 25% at 16:9. That is the number, not an estimate of
 * it.
 */
export const PERFORMER_OCCUPIES = 0.25;

/**
 * What that becomes in a frame of another shape.
 *
 * A TAKE IS COVER-FITTED INTO ITS PANEL, so a frame narrower than the
 * one the take was shot in crops the sides away and magnifies what is
 * left: the same person fills more of a narrower frame. That is not a
 * fault, it is what cover fitting is for — and it is why an element
 * authored at `x = 0.56` ends up behind somebody's shoulder.
 *
 * DERIVED, THEN CHECKED AGAINST THE PIXELS. The four shapes S-38
 * measured read 25%, 33%, 44% and 79%; this returns 0.250, 0.333, 0.444
 * and 0.789. The arithmetic was written to explain the measurement
 * rather than the measurement taken to confirm the arithmetic.
 *
 * A WIDER FRAME CHANGES NOTHING. Cover crops the top and bottom there,
 * not the sides, so the performer keeps the share of the width they
 * already had.
 */
export function occupiesAt(zone: PerformerZone, frameAspect: number): number {
  if (!Number.isFinite(frameAspect) || frameAspect <= 0) return zone.occupies;
  const magnified = Math.max(1, SET_REFERENCE_ASPECT / frameAspect);
  return Math.min(1, zone.occupies * magnified);
}

/** The eight fields, from wherever each of them already lived. */
export interface Scene {
  /** The set's id where there is one, otherwise the room's. */
  id: string;
  label: string;
  /** The wash, the light pool, the vignette and the grain. */
  background: SpaceLook;
  /**
   * Where the floor meets the wall, or the sea meets the sky.
   *
   * A band that reaches the bottom of the frame is the ground and a band
   * that does not is a horizon line, and BOTH are the horizon — which is
   * why this reads the band first and falls back to the derived floor.
   */
  horizon: number | null;
  floor: ReturnType<typeof floorOf>;
  perspective: ReturnType<typeof perspectiveOf>;
  depth: number;
  lighting: {
    glow: SpaceLook['glow'];
    /** How a set lights the people in it, −1..1. Zero for a plain room. */
    adjust: number;
  };
  performer: PerformerZone;
  /** Drawn over the people: the desk they sit behind. */
  foreground: readonly Piece[];
  /** Drawn under them: risers, screens, bands. */
  behind: readonly Piece[];
}

/**
 * Where the floor meets the wall, whichever way the space said it.
 *
 * `floorOf` answers null for a band that is a horizon LINE rather than
 * the ground — Beach's sea line — because there is no floor plane to
 * draw there. There is still a horizon, and the eyeline depends on it,
 * so this asks the question the other way round.
 */
export function horizonOf(look: SpaceLook): number | null {
  if (look.band) return look.band.y;
  return floorOf(look)?.y ?? null;
}

/**
 * The scene, from a room and the set standing in it.
 *
 * Takes the resolved look and set rather than ids, so it is pure and a
 * test can hand it a room that does not exist in the shelf. `sceneFor`
 * below is the version that resolves.
 */
export function sceneOf(
  look: SpaceLook, set?: VirtualSet | null,
  /**
   * Where the performer's eyes actually are, where that was measured.
   *
   * THE MATCH THE BRIEF ASKED FOR, and it moves the ROOM rather than the
   * person. The horizon in a photograph sits at the height of the lens,
   * so a person whose eyes are on the drawn horizon is standing in that
   * room and one whose eyes float above it is standing in front of a
   * picture of it. Of the two things that could move, the drawn room is
   * the one nobody recorded.
   *
   * Absent until a take has been measured, and then the room keeps the
   * horizon its own depth gives it — which is where every scene stood
   * before this existed.
   */
  eyeline?: number | null,
): Scene {
  const horizon = eyeline ?? horizonOf(look);
  const furniture = set?.furniture ?? [];
  return {
    id: set?.id ?? look.id,
    label: set?.label ?? look.label,
    background: look,
    horizon,
    /*
     * AND THE FLOOR FOLLOWS THE HORIZON IT WAS MOVED TO. A room whose
     * eyeline was matched to the performer and whose floor stayed where
     * the depth put it would have two horizons — the one the eyes sit
     * on and the one the ground meets — which is worse than either
     * alone, because the eye believes the ground.
     */
    floor: moved(floorOf(look), horizon),
    perspective: moved(perspectiveOf(look), horizon),
    depth: look.depth,
    lighting: { glow: look.glow, adjust: set?.light ?? 0 },
    performer: {
      occupies: PERFORMER_OCCUPIES,
      /* Halfway down the visible floor: at the horizon they are against
         the back wall, and at the bottom edge they are in the lens. */
      standsAt: horizon === null ? 0.9 : horizon + (1 - horizon) * 0.5,
      eyeline: horizon,
      positions: set?.positions ?? {},
    },
    foreground: furniture.filter(inFront),
    behind: furniture.filter((one) => !inFront(one)),
  };
}

/**
 * The same, from the ids a document actually stores.
 *
 * A set names its own room, so naming both is allowed and the set wins —
 * which is the rule the control room already follows when an identity
 * carries a `setId` and a `spaceId` at once. An unknown set is no set
 * rather than an error, because `setIdentity` already refuses to store
 * one and a renderer refusing a second time would take a channel off the
 * air over a word nobody can see.
 */
export function sceneFor(
  { spaceId, setId, eyeline }: {
    spaceId?: string; setId?: string; eyeline?: number | null;
  },
): Scene | null {
  const set = setById(setId);
  const roomId = set?.spaceId ?? spaceId;
  if (!roomId) return null;
  try {
    return sceneOf(lookFor(roomId), set, eyeline);
  } catch {
    return null;
  }
}


/** The same plane, told to meet the wall somewhere else. */
function moved<T extends { y: number } | { horizon: number } | null>(
  plane: T, horizon: number | null,
): T {
  if (!plane || horizon === null) return plane;
  if ('y' in plane) return { ...plane, y: horizon };
  return { ...plane, horizon };
}

/* ------------------------------------------------------------------------ *
 *  Resolving a scene for the frame in front of it.  [S-38, S-40]
 * ------------------------------------------------------------------------ */

/**
 * The pieces of a scene, placed for THIS frame.
 *
 * *"Describe where an element belongs in the scene, not where it
 * happened to be drawn in one frame."*
 *
 * A piece with no `placement` is returned exactly as authored, which is
 * every piece that existed before this and every piece that genuinely
 * is a fact about the frame — a band across the bottom, a riser on the
 * floor. Only an element whose meaning is "beside the presenter" has a
 * relationship to resolve.
 *
 * THE PERFORMER IS TAKEN AS CENTRED, because that is what a layout with
 * one person in it does and what the four-shape measurement read back:
 * 0.38–0.62 at 16:9, 0.11–0.89 at 9:16, centred on 0.5 in both. A
 * layout that moves somebody off centre would hand its own box in; that
 * is the next relation to add, not a reason to invent one now.
 *
 * AND A PIECE THAT WILL NOT FIT IS DROPPED. A set element squeezed to a
 * stripe is not a smaller version of itself, it is a mark nobody can
 * read. The set adapting to the frame is the honest outcome; littering
 * it is not.
 */
export function placedFor(
  scene: Scene, pieces: readonly Piece[], frameAspect: number,
): Piece[] {
  const now = occupiesAt(scene.performer, frameAspect);
  const was = scene.performer.occupies;

  const out: Piece[] = [];
  for (const piece of pieces) {
    const how = 'placement' in piece ? piece.placement : undefined;
    if (!how) { out.push(piece); continue; }

    /*
     * THE GAP IT WAS DRAWN WITH IS THE RELATIONSHIP, and it is kept.
     *
     * News Desk's screen was authored at x 0.56 beside a presenter
     * whose right edge is 0.625 — so it was drawn SIXTY-FIVE
     * THOUSANDTHS BEHIND their shoulder, on purpose, because a set
     * element tucked slightly behind somebody reads as a room and one
     * held at arm's length reads as a diagram.
     *
     * A first version pushed every piece fully clear of the performer
     * and moved that screen to 0.65 at 16:9 — correcting the one frame
     * the sets were actually drawn for. The relationship was already
     * right there; what changes is only how far the performer's edge
     * has travelled since.
     */
    const edgeWas = how.side === 'right' ? 0.5 + was / 2 : 0.5 - was / 2;
    const edgeNow = how.side === 'right' ? 0.5 + now / 2 : 0.5 - now / 2;
    const gap = how.side === 'right'
      ? piece.rect.x - edgeWas
      : edgeWas - (piece.rect.x + piece.rect.w);

    /* What is left of the frame on that side once they have it. */
    const room = how.side === 'right' ? 1 - (edgeNow + gap) : edgeNow - gap;
    if (room < how.clearance) continue;

    const wide = how.scale === 'shrink'
      ? Math.min(piece.rect.w, room) : piece.rect.w;
    if (wide > room || wide < how.atLeast) continue;

    const x = how.side === 'right'
      ? edgeNow + gap : edgeNow - gap - wide;
    out.push({ ...piece, rect: { ...piece.rect, x, w: wide } });
  }
  return out;
}

/* ------------------------------------------------------------------------ *
 *  The ground, in the pixels of one frame.  [S-41]
 * ------------------------------------------------------------------------ */

/**
 * Where a renderer puts the floor and the light running away down it.
 *
 * THE THIRD RENDERER IS WHY THIS EXISTS. `floorOf` and `perspectiveOf`
 * answer in fractions of the frame, which is right — a set works at
 * 1280×720 and at whatever an export asks for. Turning those fractions
 * into the strip of pixels a renderer actually fills was written once,
 * inside the ffmpeg chain, and the live canvas and the live shader were
 * both about to write it again. Three copies of one piece of arithmetic
 * is three chances to disagree about where the floor is, and the one
 * thing a floor must do is be in the same place in every picture of the
 * same room.
 *
 * AND IT READS THE SCENE, NOT THE ROOM, which is the bug that made this
 * worth doing rather than merely tidy. `sceneOf` moves the floor to a
 * measured eyeline — the whole point of S-37, so a performer's eyes sit
 * on the drawn horizon — and the chain called `floorOf(look)` for
 * itself and drew the floor back where the room's own depth had put it.
 * Concert Stage with an eyeline of 0.40 measured had its horizon moved
 * to 0.40 and its floor rendered at 0.86, every time. The measurement
 * was taken, stored, planned with, and thrown away one call from the
 * pixels.
 */
export interface GroundPlan {
  /** The top of the floor strip, in pixels down the frame. */
  top: number;
  /** How deep the strip is, in pixels. Never zero. */
  deep: number;
  /** Its colour where it meets the wall, and underfoot. */
  from: string;
  to: string;
  /**
   * The light running away to a point, or nothing.
   *
   * Null only where the room declares a floor and no perspective, which
   * `perspectiveOf` never does today — it is kept separate because the
   * two are separate questions and a room could answer one and not the
   * other.
   */
  vanish: {
    /** The point the floor runs to, in pixels. On the horizon. */
    at: { x: number; y: number };
    /**
     * The corner the light has fallen off to by.
     *
     * The near-left corner of the strip: closest to the lens and
     * furthest from the point. It is here rather than a radius because
     * that is the shape of the question — a gradient runs from
     * somewhere to somewhere — and because the ffmpeg side states both
     * ends and derives the radius itself.
     */
    faded: { x: number; y: number };
    /** How strongly it is screened on, 0..1. */
    converge: number;
  } | null;
}

/** How far the light reaches: the distance between the plan's two points. */
export function reachOf(vanish: NonNullable<GroundPlan['vanish']>): number {
  return Math.hypot(vanish.at.x - vanish.faded.x, vanish.at.y - vanish.faded.y);
}

/**
 * This scene's floor, in the pixels of a frame this size.
 *
 * Null where the scene has no ground — a sea line is a horizon and not
 * a plane, and six of the eleven rooms derive one only because `floorOf`
 * gives them one.
 *
 * ROUNDED HERE AND NOWHERE ELSE. A filter graph wants integers and a
 * canvas does not care, so rounding once in the shared answer is what
 * stops the two renderers landing a pixel apart on the same horizon.
 */
export function groundPlan(
  scene: Scene, width: number, height: number,
): GroundPlan | null {
  const ground = scene.floor;
  if (!ground) return null;
  const top = Math.round(ground.y * height);
  /* A floor that starts at the very bottom edge is no floor; one pixel
     is the least a gradient can be drawn in, and a renderer handed zero
     would be handed an empty picture to blend against. */
  const deep = Math.max(1, height - top);
  /*
   * THE SCENE'S PERSPECTIVE, AND A MUTATION THAT SURVIVES SAYING SO.
   *
   * Swapping this for `perspectiveOf(scene.background)` changes
   * nothing any test can see, and the honest reason is better than a
   * test invented to defend it: of the three fields a perspective
   * has, the scene moves only the HORIZON, and this reads the other
   * two. Where the ground meets the wall has already been answered by
   * the floor above, which is the same number and moved the same way.
   *
   * It stays as the scene's because reading the room here is the
   * exact bug this function was written to end, one field along.
   */
  const view = scene.perspective;
  return {
    top, deep, from: ground.from, to: ground.to,
    vanish: view ? {
      at: { x: Math.round(view.vanishX * width), y: 0 },
      faded: { x: 0, y: deep },
      converge: view.converge,
    } : null,
  };
}


/* ------------------------------------------------------------------------ *
 *  The lamp, in the pixels of one frame.  [S-41]
 * ------------------------------------------------------------------------ */

/**
 * The room's pool of light, where a renderer has to put it.
 *
 * THE SAME SHAPE AS `GroundPlan`, AND FOR THE SAME REASON: a circle
 * stated as its centre and a point on its edge, because one of the
 * three renderers draws a radial gradient by naming two points and the
 * other two draw it by naming a radius. Saying both here is cheaper
 * than each of them deriving the other's form, and it is what stopped
 * the floor from being in three places.
 */
export interface LampPlan {
  /** The lamp itself, in pixels. */
  at: { x: number; y: number };
  /**
   * A point exactly `reach` away from it, and a real pixel.
   *
   * THE "REAL PIXEL" IS THE WHOLE POINT. The chain used to name the
   * frame's corner, which is one past the last pixel in both axes, and
   * `gradients` handed an out-of-range coordinate returns a radius
   * with no relation to the geometry — 84 pixels for one room and 584
   * for another, from the same rule.
   */
  edge: { x: number; y: number };
  /** How far the light reaches, in pixels. */
  reach: number;
  colour: string;
  /** 0..1, how strongly it is screened over the wash. */
  strength: number;
}

/**
 * This room's lamp, in a frame this size.
 *
 * ALONG THE LONGER AXIS, AND AWAY FROM THE NEARER EDGE, which is not a
 * preference but the only choice that always works: the reach is three
 * tenths of the longer side, a lamp anywhere on that axis has at least
 * half of it less a pixel on one side, and half beats three tenths for
 * any frame wider than three pixels. So there is never a case to clamp
 * and never a reach that quietly came out smaller than it was told.
 */
export function lampOf(
  scene: Scene, width: number, height: number,
): LampPlan {
  const { glow } = scene.background;
  /*
   * AND THE LAMP ITSELF HAS TO BE A REAL PIXEL, which a test caught
   * and I had not thought of: a room is free to declare its glow at
   * the very edge, `Math.round(1 * 720)` is 720, and 720 is one past
   * the last row — the same off-the-end coordinate that made the
   * chain's radius meaningless, moved from the edge of the circle to
   * its centre.
   */
  const at = {
    x: Math.min(width - 1, Math.max(0, Math.round(glow.x * width))),
    y: Math.min(height - 1, Math.max(0, Math.round(glow.y * height))),
  };
  const reach = Math.max(1, Math.round(Math.max(width, height) * GLOW_REACH));
  const edge = width >= height
    ? { x: at.x * 2 <= width ? at.x + reach : at.x - reach, y: at.y }
    : { x: at.x, y: at.y * 2 <= height ? at.y + reach : at.y - reach };
  return { at, edge, reach, colour: glow.colour, strength: glow.strength };
}

/* ------------------------------------------------------------------------ *
 *  The monitors in a scene.  [CHANNEL §27, C-23]
 * ------------------------------------------------------------------------ */

/**
 * The glass of every monitor in this scene, placed for this frame.
 *
 * *"A screen in a set shows nothing."* It was drawn as a frame and a
 * pane of dark glass and nothing was ever put in it, which is the
 * oldest line on the channel's own owed list.
 *
 * WHERE, NOT WHETHER. This answers only where the glass is; what goes
 * on it is the mixer's business and the renderer's. Separating them is
 * what stops the answer being computed twice — the canvas fills the
 * glass with its gradient and the mixer draws a picture into the same
 * rectangle, and a monitor whose picture sits proud of its own bezel
 * is what two answers would look like.
 *
 * AND IT GOES THROUGH `placedFor`, so a monitor that moved for a
 * narrow frame takes its picture with it. That is the whole reason
 * this is here rather than read off the set: at 16:9 the authored rect
 * is the answer, and at 9:16 it is not. [S-40]
 */
export function screensIn(
  scene: Scene, width: number, height: number,
): { x: number; y: number; w: number; h: number }[] {
  const frame = { w: width, h: height };
  return placedFor(scene, scene.behind, width / Math.max(1, height))
    .filter((piece) => piece.kind === 'screen')
    .map((piece) => glassOf(piece.rect, frame));
  /*
   * AND NOTHING FILTERS OUT A MONITOR WITH NO GLASS, which a line here
   * used to do. A mutation removing it survived, and checking why
   * showed it was a guard against nothing twice over: `glassOf`
   * already clamps a pane to zero rather than negative, and drawing
   * into a rectangle of zero width is a no-op in both renderers. It
   * would take a monitor four pixels across — a broadcast canvas ten
   * pixels wide — to produce one at all. Deleted rather than defended,
   * which is the eighth of these.
   */
}
