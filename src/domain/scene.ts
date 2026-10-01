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
  type SpaceLook, floorOf, lookFor, perspectiveOf,
} from './environment.js';
import { type Piece, type VirtualSet, inFront, setById } from './virtualSet.js';

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
export function sceneOf(look: SpaceLook, set?: VirtualSet | null): Scene {
  const horizon = horizonOf(look);
  const furniture = set?.furniture ?? [];
  return {
    id: set?.id ?? look.id,
    label: set?.label ?? look.label,
    background: look,
    horizon,
    floor: floorOf(look),
    perspective: perspectiveOf(look),
    depth: look.depth,
    lighting: { glow: look.glow, adjust: set?.light ?? 0 },
    performer: {
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
  { spaceId, setId }: { spaceId?: string; setId?: string },
): Scene | null {
  const set = setById(setId);
  const roomId = set?.spaceId ?? spaceId;
  if (!roomId) return null;
  try {
    return sceneOf(lookFor(roomId), set);
  } catch {
    return null;
  }
}
