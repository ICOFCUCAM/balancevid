'use client';

import type { SpaceLook } from '../../../src/domain/environment.js';

/**
 * A drawn space, on a 2D canvas.  [Doctrine CHANNEL §26 A; STUDIO-TWO §4]
 *
 * *"Use proper visual thumbnails."*
 *
 * THE TEN SQUARES WERE FLAT COLOUR. `SPACE_SWATCHES` took each look's `top`
 * and painted a rectangle of it, so Recording Studio and Night Studio were
 * two near-identical dark greys and Beach and Mountain were two pale blues
 * — which is why the brief calls them decorative buttons. The information
 * that tells them apart is the light, the band and the vignette, and all
 * three were thrown away to make the swatch.
 *
 * SO THE THUMBNAIL IS THE SET. The same five operations the shader runs and
 * the ffmpeg chain runs, at 96×54 instead of 1280×720: a wash, a pool of
 * light screened over it, one straight band, a vignette, and grain. A
 * person choosing Concert Stage sees the purple pool and the stage lip, and
 * that is what they get on the air.
 *
 * WHY NOT A PHOTOGRAPH OF EACH SET. Because there is nothing to photograph
 * — §4's whole argument is that these are drawn rather than licensed — and
 * a rendered thumbnail is not an approximation of the set, it IS the set at
 * a smaller size. [D-19, S-6]
 */

function hex(value: string): string {
  return `#${value.replace(/^(0x|#)/, '')}`;
}

export function paintSpace(
  paper: CanvasRenderingContext2D, look: SpaceLook,
  width: number, height: number,
): void {
  /* ---- the wash ------------------------------------------------------ */
  const wash = paper.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, hex(look.top));
  wash.addColorStop(1, hex(look.bottom));
  paper.fillStyle = wash;
  paper.fillRect(0, 0, width, height);

  /* ---- the light in the room ----------------------------------------- *
   *
   * A POOL, NOT AN EVEN WASH — an evenly lit backdrop is the thing that
   * reads as a screensaver. `screen` rather than `lighter`, because a
   * light pool does not clip to white, which is what the filter chain's
   * `blend=screen` also says. */
  const pool = paper.createRadialGradient(
    look.glow.x * width, look.glow.y * height, 0,
    look.glow.x * width, look.glow.y * height, Math.max(width, height) * 0.62);
  pool.addColorStop(0, hex(look.glow.colour));
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  paper.save();
  paper.globalCompositeOperation = 'screen';
  paper.globalAlpha = look.glow.strength;
  paper.fillStyle = pool;
  paper.fillRect(0, 0, width, height);
  paper.restore();

  /* ---- a horizon, a stage lip, a balcony rail ------------------------ *
   *
   * One straight edge is the difference between "a place" and "a
   * gradient", and at thumbnail size it is most of what tells Beach from
   * Mountain. */
  if (look.band) {
    paper.fillStyle = hex(look.band.colour);
    paper.fillRect(0, look.band.y * height, width,
      Math.max(1, look.band.height * height));
  }

  /* ---- the corners fall off ------------------------------------------ */
  if (look.vignette > 0) {
    const corners = paper.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.25,
      width / 2, height / 2, Math.max(width, height) * 0.72);
    corners.addColorStop(0, 'rgba(0,0,0,0)');
    corners.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, look.vignette * 0.7)})`);
    paper.fillStyle = corners;
    paper.fillRect(0, 0, width, height);
  }

  /* ---- and grain last, so nothing blurs it --------------------------- *
   *
   * A perfectly smooth backdrop reads as a screensaver; a perfectly clean
   * one behind a camera's own noise is what makes a composite look pasted
   * on. Drawn as sparse dots rather than per-pixel, because a thumbnail
   * is repainted whenever the panel is and `getImageData` on twelve of
   * them is a visible pause. */
  if (look.grain > 0) {
    paper.save();
    paper.globalAlpha = Math.min(0.5, look.grain / 40);
    const dots = Math.round(width * height * 0.04);
    for (let i = 0; i < dots; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      paper.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
      paper.fillRect(x, y, 1, 1);
    }
    paper.restore();
  }
}

/**
 * A virtual set, drawn.  [Doctrine CHANNEL §27]
 *
 * *"A reusable scene system rather than a collection of images."*
 *
 * TWO PASSES, BECAUSE A DESK IS IN FRONT. Everything else — the room, a
 * riser, a screen on the wall — goes down before the people, and the desk
 * goes over them. That single ordering is what makes a composite read as
 * a studio rather than as cutouts standing on air: the bottom of a
 * presenter disappears behind the desk, exactly as it would in a room.
 *
 * AND IT IS ALL DRAWN, like the spaces and for §4's reason: a photograph
 * of a desk is somebody's photograph of a desk, with a rights line and a
 * perspective that will not match the camera. Two tones and a lit edge is
 * a desk at broadcast size, and it is one this product owns.
 */

import {
  type Piece, type VirtualSet, inFront, place,
} from '../../../src/domain/virtualSet.js';
import { SPACE_LOOKS } from '../../../src/domain/environment.js';

function piece(
  paper: CanvasRenderingContext2D, one: Piece,
  frame: { w: number; h: number },
): void {
  const box = place(one.rect, frame);
  if (one.kind === 'band' || one.kind === 'riser') {
    paper.fillStyle = one.face;
    paper.fillRect(box.x, box.y, box.w, box.h);
    return;
  }
  if (one.kind === 'screen') {
    /* A FRAME AND A GLASS, and the glass is not flat: a monitor in a lit
       room catches the room, and a rectangle of one colour reads as a
       hole cut in the wall. */
    paper.fillStyle = one.frame;
    paper.fillRect(box.x, box.y, box.w, box.h);
    const inset = Math.max(2, Math.round(box.w * 0.012));
    const glass = paper.createLinearGradient(
      box.x, box.y, box.x + box.w * 0.4, box.y + box.h);
    glass.addColorStop(0, one.glass);
    glass.addColorStop(1, '#0b0f14');
    paper.fillStyle = glass;
    paper.fillRect(box.x + inset, box.y + inset,
      box.w - inset * 2, box.h - inset * 2);
    return;
  }
  /*
   * THE DESK. A face, and a lit top edge — one line of light along the
   * lip is what gives a flat rectangle a surface, and it is the cue a
   * near-black composite has almost nothing else to offer.
   */
  paper.fillStyle = one.face;
  paper.fillRect(box.x, box.y, box.w, box.h);
  const lip = Math.max(2, Math.round(box.h * 0.06));
  paper.fillStyle = one.top;
  paper.fillRect(box.x, box.y, box.w, lip);
}

export function paintSet(
  paper: CanvasRenderingContext2D, set: VirtualSet,
  width: number, height: number, where: 'behind' | 'front',
): void {
  const frame = { w: width, h: height };
  if (where === 'behind') {
    const look = SPACE_LOOKS[set.spaceId];
    /* A set naming a room nobody drew is caught by a test; if one ever
       reaches here it gets the chassis rather than an exception, because
       a broadcast must not stop for a missing swatch. */
    if (look) paintSpace(paper, look, width, height);
    else { paper.fillStyle = '#05070a'; paper.fillRect(0, 0, width, height); }
  }
  for (const one of set.furniture) {
    if (inFront(one) === (where === 'front')) piece(paper, one, frame);
  }
}
