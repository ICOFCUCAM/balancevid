/**
 * Where a performer's eyes are, measured once.
 * [Doctrine STUDIO-TWO §4, S-6, S-35; D-06]
 *
 *     Scene                      Take
 *       │                          │
 *       ├── horizon  ←── match ──→ eyeline
 *       │                          │
 *       └── the room's own         the person actually recorded
 *
 * WHY THIS IS THE LAST OF THE FOUR AND NOT THE FIRST. An eyeline is not a
 * property of a background and it is not a property of a person: it is the
 * RELATIONSHIP between them. There was nowhere to put it until the scene
 * existed and could state its own horizon, which S-35 did.
 *
 * THE HORIZON IN ANY PHOTOGRAPH SITS AT THE HEIGHT OF THE LENS. That is
 * why a scene's eyeline is simply its horizon, and it is why matching the
 * two is the whole trick: a person whose eyes sit on the drawn horizon is
 * a person standing in that room, and one whose eyes float above it is a
 * person standing in front of a picture of it.
 *
 * MEASURED ONCE, FROM THE TAKE, AND STORED. Not estimated per frame — S-6
 * rules that out and says why: a per-frame estimate flickers, and a
 * backdrop that moves against a still performer is worse than one that
 * never moved at all. A singer sways; where their eyes were when they
 * started is the number that places the room.
 *
 * NOTHING HERE TOUCHES A PIXEL. It takes a row profile — how much of each
 * row of the picture differs from the empty room — and does the
 * arithmetic, exactly as `noiseFrom` does for the plate. The ffmpeg side
 * is `src/render/eyeline.ts` and is four lines of filter.
 */

/** What the measurement found, in fractions of the frame. */
export interface Eyeline {
  /** Where their eyes are, 0 at the top of the frame. */
  at: number;
  /** The top of their head. */
  crown: number;
  /** Where the head ends and the shoulders begin. */
  chin: number;
  /**
   * How much of the frame they occupy, 0..1.
   *
   * NOT A CONFIDENCE SCORE DRESSED UP. It is one number the caller can
   * act on: a performer who fills a tenth of the frame was shot wide, and
   * a crown found in the top row means the measurement had no head to
   * find the top of.
   */
  covers: number;
}

/**
 * A row counts as the performer when this much of it differs.
 *
 * Low, because the row profile is already thresholded: a pixel is either
 * different from the empty room or it is not. This only has to tell a
 * row with a head in it from a row holding the odd stray pixel the matte
 * would erode away.
 */
export const ROW_FLOOR = 0.015;

/**
 * The shoulders are where the silhouette suddenly gets wider.
 *
 * A head is a narrow thing on top of a wide thing, and the step between
 * them is the clearest landmark a silhouette has — far clearer than
 * trying to find eyes, which at a probe resolution are a few pixels of
 * nothing in particular.
 */
export const SHOULDER_JUMP = 1.7;

/**
 * And it has to STAY wider, which is the part that took a mutation to find.
 *
 * This first looked for one row wider than the head so far, with a
 * comment claiming that beat comparing against the row above because
 * "hair and a collar both make a single row jump". A mutation swapping
 * the two rules survived — and checking why showed the comment was
 * false of BOTH of them: against a head of ten with one row of nineteen
 * in it, each rule called that row the shoulders and missed the real
 * ones eight rows further down.
 *
 * Shoulders are wide and stay wide. A collar, a headset band and a
 * hand raised past the face are one row, or two. Requiring the step to
 * hold for three rows of a hundred-and-twenty-row probe is what makes
 * the sentence above true rather than merely written down.
 */
export const SHOULDER_HOLDS = 3;

/**
 * Eyes sit halfway down the head.
 *
 * The oldest proportion in drawing a face, and true enough of everybody
 * that it beats any attempt to find an eye: the crown to the chin is the
 * head, and the eyes are the middle of it. The error this can make is a
 * few per cent of a head, which is a fraction of the distance it exists
 * to correct.
 */
export const EYES_DOWN_THE_HEAD = 0.5;

/**
 * Where the eyes are, from how much of each row is not the empty room.
 *
 * `rows[i]` is the count of pixels in row `i` that differ from the plate,
 * and `width` is how many pixels a row holds. Null when there is nothing
 * to measure, which is a real answer: an empty frame has no eyeline, and
 * inventing one would put a room's horizon through thin air.
 */
export function eyelineFrom(
  rows: ArrayLike<number>, width: number,
): Eyeline | null {
  const height = rows.length;
  if (height === 0 || width <= 0) return null;

  /* Every row that holds enough of a person to be one. */
  const floor = width * ROW_FLOOR;
  let crown = -1;
  let last = -1;
  let total = 0;
  for (let i = 0; i < height; i += 1) {
    const count = rows[i]!;
    if (count <= floor) continue;
    if (crown < 0) crown = i;
    last = i;
    total += count;
  }
  if (crown < 0) return null;

  /*
   * THE CHIN, FOUND BY THE SHOULDERS. Walking down from the crown, the
   * first row that is a good deal wider than the head has been so far
   * AND STAYS THAT WIDE is where the head stops. Both halves matter:
   * compared against the widest row seen rather than the row above so a
   * head that widens gently is not read as a step, and held for
   * `SHOULDER_HOLDS` rows so a collar is not read as one either.
   */
  let widest = rows[crown]!;
  let chin = -1;
  for (let i = crown + 1; i <= last; i += 1) {
    const count = rows[i]!;
    if (count > floor && count > widest * SHOULDER_JUMP) {
      /* And it has to hold. One row this wide is a collar or a raised
         hand; three in a row is a pair of shoulders. */
      let holds = true;
      for (let j = i; j < i + SHOULDER_HOLDS && holds; j += 1) {
        holds = j > last ? false : rows[j]! > widest * SHOULDER_JUMP;
      }
      if (holds) { chin = i; break; }
    }
    if (count > widest) widest = count;
  }
  /*
   * A SILHOUETTE WITH NO STEP IN IT is a head-and-shoulders shot cropped
   * above the shoulders, or somebody facing away, or a frame where the
   * person reaches the bottom edge. There is still a head and its top is
   * still known, so the head is taken as a seventh of the figure — the
   * proportion every drawing manual starts from — rather than refusing a
   * measurement over a landmark that was out of shot.
   */
  /* `last - crown + 1` rows, not `last - crown`: a figure occupying rows
     10 to 65 is fifty-six rows tall, and the distance between the two
     indices is fifty-five. */
  const headEnd = chin >= 0
    ? chin : crown + Math.max(1, (last - crown + 1) / 7);

  return {
    at: (crown + (headEnd - crown) * EYES_DOWN_THE_HEAD) / height,
    crown: crown / height,
    chin: headEnd / height,
    covers: total / (width * height),
  };
}
