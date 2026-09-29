/**
 * Making two takes look like they were shot on the same day.
 * [MASTER-EDIT §6, §8, §12 P2; Doctrine STUDIO-TWO §4, U-02, U-18, U-19]
 *
 * §6 lists colour matching among PowerDirector's professional capabilities
 * and §8 lists it among Studio Two's own, and in this product it matters
 * more than it does in a sequencer. A sequencer cuts between shots of
 * different scenes, where a change of light reads as a change of place. This
 * one cuts between takes of THE SAME PERFORMANCE — and a chorus that jumps
 * from warm to cool and back reads as a fault, because the viewer knows it
 * is one room and one song.
 *
 * A MATCH IS A COMPUTED LOOK, and that is the whole design. `EFFECT_LOOKS`
 * already describes a grade as four numbers — brightness, contrast,
 * saturation, warmth — and `effectChain` already renders those four numbers
 * as ffmpeg filters. A colour match produces exactly those four numbers from
 * two measurements instead of from a table. So there is no second grading
 * path, no second place for the two to disagree about what saturation means,
 * and a match composes with a named look for free. [D-19]
 *
 * MEASURED, NOT GUESSED. U-02's rule — the product measures rather than
 * assuming — is why this takes readings and not a slider. `signalstats` is
 * asked for the numbers over sampled frames of the real media, the same way
 * `measureLoudness` is asked before an export is normalised.
 *
 * AND THE CORRECTION IS BOUNDED, which is the part that stops it being a
 * damage machine. Matching a take shot in the dark to one shot by a window
 * needs more than a grade can honestly give; pushed to whatever the
 * arithmetic says, the result is a grey, noisy, magenta picture that the
 * author then has to discover is worse than not matching. The bounds are
 * what "as close as a grade can get" means, and `matchQuality` says out loud
 * when the answer was clipped so the interface can too. [U-19]
 */

/**
 * What a take's picture measures, over sampled frames.
 *
 * In `signalstats`' own units — 0–255 per plane, with 128 neutral on the two
 * chroma planes — because converting them to some tidier scale here would
 * mean a second definition of "neutral" living somewhere other than the
 * filter that produced the numbers.
 */
export interface ColourReading {
  /** Average luma. Brightness. */
  y: number;
  /** The luma spread between the low and high deciles. Contrast. */
  ySpread: number;
  /** Average blue-difference and red-difference. Together, the cast. */
  u: number;
  v: number;
  /** Average saturation, as `signalstats` reports it. */
  saturation: number;
  /** How many frames were looked at. Zero means nothing was measured. */
  frames: number;
}

/**
 * What a match asks the renderer to do, in `EffectLook`'s own vocabulary.
 *
 * AND THAT VOCABULARY IS NOT UNIFORM, WHICH COST A BLACK RENDER.
 * `effectChain` emits `brightness=${look.brightness - 1}` — because an
 * `EffectLook` states brightness as a MULTIPLIER-shaped number where 1 is
 * neutral (`lighting` is 1.06) — while contrast and saturation are passed
 * to `eq` unchanged, also 1-neutral, and warmth is an offset where ZERO is
 * neutral.
 *
 * The first version of this returned brightness as an offset, which is the
 * obvious reading of "how much brighter" and the one `eq` itself uses. A
 * match of +0.09 became `eq=brightness=-0.91` and the take rendered black.
 * Every domain test passed, because they compare the number this function
 * returns against arithmetic on the same convention.
 *
 * So: 1 is neutral here, as it is in the table this rides on. If the two
 * conventions are ever unified, it should be here and in `EFFECT_LOOKS`
 * together, and the render test below is what will say whether it worked.
 */
export interface ColourMatch {
  /** 1 is unchanged, as in `EffectLook`. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** An offset, where 0 is unchanged — also as in `EffectLook`. */
  warmth: number;
}

/**
 * HOW FAR A GRADE MAY BE PUSHED.
 *
 * Not arbitrary: each is roughly the point past which the correction stops
 * looking like the same camera and starts looking like a filter. A quarter
 * of full scale of brightness is about a stop and a half; contrast outside
 * 0.6–1.6 crushes or flattens; warmth past 0.15 tints the whites.
 *
 * A take that needs more than this cannot be matched by grading, and saying
 * so is more useful than doing it badly.
 */
export const MATCH_BOUNDS = {
  /** How far from 1 the brightness may go, either way. */
  brightness: 0.25,
  contrast: { min: 0.6, max: 1.6 },
  saturation: { min: 0.5, max: 2 },
  warmth: 0.15,
} as const;

