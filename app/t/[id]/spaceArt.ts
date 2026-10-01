'use client';

import {
  type Scene, groundPlan, placedFor, reachOf, sceneOf,
} from '../../../src/domain/scene.js';
import { bandIsFloor, defocusFor } from '../../../src/domain/environment.js';

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
 * SO THE THUMBNAIL IS THE SET. The same operations the shader runs and the
 * ffmpeg chain runs, at 96×54 instead of 1280×720: a wash, a pool of light
 * screened over it, one straight band, a floor running away to a point, the
 * softness of a wall the camera is not focused on, a vignette, and grain. A
 * person choosing Concert Stage sees the purple pool and the stage lip, and
 * that is what they get on the air.
 *
 * WHY NOT A PHOTOGRAPH OF EACH SET. Because there is nothing to photograph
 * — §4's whole argument is that these are drawn rather than licensed — and
 * a rendered thumbnail is not an approximation of the set, it IS the set at
 * a smaller size. [D-19, S-6]
 *
 * AND IT TAKES A SCENE NOW, NOT A LOOK.  [S-41]
 *
 * This is the live master feed — `useBroadcastMixer` calls it every frame
 * and `captureStream` hands the result to the encoder — and it was
 * drawing five of the eight things a scene is. The floor, the
 * perspective and the defocus went into the ffmpeg chain at S-33 and
 * S-34 and never came here, so Online TV transmitted a room with no
 * ground in it while an export of the same room had one. Studio Two and
 * the control room are not supposed to be two different places.
 *
 * STILL NOT SHARED RENDERING, which is the line S-35 drew and this keeps.
 * `groundPlan` says where the floor is in pixels; the chain fills that
 * strip with `gradients` and this fills it with `createLinearGradient`,
 * because those are two different machines. What neither of them does
 * any more is work out where the strip goes for itself.
 */

function hex(value: string): string {
  return `#${value.replace(/^(0x|#)/, '')}`;
}

/**
 * Somewhere to draw the room before it is softened.
 *
 * KEPT RATHER THAN MADE, because this runs sixty times a second on the
 * broadcast canvas and a new backing store per frame is a new
 * allocation per frame for the garbage collector to find.
 */
const slates = new Map<string, HTMLCanvasElement>();
function slateFor(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  /* KEPT BY SIZE, not one resized on demand. The broadcast canvas asks
     for 1280×720 sixty times a second and the panel asks for a dozen
     thumbnails of 96×54 whenever it repaints; one shared slate would
     reallocate a backing store between them, which is the opposite of
     what keeping one is for. Four is more sizes than any screen has. */
  const key = `${width}x${height}`;
  let found = slates.get(key);
  if (!found) {
    if (slates.size >= 4) slates.clear();
    found = document.createElement('canvas');
    found.width = width;
    found.height = height;
    slates.set(key, found);
  }
  return found;
}

