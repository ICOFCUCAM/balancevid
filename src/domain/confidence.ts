/**
 * Watching what actually went out.  [Doctrine CHANNEL §18, §11, §7, §6,
 * D-04, D-19, D-20]
 *
 *     the wire  →  /playlist  →  a <video> in the corner  →  sampled
 *                                                              │
 *                                              "black for 14 seconds"
 *
 * THE BLIND SPOT THIS CLOSES, in the audit's own words:
 *
 *   *"The control room looks fine — by design. Its monitor is the
 *   operator's own canvas, never the transmission (§7, so a presenter
 *   does not talk over themselves). It cannot show this fault."*
 *
 * C-24 was a channel transmitting four seconds of black, forever, while
 * every instrument in the building read healthy: segments were arriving,
 * the engine was beating, the schedule resolved, and the desk showed the
 * operator their own camera. Nothing in the product was looking at the
 * output. `playoutHealth` now catches the one cause we found — an ffmpeg
 * that cannot draw text — but it catches that cause and not the class.
 *
 * SO THE CLASS IS CAUGHT BY LOOKING. A confidence monitor is the oldest
 * instrument in a gallery and it is not a feature: it is the only thing
 * in a transmission chain that tests the chain END TO END, because it
 * reads the same bytes a viewer reads. Everything else in this codebase
 * asks a component whether it thinks it is working.
 *
 * AND LOOKING IS MEASURED, NOT EYEBALLED. An operator glancing at a small
 * muted picture in the corner of a busy desk will not notice that it has
 * been black for a minute — that is exactly the attention the fault
 * survived the first time. The picture is sampled, the samples are
 * judged here, and the judgement is a sentence.
 *
 * WHAT THIS IS NOT. It is not a second output path (§7, and the
 * instruction that *"Media Player should remain a source inside the
 * existing playout architecture, not become a workaround for the dark
 * screen"*). It writes nothing, encodes nothing and decides nothing
 * about what goes on air. It reads the published playlist, which is the
 * artefact the viewer already gets, and says what it sees.
 *
 * IT IS PURE. The sampling is a browser's job; what the samples MEAN is
 * a question about an array of numbers, and answering it inside a
 * component is answering it where nobody can test it.
 */

import type { OnAir } from './channel.js';
import {
  type EngineState, type StreamState, type Tone, healthSentence,
} from './health.js';

/**
 * How dark a frame has to be to count as black.
 *
 * MEAN LUMINANCE, 0–1, over the whole frame — measured on the RGB the
 * browser hands back, which is AFTER colour conversion. The first
 * version of this comment claimed the floor had to clear MPEG's
 * limited-range black at 16/255; that is a number in the YUV domain,
 * and by the time a decoded frame reaches a canvas it has been
 * expanded, so broadcast black arrives at RGB 0–4 (luma under 0.016)
 * rather than 0.063. Writing a threshold against the wrong colour
 * space would have put the floor above everything it was meant to
 * catch — a black-picture alarm that could not fire on a black
 * picture. The test that measures it is what said so.
 *
 * So 0.04 is roughly RGB 10, and what it sits between:
 *
 *   0.000  pure black
 *   0.016  decoded black with the noise a real encoder leaves
 *   0.034  the product's own darkest background, #07090c, bare
 *   ────── 0.04
 *   0.094  a dark grey picture
 *   0.112  that same background with a headline on it
 *
 * The bare slide below the line is correct and not a miss: a frame
 * with nothing on it IS a black picture. The same slide with a line
 * of type on it is comfortably above, which is the case that matters.
 */
export const BLACK_FLOOR = 0.04;

/**
 * How long black has to last before it is a fault rather than a cut.
 *
 * THREE SEGMENTS, which is the same patience `STREAM_STALE_MS` uses and
 * for the same reason: a channel is allowed to go to black between two
 * things. A dissolve through black, the gap at the end of a programme
 * and the moment an operator takes a source down are all black and all
 * correct, and an alarm that fired on them is an alarm nobody reads.
 * [D-04]
 */
export const BLACK_FOR_MS = 12_000;

/** How many samples to keep. Enough to cover the window, and no history. */
export const SAMPLES_KEPT = 24;

/**
 * How bright one frame is, 0–1, from its RGBA bytes.
 *
 * REC. 709 LUMA, not a plain average of the three channels. A channel
 * transmitting saturated blue is not black, and the flat average reads
 * it at a third of its brightness — close enough to the floor to raise
 * an alarm about a picture that is plainly there. The coefficients are
 * the ones every broadcast encoder uses, and the same ones the slide
 * renderer's contrast check uses, so the product has one idea of what
 * bright means.
 *
 * HERE RATHER THAN IN THE COMPONENT, because it is the only arithmetic
 * in this feature that can be wrong, and a loop over a pixel buffer
 * inside a React component is a loop nobody can test. The browser's
 * part — ask the video for a frame — is glue.
 */
export function meanLuma(rgba: ArrayLike<number>): number {
  /* No guard on an empty buffer: the loop does not run and the count
     below is already the answer. A length check here survived every
     mutation, which is what an unobservable guard does. */
  let sum = 0;
  let pixels = 0;
  for (let at = 0; at + 3 < rgba.length; at += 4) {
    sum += 0.2126 * rgba[at]! + 0.7152 * rgba[at + 1]!
      + 0.0722 * rgba[at + 2]!;
    pixels += 1;
  }
  return pixels === 0 ? 0 : sum / pixels / 255;
}