/** Nothing measured, or measured as flat. */
export function isMeasured(reading: ColourReading | undefined): boolean {
  return reading !== undefined && reading.frames > 0;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The grade that takes `from` towards `to`.
 *
 * `null` when either side was never measured — an unmeasured match is not a
 * neutral match, it is a question that has not been asked, and returning a
 * no-op grade for it would make "we could not measure this" and "these two
 * already agree" the same answer.
 */
export function matchLook(
  from: ColourReading | undefined, to: ColourReading | undefined,
): ColourMatch | null {
  if (!isMeasured(from) || !isMeasured(to)) return null;
  const a = from!;
  const b = to!;

  /*
   * BRIGHTNESS AS A DIFFERENCE, CONTRAST AND SATURATION AS RATIOS, because
   * that is what `eq` does with each of them: brightness is added to the
   * normalised sample, contrast and saturation multiply around their
   * midpoints. Computing a ratio for brightness would be right about the
   * highlights and wrong about the shadows.
   */
  const brightness = 1 + clamp(
    (b.y - a.y) / 255, -MATCH_BOUNDS.brightness, MATCH_BOUNDS.brightness);

  /*
   * A FLAT TAKE HAS NO CONTRAST TO SCALE. A title card, a black frame, a
   * camera with the lens cap on: the spread is zero and the ratio is an
   * infinity that would come out of `eq` as a solid colour. Left at one,
   * which is the honest answer — there is nothing there to match.
   */
  const contrast = a.ySpread <= 1 ? 1 : clamp(
    b.ySpread / a.ySpread, MATCH_BOUNDS.contrast.min, MATCH_BOUNDS.contrast.max);

  const saturation = a.saturation <= 1 ? 1 : clamp(
    b.saturation / a.saturation,
    MATCH_BOUNDS.saturation.min, MATCH_BOUNDS.saturation.max);

  /*
   * WARMTH IS THE CAST, AND THE CAST IS THE TWO CHROMA AVERAGES MOVING IN
   * OPPOSITE DIRECTIONS. V carries red, U carries blue, so a warmer picture
   * is V up and U down. Taking half their difference rather than either one
   * alone means a take that is merely greener — both planes moving the same
   * way — is not mistaken for one that is cooler, which it is not.
   */
  const warmth = clamp(
    ((b.v - a.v) - (b.u - a.u)) / 2 / 255,
    -MATCH_BOUNDS.warmth, MATCH_BOUNDS.warmth);

  return { brightness, contrast, saturation, warmth };
}

/**
 * Whether the grade above is the whole answer or as much of it as fits.
 *
 * SAID OUT LOUD BECAUSE A CLIPPED MATCH LOOKS LIKE A BROKEN ONE. An author
 * who matches a take shot in the dark and sees it still darker than the
 * reference will conclude the feature does not work. Told that the two are
 * further apart than a grade can close, they know to relight, to pick a
 * different reference, or to accept it — which are the three real options.
 */
export function matchQuality(
  from: ColourReading | undefined, to: ColourReading | undefined,
): { matched: boolean; says: string } | null {
  const look = matchLook(from, to);
  if (!look) return null;
  const a = from!;
  const b = to!;
  const wanted = {
    brightness: 1 + (b.y - a.y) / 255,
    contrast: a.ySpread <= 1 ? 1 : b.ySpread / a.ySpread,
    saturation: a.saturation <= 1 ? 1 : b.saturation / a.saturation,
    warmth: ((b.v - a.v) - (b.u - a.u)) / 2 / 255,
  };
  /*
   * EVERY PHRASE IS AN ADJECTIVE, because they are joined into "needs to be
   * ___ and ___ than grading can make it". The first version said
   * "contrast" and "colour", which are the names of the controls rather
   * than descriptions of the picture, and produced "needs to be contrast
   * than grading can make it" in front of an author.
   */
  const clipped: string[] = [];
  const short = (a_: number, b_: number) => Math.abs(a_ - b_) > 0.001;
  if (short(wanted.brightness, look.brightness)) {
    clipped.push(wanted.brightness > look.brightness ? 'brighter' : 'darker');
  }
  if (short(wanted.contrast, look.contrast)) {
    clipped.push(wanted.contrast > look.contrast ? 'punchier' : 'flatter');
  }
  if (short(wanted.saturation, look.saturation)) {
    clipped.push(wanted.saturation > look.saturation ? 'more colourful' : 'paler');
  }
  if (short(wanted.warmth, look.warmth)) {
    clipped.push(wanted.warmth > look.warmth ? 'warmer' : 'cooler');
  }
  if (clipped.length === 0) {
    return { matched: true, says: 'matched' };
  }
  return {
    matched: false,
    says: `as close as a grade gets — this take needs to be `
      + `${clipped.join(' and ')} than grading can make it`,
  };
}
