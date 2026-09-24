/**
 * Cutting a performer out of their room, and putting them somewhere else.
 * [Doctrine STUDIO-TWO §4, S-6, INV-16, U-18]
 *
 * Filter graphs and nothing else: every function here returns strings, so the
 * hard part — whether the graph says what we mean — is testable without
 * running a renderer, and the part that needs a renderer is only whether
 * ffmpeg agrees.
 *
 * THE MATTE IS A DIFFERENCE, not a guess. The take is differenced against a
 * still of the same room with nobody in it, the difference is thresholded at a
 * multiple of that room's own measured noise, and what is left is the
 * performer. No model, no per-frame estimate, and therefore none of the
 * per-frame flicker S-6 said would decide whether anybody uses this.
 *
 * WHY THE WHOLE CHAIN IS IN RGB. A difference taken on luma alone cannot see a
 * blue shirt against a grey wall of the same brightness, and a matte that
 * loses a shirt is worse than no matte. Differencing in RGB and reducing to
 * grey afterwards measures colour distance, which is the thing we actually
 * mean by "different from the wall". `maskedmerge` is then given three planar
 * RGB streams, because in YUV its mask's neutral chroma would blend the
 * colour of every pixel halfway to the backdrop.
 */

import type { SpaceLook } from '../domain/environment.js';

/** Softening applied to a `blur` backdrop — their own room, out of focus. */
const BLUR_SIGMA = 24;

/**
 * A drawn space.  [§4]
 *
 * Evaluated at the panel's own size, so a backdrop is never a scaled-up
 * thumbnail, and deterministic, so the shot cache means what it says (U-16).
 */
export function backdropChain(
  look: SpaceLook, width: number, height: number, fps: number,
  seconds: string, out: string,
): string[] {
  const wash = `${out}_wash`;
  const glow = `${out}_glow`;
  const lit = `${out}_lit`;
  const chains: string[] = [];

  chains.push(
    `gradients=s=${width}x${height}:c0=${look.top}:c1=${look.bottom}`
    + `:x0=0:y0=0:x1=0:y1=${height}:type=linear:d=${seconds}:r=${fps},`
    + `format=gbrp[${wash}]`);

  // The light in the room, as a pool rather than an even wash: an evenly lit
  // backdrop is the thing that reads as a screensaver.
  chains.push(
    `gradients=s=${width}x${height}:c0=${look.glow.colour}:c1=0x000000`
    + `:x0=${Math.round(look.glow.x * width)}:y0=${Math.round(look.glow.y * height)}`
    + `:x1=${width}:y1=${height}:type=radial:d=${seconds}:r=${fps},`
    + `format=gbrp[${glow}]`);
  chains.push(
    `[${wash}][${glow}]blend=all_mode=screen:all_opacity=${look.glow.strength}[${lit}]`);

  // A horizon, a stage lip, a balcony rail: one straight edge is the
  // difference between "a place" and "a gradient".
  let current = lit;
  if (look.band) {
    const banded = `${out}_band`;
    chains.push(
      `[${current}]drawbox=x=0:y=${Math.round(look.band.y * height)}:w=${width}`
      + `:h=${Math.round(look.band.height * height)}:color=${look.band.colour}@1:t=fill`
      + `[${banded}]`);
    current = banded;
  }

  const tail: string[] = [];
  if (look.vignette > 0) tail.push(`vignette=a=${(Math.PI / 5 * look.vignette).toFixed(4)}`);
  // Grain last, so it is not blurred by anything above it. A perfectly clean
  // backdrop behind a camera's own noise is what makes a composite look pasted.
  if (look.grain > 0) tail.push(`noise=alls=${look.grain}:allf=t`);
  tail.push('format=gbrp');
  chains.push(`[${current}]${tail.join(',')}[${out}]`);
  return chains;
}

/** Their own room, softened. The dependable middle. [§4] */
export function blurBackdropChain(from: string, out: string): string[] {
  return [`[${from}]gblur=sigma=${BLUR_SIGMA},format=gbrp[${out}]`];
}

/**
 * The matte itself, and the composite.
 *
 * `fg` and `plate` must already be the same size — the panel's size — because
 * a difference between two pictures of different sizes is a difference
 * between two different framings of the room.
 */
export function matteChain(options: {
  /** The take, scaled to the panel. */
  fg: string;
  /** The empty room, scaled to the panel. */
  plate: string;
  /** What goes behind, scaled to the panel. */
  backdrop: string;
  out: string;
  /** 0..255 on the difference. Measured from the plate's own noise. */
  threshold: number;
  /** Pixels of softening on the matte's edge. */
  feather: number;
}): string[] {
  const { fg, plate, backdrop, out, threshold, feather } = options;
  const diff = `${out}_diff`;
  const mask = `${out}_mask`;
  const keyed = `${out}_key`;
  const shown = `${out}_shown`;

  return [
    /*
     * The take is needed twice — once to measure the difference and once to
     * be composited — and a filter graph label can be consumed exactly once.
     * Split it here rather than at the call site, so that using this function
     * correctly does not require knowing that.
     */
    `[${fg}]split=2[${keyed}][${shown}]`,
    `[${keyed}][${plate}]blend=all_mode=difference[${diff}]`,
    /*
     * Threshold, then open and close. A single speck of noise above the
     * threshold is a firefly in the finished video; erosion removes it, and
     * the two dilations put the performer's own edge back and then a little
     * beyond it, so the feather has something to soften into rather than
     * eating into their outline.
     */
    `[${diff}]format=gray,`
    + `lutyuv=y=if(gt(val\\,${threshold})\\,255\\,0),`
    + 'erosion,dilation,dilation,'
    + `gblur=sigma=${feather},format=gbrp[${mask}]`,
    `[${backdrop}][${shown}][${mask}]maskedmerge[${out}]`,
  ];
}
