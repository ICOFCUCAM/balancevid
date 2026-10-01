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

import type { Grounding, SpaceLook } from '../domain/environment.js';
import { bandIsFloor, defocusFor, floorOf } from '../domain/environment.js';

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

  /*
   * STILL, AND THE SAME EVERY TIME.  [U-16, §4]
   *
   * `gradients` defaults to `seed=-1` — a new seed every run — and to
   * `speed=0.01`, which slowly ROTATES the gradient. Neither was asked
   * for. Between them this function's own contract, that the backdrop
   * is "deterministic, so the shot cache means what it says", was not
   * true: two renders of one unchanged plan came back different, and
   * the wall behind a performer turned gently throughout the song.
   *
   * A drawn room is a room. Its walls do not rotate, and they are the
   * same walls tomorrow. Motion in a backdrop is a decision somebody
   * should make on purpose, and nobody made this one.
   */
  const fixed = `:seed=${seedFor(look.id)}:speed=0`;
  chains.push(
    `gradients=s=${width}x${height}:c0=${look.top}:c1=${look.bottom}`
    + `:x0=0:y0=0:x1=0:y1=${height}:type=linear:d=${seconds}:r=${fps}${fixed},`
    + `format=gbrp[${wash}]`);

  // The light in the room, as a pool rather than an even wash: an evenly lit
  // backdrop is the thing that reads as a screensaver.
  chains.push(
    `gradients=s=${width}x${height}:c0=${look.glow.colour}:c1=0x000000`
    + `:x0=${Math.round(look.glow.x * width)}:y0=${Math.round(look.glow.y * height)}`
    + `:x1=${width}:y1=${height}:type=radial:d=${seconds}:r=${fps}${fixed},`
    + `format=gbrp[${glow}]`);
  chains.push(
    `[${wash}][${glow}]blend=all_mode=screen:all_opacity=${look.glow.strength}[${lit}]`);

  // A horizon, a stage lip, a balcony rail: one straight edge is the
  // difference between "a place" and "a gradient".
  let current = lit;
  if (look.band && !bandIsFloor(look.band)) {
    const banded = `${out}_band`;
    chains.push(
      `[${current}]drawbox=x=0:y=${Math.round(look.band.y * height)}:w=${width}`
      + `:h=${Math.round(look.band.height * height)}:color=${look.band.colour}@1:t=fill`
      + `[${banded}]`);
    current = banded;
  }
  const ground = floorOf(look);
  if (ground) {
    /*
     * A FLOOR, NOT A STRIPE.  [§4, S-6]
     *
     * A band that reaches the bottom of the frame is not a rule across
     * the picture, it is the ground — and it has been drawn as one flat
     * colour since the spaces were made, which is exactly what makes a
     * drawn room look like a stage flat. A real floor recedes: it meets
     * the wall at the horizon and comes towards the camera, and the
     * near end is further from the room's light than the far end.
     *
     * So the floor is its own gradient, laid over the wash between the
     * horizon and the bottom edge, from the band's own colour where it
     * meets the wall to a darker version of that same colour underfoot.
     * Mixing towards black rather than to another hue keeps it one
     * floor rather than two surfaces.
     */
    const top = Math.round(ground.y * height);
    const deep = height - top;
    const floor = `${out}_floor`;
    const laid = `${out}_laid`;
    chains.push(
      `gradients=s=${width}x${deep}:c0=${ground.from}`
      + `:c1=${ground.to}`
      + `:x0=0:y0=0:x1=0:y1=${deep}:type=linear:d=${seconds}:r=${fps}${fixed},`
      + `format=gbrp[${floor}]`);
    chains.push(
      `[${current}][${floor}]overlay=0:${top}:format=gbrp[${laid}]`);
    current = laid;
  }

  const tail: string[] = [];
  /*
   * AND THE BACK OF THE ROOM IS NOT IN FOCUS.  [§4]
   *
   * Before the vignette and the grain, because both of those are the
   * lens and the sensor rather than the room: a vignette is the lens
   * darkening its own corners, and grain is noise added after the
   * picture was formed. Blurring them would be blurring the camera.
   */
  tail.push(`gblur=sigma=${defocusFor(look, Math.min(width, height))}`);
  if (look.vignette > 0) tail.push(`vignette=a=${(Math.PI / 5 * look.vignette).toFixed(4)}`);
  /*
   * Grain last, so it is not blurred by anything above it. A perfectly clean
   * backdrop behind a camera's own noise is what makes a composite look
   * pasted.
   *
   * AND SEEDED, which it was not. This function's own contract is that it
   * is "deterministic, so the shot cache means what it says" — and
   * `noise` without `all_seed` takes a new seed every run, so two renders
   * of one unchanged plan came back different. U-16 caches a shot by its
   * plan; a backdrop that will not render the same twice makes that cache
   * a liar, and makes every comparison of two renders a comparison of two
   * dice. The seed is the space's own id, so each room keeps its own
   * grain and keeps it for ever. [U-16, D-19]
   */
  if (look.grain > 0) {
    tail.push(`noise=alls=${look.grain}:allf=t:all_seed=${seedFor(look.id)}`);
  }
  tail.push('format=gbrp');
  chains.push(`[${current}]${tail.join(',')}[${out}]`);
  return chains;
}

/**
 * A stable seed for a space's grain.
 *
 * Any function of the id would do; this one is small, has no dependencies
 * and spreads adjacent names apart, which is all that is being asked of
 * it. What matters is only that the same room answers the same number
 * every time this process or any other runs. [U-16]
 */