export interface Sample {
  /** Mean luminance of one frame, 0–1. */
  mean: number;
  /** When it was taken. */
  at: number;
}

/**
 * Drop what is older than the window, so the list cannot grow.
 *
 * A confidence monitor runs for the length of a broadcast. A list that
 * kept every sample would be a slow leak in the one component that must
 * still be working at hour nine.
 */
export function keep(samples: Sample[], now: number): Sample[] {
  const from = now - BLACK_FOR_MS * 2;
  return samples.filter((one) => one.at >= from).slice(-SAMPLES_KEPT);
}

export interface Picture {
  /** The newest sample's luminance, or null when nothing has been read. */
  mean: number | null;
  /** How long it has been continuously below the floor, in ms. */
  darkForMs: number;
  /** Long enough that it is a fault and not a cut. */
  black: boolean;
}

/**
 * What the samples say about the picture.
 *
 * THE RUN IS MEASURED FROM THE OLDEST UNBROKEN DARK SAMPLE, not counted
 * as a number of samples: the sampler's interval is a browser's
 * decision and a tab in the background is throttled to whatever the
 * browser feels like. Counting frames would make the alarm fire late on
 * a slow machine and early on a fast one, for the same picture.
 *
 * AND ONE BRIGHT FRAME ENDS IT. A picture that came back is a picture
 * that came back, and a run that survived an interruption would be an
 * alarm about the past.
 */
export function readPicture(samples: Sample[], now: number): Picture {
  const last = samples[samples.length - 1];
  if (!last) return { mean: null, darkForMs: 0, black: false };
  if (last.mean > BLACK_FLOOR) {
    return { mean: last.mean, darkForMs: 0, black: false };
  }
  let from = last.at;
  for (let at = samples.length - 1; at >= 0; at -= 1) {
    const one = samples[at]!;
    if (one.mean > BLACK_FLOOR) break;
    from = one.at;
  }
  /*
   * MEASURED TO NOW AND NOT TO THE LAST SAMPLE. If the sampler stopped
   * — a throttled tab, a stalled element — the picture has still been
   * black for however long it has been black, and stopping the clock
   * at the last reading would freeze the alarm just as the evidence
   * stopped arriving.
   */
  const darkForMs = Math.max(0, now - from);
  return { mean: last.mean, darkForMs, black: darkForMs >= BLACK_FOR_MS };
}

/**
 * Should there be a picture at all?  [§5, §6, D-04]
 *
 * OFF AIR IS BLACK ON PURPOSE, and `segment.ts` says so in its own
 * words: *"A channel with a hole in its schedule must still put four
 * seconds on the wire… Black and silence, generated — which is also
 * the honest picture: the channel has nothing to show and says so by
 * showing nothing."*
 *
 * So an off-air channel transmits black segments, continuously and
 * correctly, and an alarm that fired on them would fire on every gap
 * between two programmes. That is the exact mistake `whyDark` exists
 * to avoid: a correct state that looks like a fault is the one nobody
 * can diagnose, and an alarm nobody believes is an alarm nobody reads.
 *
 * Found by opening the monitor on a real channel and reading what it
 * said; it is not visible in the code, because the code that makes
 * that black lives in the other process.
 */
export function expectsPicture(on: OnAir): boolean {
  return on.kind !== 'off';
}

/**
 * The one line the confidence monitor shows. [§18, §6, D-04]
 *
 * THE ORDER IS THE SAME ARGUMENT `controlRoomNote` MAKES, and it has to
 * be, because the two sit on the same desk and must not describe one
 * condition two different ways. A process fault outranks a picture
 * fault: when the engine has stopped there is nothing to look at, and
 * saying "the transmission is black" about a stream nobody is writing
 * would be blaming the picture for the absence of a transmitter.
 *
 * THE LAST CASE IS WHY ANY OF THIS EXISTS. Engine running, segments
 * arriving, nothing in `playoutHealth` complaining — and the picture is
 * black. Every other instrument in the building says that channel is
 * perfect. This is the only one that can say otherwise, and what it
 * says is the fault C-24 took a deployment and an audit to find.
 */
export function confidenceSays(
  { engine, stream, failing, picture, expected }: {
    engine: EngineState;
    stream: StreamState;
    /** A recent render failure, from `playoutHealth`. */
    failing?: { says: string } | null | undefined;
    picture: Picture;
    /**
     * Whether a picture is owed at all — `expectsPicture(on)`.
     *
     * Required rather than defaulted, because the default that looks
     * obvious is `true`, and `true` is what makes the alarm fire on
     * every gap between two programmes. The one caller states what it
     * found out. [C-24's own lesson, and C-28's]
     */
    expected: boolean;
  },
): { says: string; tone: Tone } | null {
  if (failing) {
    return {
      says: `The encoder cannot render this channel: ${failing.says}`,
      tone: 'fault',
    };
  }
  if (engine !== 'running') {
    const says = healthSentence(engine, stream, 'operator');
    return says ? { says, tone: 'fault' } : null;
  }
  if (stream !== 'transmitting') {
    const says = healthSentence(engine, stream, 'operator');
    return says ? { says, tone: 'fault' } : null;
  }
  if (picture.black && expected) {
    return {
      says: `Segments are arriving and the picture is black — `
        + `${Math.round(picture.darkForMs / 1000)}s so far. `
        + `Everything else reports healthy, so this is the only `
        + `instrument that can see it.`,
      tone: 'fault',
    };
  }
  return null;
}
