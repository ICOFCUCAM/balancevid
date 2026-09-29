/**
 * Taking the shake out of a take.
 * [MASTER-EDIT §5, §6, §8, §12 P2; Doctrine STUDIO-TWO §4, U-02, U-18, INV-02, INV-16]
 *
 * §6 lists stabilization among PowerDirector's capabilities and §5 lists it
 * among the things clicking a source take should allow. It is the last of
 * the three P2 items that change what the output actually looks like, and
 * the one most likely to be needed: a performance take is somebody holding
 * a phone, or a phone on a table somebody is singing next to.
 *
 * TWO PASSES, WHICH IS THE POINT. `vidstabdetect` walks the take and writes
 * down where every frame moved; `vidstabtransform` reads that back and
 * undoes it. Single-pass `deshake` exists and guesses from the frames it has
 * already seen, which means it cannot know that the camera is about to pan
 * and fights the pan for half a second before giving up. Measure, then act
 * — the same shape as `measureLoudnorm` before a master and `measureColour`
 * before a match. [U-02]
 *
 * IT CANNOT BE USED ON A MATTED TAKE, and that is a real constraint rather
 * than an omission. §4's background replacement keys the performer out by
 * DIFFERENCING the take against a still plate of the same room (INV-16).
 * Stabilizing moves the picture relative to that plate, so every edge in
 * the room lands somewhere the plate says is empty and the matte fills with
 * torn fringes. There is no ordering that saves it: stabilize first and the
 * plate no longer matches; matte first and the stabilizer is tracking a
 * performer against a background that is not moving with them.
 *
 * So the two are refused together, with the reason said out loud. An author
 * who wants both wants a plate shot through the same stabilization, which
 * is a different feature and is not this one.
 *
 * AND IT MUST NOT CHANGE THE FRAME COUNT. `vidstabtransform` does not — it
 * moves each frame's contents and keeps the frame — but "does not" is a
 * claim about a filter, and INV-02 is the invariant this whole product is
 * built on. The render test counts.
 */

export interface Stabilizer {
  id: string;
  label: string;
  /** What the take looks like, said the way an author would say it. */
  hint: string;
  /**
   * How much movement to look for, 1–10.
   *
   * Detection only: it sets how far the search goes, not how much is taken
   * out. Too low and a genuinely shaky take is measured as still.
   */
  shakiness: number;
  /**
   * How many frames either side the camera path is averaged over.
   *
   * THE ONE NUMBER THAT MATTERS. Small, and the result still trembles;
   * large, and a deliberate pan is treated as shake and fought — the
   * picture drifts back against the movement and then snaps. At thirty a
   * second, ten frames is a third of a second and thirty is a second.
   */
  smoothing: number;
}

export const STABILIZERS: Record<string, Stabilizer> = {
  gentle: {
    id: 'gentle', label: 'Gentle',
    hint: 'A phone on a table, or leaning on something. Keeps your framing.',
    shakiness: 4,
    smoothing: 10,
  },
  /*
   * STRONG IS NAMED FOR WHAT IT COSTS, as `heavy` is in the cleanups. A
   * second of smoothing takes out walking, and it also takes out a slow
   * deliberate push in — which the author will read as the product
   * ignoring them unless the row says what it does.
   */
  strong: {
    id: 'strong', label: 'Strong',
    hint: 'Handheld, or walking. Holds the frame still; a slow pan will fight it.',
    shakiness: 8,
    smoothing: 30,
  },
};

export const NO_STABILIZER = 'none';

export function stabilizerFor(id: string | undefined): Stabilizer | undefined {
  if (id === undefined || id === NO_STABILIZER) return undefined;
  return STABILIZERS[id];
}

export function isStabilizer(id: string): boolean {
  return Object.hasOwn(STABILIZERS, id);
}

/**
 * `optzoom=1`, and the reason is the black edges.
 *
 * Undoing a shake means moving each frame, which uncovers the edge of the
 * sensor. The two answers are to let the border show — a black tear along
 * one side that moves every frame, which no author would ship — or to zoom
 * in far enough that the uncovered strip falls outside the frame.
 *
 * `optzoom=1` works the zoom out from the transforms that were actually
 * measured, so a nearly-still take is barely cropped and a wild one is
 * cropped as much as it needs. A fixed zoom would have to be set for the
 * worst case and would throw away the framing of every steady take.
 */
export function detectArgs(stabilizer: Stabilizer, resultPath: string): string {
  return `vidstabdetect=shakiness=${stabilizer.shakiness}:accuracy=15`
    + `:result=${resultPath}`;
}

export function transformArgs(stabilizer: Stabilizer, inputPath: string): string {
  return `vidstabtransform=input=${inputPath}`
    + `:smoothing=${stabilizer.smoothing}:optzoom=1:interpol=bilinear`;
}