export function seedFor(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 1_000_000;
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
  /**
   * How this room lands on the person standing in it, or nothing.
   *
   * Absent for `original` and for a blur, where there is no room to take
   * the light from: their own room is already lighting them correctly,
   * which is the one case that never needed correcting. [§4]
   */
  ground?: Grounding;
  width: number;
  height: number;
}): string[] {
  const {
    fg, plate, backdrop, out, threshold, feather, ground, width, height,
  } = options;
  const diff = `${out}_diff`;
  const mask = `${out}_mask`;
  const keyed = `${out}_key`;
  const shown = `${out}_shown`;

  const chain = [
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
  ];

  if (!ground) {
    chain.push(`[${backdrop}][${shown}][${mask}]maskedmerge[${out}]`);
    return chain;
  }

  /*
   * STANDING IN THE ROOM RATHER THAN IN FRONT OF IT.  [§4, S-6]
   *
   * Everything above produces a clean edge, and a clean edge is what makes
   * a composite read as a sticker: nothing in a real room has one. Two
   * corrections, in the order light actually works — the room is darkened
   * where the performer blocks it, and then the room's colour is allowed
   * onto the edge of the performer it is lighting.
   *
   * The numbers are `groundingFor`, derived from the space's own declared
   * light, so the same room that draws a purple glow from above throws a
   * purple wrap and a short shadow. Nobody is asked a question about
   * compositing. [D-19]
   */
  const small = Math.min(width, height);
  const shadowBlur = Math.max(1, Math.round(ground.shadowBlur * small));
  const wrapBlur = Math.max(1, Math.round(0.02 * small));
  const dx = Math.round(ground.shadowX * width);
  const dy = Math.round(ground.shadowY * height);

  const maskA = `${out}_mA`;
  const maskB = `${out}_mB`;
  const maskC = `${out}_mC`;
  const maskD = `${out}_mD`;
  const backA = `${out}_bA`;
  const backB = `${out}_bB`;
  const backC = `${out}_bC`;
  const shade = `${out}_shade`;
  const dark = `${out}_dark`;
  const ground1 = `${out}_grounded`;
  const soft = `${out}_soft`;
  const band = `${out}_band`;
  const wash = `${out}_wash`;
  const tint = `${out}_tint`;
  const lit = `${out}_lit`;

  chain.push(`[${mask}]split=4[${maskA}][${maskB}][${maskC}][${maskD}]`);
  chain.push(`[${backdrop}]split=3[${backA}][${backB}][${backC}]`);

  /*
   * THE SHADOW. The matte, pushed away from the light the room declares
   * and blurred until it is a presence rather than a shape, used as the
   * mask that chooses between the room and a darker copy of it. Darkening
   * the room itself rather than laying grey over it keeps the shadow the
   * colour of the surface it falls on, which is what a shadow is.
   */
  /*
   * SHIFTING A PICTURE TAKES A PAD AND A CROP, and the offset can be
   * negative — Beach lights from the right, so its shadow falls left.
   * `pad` cannot express a negative offset, so the canvas grows by the
   * absolute distance on both axes and the crop chooses which side of
   * the growth to keep. Getting this wrong is silent: the shadow simply
   * does not move, which looks like no shadow at all.
   */
  const padX = Math.abs(dx);
  const padY = Math.abs(dy);
  chain.push(
    `[${maskB}]format=gray,gblur=sigma=${shadowBlur},`
    + `pad=${width + padX}:${height + padY}`
    + `:${dx > 0 ? dx : 0}:${dy > 0 ? dy : 0}:black,`
    + `crop=${width}:${height}:${dx > 0 ? 0 : padX}:${dy > 0 ? 0 : padY},`
    + `format=gbrp[${shade}]`);
  chain.push(
    `[${backA}]colorlevels=romax=${(1 - ground.shadow).toFixed(3)}`
    + `:gomax=${(1 - ground.shadow).toFixed(3)}`
    + `:bomax=${(1 - ground.shadow).toFixed(3)},format=gbrp[${dark}]`);
  chain.push(`[${backB}][${dark}][${shade}]maskedmerge[${ground1}]`);

  /*
   * THE WRAP. A band just INSIDE the performer's outline — the matte minus
   * a blurred copy of itself, which is zero everywhere except where the
   * edge was — carrying a heavily blurred copy of the room. Added rather
   * than mixed, because light adds: this is the room's glow landing on a
   * shoulder, not the room showing through it.
   */
  chain.push(
    `[${maskC}]format=gray,gblur=sigma=${wrapBlur * 2},format=gbrp[${soft}]`);
  chain.push(`[${maskA}][${soft}]blend=all_mode=subtract,`
    + `format=gbrp[${band}]`);
  chain.push(`[${backC}]gblur=sigma=${wrapBlur * 4},format=gbrp[${wash}]`);
  chain.push(`[${wash}][${band}]blend=all_mode=multiply,`
    + `lutrgb=r=val*${ground.wrap.toFixed(3)}`
    + `:g=val*${ground.wrap.toFixed(3)}`
    + `:b=val*${ground.wrap.toFixed(3)},format=gbrp[${tint}]`);
  chain.push(`[${shown}][${tint}]blend=all_mode=addition,format=gbrp[${lit}]`);

  /* The fourth copy of the matte, kept back for the merge itself: a
     filter graph label is consumed exactly once, and the three above are
     spent on the shadow, the band and the band's blurred twin. */
  chain.push(`[${ground1}][${lit}][${maskD}]maskedmerge[${out}]`);
  return chain;
}
