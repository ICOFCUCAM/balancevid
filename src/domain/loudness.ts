/**
 * Every programme at the same loudness.  [Doctrine CHANNEL §5, §10,
 * U-23, D-04, C-33]
 *
 *     Studio Two music video   -14.2 LUFS  →  gain  -8.8 dB
 *     Studio One conversation  -27.6 LUFS  →  gain  +4.6 dB
 *     a quiet phone recording  -41.0 LUFS  →  gain +12.0 dB (capped)
 *
 * THE AUDIT NAMED IT: *"Audio | Per-source meters and a master |
 * Per-source EQ, compression, ducking, loudness to −23 LUFS."* Of
 * those four, loudness is the one that is a REQUIREMENT rather than
 * a refinement — EBU R128 in Europe and ATSC A/85 in the United
 * States are law for broadcasters, and the complaint they exist to
 * answer is the one every viewer has: the adverts are louder than
 * the programme.
 *
 * AND THIS CHANNEL IS THE CASE THEY WERE WRITTEN FOR. It cuts
 * between a Studio Two music video, mastered loud the way music is,
 * and a Studio One conversation recorded on whatever microphone
 * somebody had. Those are ten decibels apart before anybody does
 * anything wrong, and the viewer reaches for the remote at the join.
 *
 * ──────────────────────────────────────────────────────────────────
 *
 * A STATIC GAIN PER ITEM, MEASURED ONCE. Not `loudnorm` on the way
 * out, which is the obvious thing and the wrong one: this engine
 * emits FOUR SECONDS at a time, and single-pass loudnorm over four
 * seconds normalises each segment to its own contents — so a quiet
 * passage is pushed up, the next segment's loud passage is pushed
 * down, and the programme audibly breathes at every segment
 * boundary. Dynamic normalisers do the same thing more smoothly and
 * are still a compressor nobody asked for on somebody's master.
 *
 * What a playout system actually does is measure the whole item
 * once, store one number, and apply it as a constant offset for as
 * long as that item plays. The dynamics of the mix survive
 * untouched; only its level moves. That is what this computes.
 *
 * IT IS PURE. Measuring is ffmpeg's job (U-23) and caching it is the
 * engine's; what the measurement MEANS is arithmetic with three
 * judgements in it, and those belong where they can be tested.
 */

/**
 * The house loudness.  [EBU R128]
 *
 * −23 LUFS, because this is a television channel and that is the
 * broadcast number. The streaming platforms normalise to about −14
 * for their own catalogues, and a channel that mastered to −14 would
 * be nine decibels hotter than every other channel a viewer has —
 * which is the behaviour R128 was written to stop, not to copy.
 *
 * ATSC A/85 says −24. One decibel is inside the tolerance either
 * standard allows, so one number serves both.
 */
export const TARGET_LUFS = -23;

/**
 * The highest a sample may reach after the gain.  [EBU R128 s.5]
 *
 * −1 dBTP, and it is TRUE peak rather than sample peak: a signal
 * that just touches 0 dBFS in the samples can overshoot it between
 * them, and every lossy codec downstream — the AAC in the house
 * format, and whatever each platform re-encodes to — reconstructs
 * those overshoots as clipping the original never had. One decibel
 * of headroom is what the standard asks for and what survives the
 * chain.
 */
export const CEILING_DBTP = -1;

/**
 * The most a quiet item may be lifted.
 *
 * TWELVE DECIBELS, because the gain is applied to EVERYTHING in the
 * file. A recording made at −41 LUFS is quiet because the microphone
 * was far away, and lifting it eighteen decibels to reach the target
 * lifts the room tone, the hiss and the hum by eighteen decibels
 * too. Past about twelve the noise is louder than the original
 * programme was, and the viewer prefers the quiet version.
 *
 * So a very quiet item stays quiet, deliberately, and the channel is
 * honest about it rather than pretending it fixed something.
 */
export const MOST_BOOST_DB = 12;

/**
 * Below this, there is nothing to normalise.
 *
 * `ebur128` reports −70 LUFS or lower for a gate that never opened —
 * a silent track, or one with nothing but noise under the gate. A
 * gain computed against that is a gain of forty-seven decibels
 * applied to silence, which is forty-seven decibels of hiss.
 */
export const SILENCE_LUFS = -60;

export interface Loudness {
  /** Integrated loudness over the whole item, LUFS. */
  lufs: number;
  /** The highest true peak in it, dBTP. */
  truePeak: number;
}

/**
 * How much to turn this item up or down, in decibels.
 *
 * THE PEAK WINS, which is the part worth stating plainly. A quiet
 * item that is also peaky cannot be both brought to −23 and kept
 * under −1 dBTP: the two constraints disagree, and the one that
 * must hold is the ceiling, because being two decibels quiet is a
 * thing a viewer does not notice and clipping is a thing they do.
 * So the gain is reduced until the peak fits, and the item plays
 * slightly under the target.
 *
 * The alternative — hold the loudness and limit the peaks — is a
 * limiter on somebody's master, which is the dynamics processing
 * this deliberately does not do.
 */
export function gainFor(
  measured: Loudness,
  { target = TARGET_LUFS, ceiling = CEILING_DBTP, mostBoost = MOST_BOOST_DB }:
  { target?: number; ceiling?: number; mostBoost?: number } = {},
): number {
  if (!Number.isFinite(measured.lufs) || measured.lufs <= SILENCE_LUFS) return 0;

  const wanted = target - measured.lufs;
  /* Never lift noise more than the programme is worth. */
  const bounded = Math.min(wanted, mostBoost);
  /* And never push a peak through the ceiling. */
  const room = Number.isFinite(measured.truePeak)
    ? ceiling - measured.truePeak : bounded;
  const gain = Math.min(bounded, room);

  /*
   * TURNING DOWN IS ALWAYS ALLOWED. A loud item is reduced by
   * whatever it takes — there is no floor on the cut, because
   * reducing a signal cannot introduce anything that was not
   * already in it. Only the lift is capped.
   */
  return Math.round(gain * 10) / 10;
}

/**
 * What the item will measure after the gain, so the engine can say so.
 *
 * REPORTED RATHER THAN ASSUMED. A capped item does not reach the
 * target, and an as-run or a control room that claimed it did would
 * be the product reporting its intention as its outcome — the same
 * mistake C-32 exists to correct one level up.
 */
export function afterGain(measured: Loudness, gain: number): Loudness {
  return { lufs: measured.lufs + gain, truePeak: measured.truePeak + gain };
}

/** Is this item at the house loudness, within the tolerance R128 allows? */
export function atTarget(lufs: number, target = TARGET_LUFS): boolean {
  return Math.abs(lufs - target) <= 1;
}

/**
 * The filter, or nothing when there is nothing to do.
 *
 * `volume` AND NOTHING ELSE. No compressor, no limiter, no dynamic
 * normaliser: this changes one number and leaves the mix alone,
 * which is the entire argument for measuring beforehand.
 *
 * Returning nothing for a zero gain matters more than it looks: the
 * engine builds a filter chain per piece four times a second, and a
 * `volume=0.0dB` in it is a decode and re-encode of audio that did
 * not need touching.
 */
export function volumeFilter(gain: number): string | null {
  if (!Number.isFinite(gain) || Math.abs(gain) < 0.1) return null;
  return `volume=${gain.toFixed(1)}dB`;
}
