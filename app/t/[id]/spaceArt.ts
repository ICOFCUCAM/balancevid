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