export function paintSpace(
  paper: CanvasRenderingContext2D, scene: Scene,
  width: number, height: number,
): void {
  const look = scene.background;
  /*
   * THE ROOM IS DRAWN ON THE SLATE AND THE LENS ON THE PAPER.
   *
   * The chain's own order, and its own reason: the defocus is the
   * camera not holding the back wall, so it comes before the vignette
   * and the grain, which are the lens darkening its corners and the
   * sensor adding noise. Blurring those would be blurring the camera.
   * A 2D context cannot soften what it has already drawn, so the room
   * goes somewhere else first and arrives here through the filter.
   */
  const slate = slateFor(width, height);
  const room = slate?.getContext('2d') ?? paper;
  const own = room !== paper;
  if (own) room.clearRect(0, 0, width, height);

  /* ---- the wash ------------------------------------------------------ */
  const wash = room.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, hex(look.top));
  wash.addColorStop(1, hex(look.bottom));
  room.fillStyle = wash;
  room.fillRect(0, 0, width, height);

  /* ---- the light in the room ----------------------------------------- *
   *
   * A POOL, NOT AN EVEN WASH — an evenly lit backdrop is the thing that
   * reads as a screensaver. `screen` rather than `lighter`, because a
   * light pool does not clip to white, which is what the filter chain's
   * `blend=screen` also says. */
  const pool = room.createRadialGradient(
    look.glow.x * width, look.glow.y * height, 0,
    look.glow.x * width, look.glow.y * height, Math.max(width, height) * 0.62);
  pool.addColorStop(0, hex(look.glow.colour));
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  room.save();
  room.globalCompositeOperation = 'screen';
  room.globalAlpha = look.glow.strength;
  room.fillStyle = pool;
  room.fillRect(0, 0, width, height);
  room.restore();

  /* ---- a horizon, a stage lip, a balcony rail ------------------------ *
   *
   * One straight edge is the difference between "a place" and "a
   * gradient", and at thumbnail size it is most of what tells Beach from
   * Mountain.
   *
   * A LINE ONLY. A band that reaches the bottom of the frame is not a
   * rule across the picture, it is the ground, and it is drawn below as
   * a floor that recedes rather than here as a flat stripe — which is
   * exactly the distinction `bandIsFloor` was written for and which
   * this surface was still on the wrong side of. [S-33] */
  const ground = groundPlan(scene, width, height);
  if (look.band && !bandIsFloor(look.band)) {
    room.fillStyle = hex(look.band.colour);
    room.fillRect(0, look.band.y * height, width,
      Math.max(1, look.band.height * height));
  }

  /* ---- and the ground it stands on ----------------------------------- *
   *
   * A real floor meets the wall at the horizon and comes towards the
   * camera, and the near end is further from the room's light than the
   * far end. Drawn as its own gradient over the wash rather than as one
   * flat colour, which is what made a drawn room read as a stage flat.
   * [S-33] */
  if (ground) {
    const plane = room.createLinearGradient(0, ground.top, 0, ground.top + ground.deep);
    plane.addColorStop(0, hex(ground.from));
    plane.addColorStop(1, hex(ground.to));
    room.fillStyle = plane;
    room.fillRect(0, ground.top, width, ground.deep);

    /*
     * AND IT RUNS AWAY TO A POINT, drawn in light and not in lines.
     * Ruled floorboards would be a drawing of perspective, confidently
     * wrong the moment the camera moved; a floor brightest along the
     * line running away from the lens and falling off towards the near
     * corners is right at any angle, because it is a gradient rather
     * than a claim about where the walls are. [S-34]
     *
     * Screened onto the floor and clipped to it: this is light on a
     * surface, not a surface of its own, and the wall above the horizon
     * is not that surface.
     */
    const view = ground.vanish;
    if (view) {
      const run = room.createRadialGradient(
        view.at.x, ground.top + view.at.y, 0,
        view.at.x, ground.top + view.at.y, Math.max(1, reachOf(view)));
      run.addColorStop(0, hex(ground.from));
      run.addColorStop(1, '#000000');
      room.save();
      room.beginPath();
      room.rect(0, ground.top, width, ground.deep);
      room.clip();
      room.globalCompositeOperation = 'screen';
      room.globalAlpha = view.converge;
      room.fillStyle = run;
      room.fillRect(0, ground.top, width, ground.deep);
      room.restore();
    }
  }

  /* ---- the back of the room is not in focus -------------------------- *
   *
   * GROWN BY THE BLUR'S OWN REACH BEFORE IT IS DRAWN. A canvas blur
   * samples transparent black beyond the edge of what it is blurring,
   * so a softened copy laid down at its own size arrives with a faded
   * border — a second vignette nobody asked for, in a renderer whose
   * whole job is to agree with another one. Scaling the copy out by
   * three sigma on every side puts that border outside the frame, and
   * three parts in a thousand of stretch on a gradient is not a
   * picture anybody can tell from the unstretched one. */
  if (own) {
    const sigma = defocusFor(look, Math.min(width, height));
    const margin = Math.ceil(sigma * 3);
    paper.save();
    paper.filter = `blur(${sigma}px)`;
    paper.drawImage(slate!, -margin, -margin,
      width + margin * 2, height + margin * 2);
    paper.restore();
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
  const look = SPACE_LOOKS[set.spaceId];
  /* A set naming a room nobody drew is caught by a test; if one ever
     reaches here it gets the chassis rather than an exception, because
     a broadcast must not stop for a missing swatch. */
  const scene = look ? sceneOf(look, set) : null;
  if (where === 'behind') {
    if (scene) paintSpace(paper, scene, width, height);
    else { paper.fillStyle = '#05070a'; paper.fillRect(0, 0, width, height); }
  }
  const mine = set.furniture.filter(
    (one) => inFront(one) === (where === 'front'));
  /*
   * PLACED FOR THIS FRAME, not for the one they were drawn in.  [S-40]
   *
   * The resolver has been in the domain since S-40 and this is the
   * surface it was written for: a band across the floor is a fact about
   * the frame and comes back untouched, and a screen that means "beside
   * the presenter" is resolved against how much of THIS frame they
   * fill. At 16:9 — which is every control room today — it returns
   * every piece exactly as authored, so nothing moves until somebody
   * broadcasts in a shape the sets were not drawn for, which is the
   * point at which it should.
   */
  const pieces = scene
    ? placedFor(scene, mine, width / Math.max(1, height)) : mine;
  for (const one of pieces) piece(paper, one, frame);
}
