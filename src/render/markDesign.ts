/**
 * The station's marks, as a page.  [Doctrine CHANNEL §13, §27, D-16,
 * D-04, C-24, C-26, C-40]
 *
 *     ChannelIdentity → marksFor() → Mark[] → THIS → a transparent PNG
 *                                                        │
 *                                              overlay, over programme out
 *
 * WHY THIS EXISTS, WHEN `markFilters` ALREADY DREW THEM. It drew them
 * with ffmpeg's `drawtext`, and `drawtext` needs freetype, and the
 * pinned `ffmpeg-static` this product ships is built without it. C-24
 * found that out the expensive way: a filtergraph naming a filter
 * that is not there is rejected WHOLE, so the station bug did not
 * fail to appear — it took the picture with it and put four seconds
 * of black on the wire, every segment, for as long as the channel had
 * an identity. The fix then was to stop emitting the marks, which
 * traded a black channel for a clean one with no identity.
 *
 * A viewer looking at that channel sees a camera feed rather than a
 * television service, which is exactly what the brief says and
 * exactly what it should look like.
 *
 * SO THE MARKS ARE DRAWN BY THE RENDERER THIS PRODUCT ALREADY HAS.
 * C-26 built a deterministic HTML renderer for slides — pinned face,
 * fixed sizes, one layout calculation shared by the preview and the
 * transmission — and a transparent screenshot of a page is a
 * broadcast overlay. `movie` and `overlay` are in every ffmpeg ever
 * built, including the one that cannot draw a single character.
 *
 * IT IS NOT A SECOND GRAPHICS SYSTEM, which the brief is explicit
 * about. The same `Mark[]` from the same `marksFor` arrives here; all
 * that changed is what the compositor draws with. The one that knows
 * how to draw still is not the one that decides what. [§13]
 *
 * AND IT CAN DO WHAT drawtext NEVER COULD: a name over a role, two
 * weights, a plate with a corner radius, letter-spacing on a station
 * mark. That is most of the difference between a caption and a
 * television graphic.
 *
 * Pure: no filesystem, no network, no clock, no browser. A test reads
 * the page as text. [C-26]
 */

import type { Mark } from '../domain/identity.js';
import { ACTION_SAFE, FACE, TITLE_SAFE } from './slideDesign.js';

/** The frame the marks are drawn against, in pixels. */
export interface Frame { width: number; height: number }

/**
 * HOW BIG A MARK IS, against the frame it lands on.
 *
 * `Mark.size` is points against a 720-line frame — the unit the
 * identity has always used, because a channel's bug should be the
 * same size relative to the picture whether the wire is 720 or 1080.
 * One conversion, here.
 */
export function scaled(size: number, frame: Frame): number {
  return Math.round((size / 720) * frame.height);
}

/**
 * WHERE THE MARKS SIT, and it is not the frame's edge.  [§27, C-38]
 *
 * C-38 measured a credit 44px outside the title-safe box on a slide
 * and moved it in. The same rule governs a station bug, and more so:
 * a slide is watched on a laptop and a channel is watched on a set
 * that may overscan the outer 5%. Text goes inside title safe. The
 * identity has never had a margin of its own — `markFilters` used a
 * flat 28px, which is 2.6% of a 1080-line frame and well outside the
 * line.
 */
export const MARK_INSET = TITLE_SAFE;

/** A plate's rounded corner, as a fraction of its text size. */
const PLATE_RADIUS = 0.12;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (one) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  )[one] ?? one);
}

/**
 * Which corner a mark is anchored to, as CSS offsets.
 *
 * A REGION BEATS A CORNER, exactly as it did before: a virtual set
 * draws a rectangle where its furniture is not, and `bottom-left` is
 * the front of a desk. Fractions of the frame, so the same set places
 * the same caption at any output size. [§27, C-18, C-20]
 */
function place(mark: Mark, frame: Frame, stackPx: number): string {
  if (mark.at) {
    const left = Math.round(mark.at.x * frame.width);
    const bottom = Math.round(
      (1 - (mark.at.y + mark.at.h)) * frame.height) + stackPx;
    return `left:${left}px;bottom:${bottom}px`;
  }
  const inset = Math.round(MARK_INSET * frame.height);
  const insetX = Math.round(MARK_INSET * frame.width);
  const side = mark.corner === 'top-right' || mark.corner === 'bottom-right'
    ? `right:${insetX}px` : `left:${insetX}px`;
  const up = mark.corner === 'bottom-left' || mark.corner === 'bottom-right'
    ? `bottom:${inset + stackPx}px` : `top:${inset + stackPx}px`;
  return `${side};${up}`;
}

/**
 * A lower third is a NAME and a ROLE, not a sentence.  [C-40]
 *
 * The brief draws two lines — the name large, what they are small
 * underneath — and that hierarchy is most of what makes a lower third
 * look like television. The model carried one string, so the text is
 * split on the separator the identity already composes with, and a
 * mark with no separator is simply one line.
 *
 * SPLIT ONCE, on the FIRST separator. "Studio One · Conversation ·
 * James" is a title and a subtitle, not three lines: three lines in
 * the corner of a broadcast is the "don't overdo the writing" the
 * brief warns about, in its own hierarchy.
 */
export function twoLines(text: string): { lead: string; under?: string } {
  const at = text.indexOf('·');
  if (at < 0) return { lead: text.trim() };
  const lead = text.slice(0, at).trim();
  const under = text.slice(at + 1).trim();
  return under ? { lead, under } : { lead };
}

/**
 * The page whose transparent screenshot is the overlay.
 *
 * ONE PAGE FOR ALL THE MARKS, because one screenshot is one overlay
 * and one `overlay` filter. Four `drawtext` calls were four filters;
 * this is one composite, which is cheaper on a box that has to stay
 * ahead of real time.
 */
export function marksHtml(
  marks: readonly Mark[], frame: Frame,
  /**
   * A LOGO'S BYTES, resolved by the caller.
   *
   * The mark names a library asset, because a stored reference has
   * to mean the same thing on another machine (§3, D-18). Turning
   * that name into bytes is the compositor's job and inlining them
   * is the page's only way to see a picture — it is given no
   * network and no disk. [D-06, C-26, C-44]
   */
  pictures: Readonly<Record<string, string>> = {},
): string {
  /* The lower marks stack upward, so NEXT sits under the title —
     counted separately from a region, because a mark in a region and
     a mark in a corner are not in each other's way. [C-20] */
  let lowerLeft = 0;
  let inRegion = 0;

  const drawn = marks.map((mark) => {
    const size = scaled(mark.size, frame);
    const stack = mark.at ? inRegion : (
      mark.corner === 'bottom-left' || mark.corner === 'bottom-right'
        ? lowerLeft : 0);
    const where = place(mark, frame, stack);
    const grown = Math.round(size * (mark.kind === 'lower-third' ? 2.5 : 2.1));
    if (mark.at) inRegion += grown; else if (
      mark.corner === 'bottom-left' || mark.corner === 'bottom-right'
    ) lowerLeft += grown;

    const pad = Math.round(size * 0.42);
    const plate = mark.plate
      ? `background:rgba(6,8,11,0.62);padding:${Math.round(size * 0.3)}px `
        + `${pad}px;border-radius:${Math.round(size * PLATE_RADIUS)}px;`
        + 'backdrop-filter:blur(2px)'
      : '';
    const shadow = mark.plate ? '' : 'text-shadow:0 1px 3px rgba(0,0,0,0.55)';

    /*
     * A STATION'S LOGO, SIZED BY ITS HEIGHT AND NOT ITS WIDTH. A
     * bug is a thing of a certain height in the corner of a frame,
     * whatever shape the artwork is; sizing by width would make a
     * wide wordmark tiny and a square emblem enormous.
     */
    const art = mark.picture ? pictures[mark.picture] : undefined;
    if (art) {
      return `<div class="m" style="${where};opacity:${
        mark.opacity.toFixed(2)}"><img alt="" src="${art}" style="`
        + `height:${Math.round(size * 2.1)}px;width:auto;display:block;`
        + 'filter:drop-shadow(0 1px 3px rgba(0,0,0,0.55))"></div>';
    }
    /*
     * AND A MARK WHOSE PICTURE IS MISSING DRAWS NOTHING RATHER THAN
     * ITS OWN EMPTY STRING. A logo deleted from the library is a
     * channel with no bug, which is what it was before anybody
     * uploaded one; an empty plate in the corner looks deliberate.
     */
    if (mark.picture || !mark.text.trim()) return '';
    if (mark.kind === 'lower-third') {
      const { lead, under } = twoLines(mark.text);
      return `<div class="m" style="${where};${plate}">`
        + `<div class="name" style="font-size:${size}px;color:${mark.ink}">`
        + `${escape(lead)}</div>`
        + (under
          ? `<div class="role" style="font-size:${Math.round(size * 0.56)}px">`
            + `${escape(under)}</div>`
          : '')
        + '</div>';
    }
    /*
     * THE LAMP IS THE ONE MARK WITH A DOT, and the dot is the
     * convention every broadcaster uses for "this is happening now".
     * It is drawn rather than typed because a bullet character is a
     * different shape in every font, and this one is pinned.
     */
    const dot = mark.kind === 'lamp'
      ? `<span class="dot" style="width:${Math.round(size * 0.42)}px;`
        + `height:${Math.round(size * 0.42)}px"></span>` : '';
    const track = mark.kind === 'bug' || mark.kind === 'lamp'
      ? 'letter-spacing:0.14em;text-transform:uppercase;font-weight:700' : '';
    return `<div class="m row" style="${where};${plate};opacity:${
      mark.opacity.toFixed(2)};${shadow}">${dot}`
      + `<span style="font-size:${size}px;color:${mark.ink};${track}">`
      + `${escape(mark.text)}</span></div>`;
  }).join('');

  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  /* TRANSPARENT, AND THAT IS THE WHOLE TRICK. The screenshot is taken
     with the background omitted, so everything this page does not
     draw is the programme underneath it. */
  html,body{width:${frame.width}px;height:${frame.height}px;
    background:transparent;overflow:hidden;
    font:400 16px/1.2 ${FACE};-webkit-font-smoothing:antialiased}
  .m{position:absolute;max-width:${Math.round(
    frame.width * (1 - 2 * MARK_INSET))}px}
  .row{display:flex;align-items:center;gap:0.46em}
  .name{font-weight:700;line-height:1.1;letter-spacing:-0.01em;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .role{font-weight:600;letter-spacing:0.17em;text-transform:uppercase;
    opacity:0.72;margin-top:0.26em;color:#fff;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}
  .dot{border-radius:50%;background:#e2402f;flex:0 0 auto;
    box-shadow:0 0 0 2px rgba(226,64,47,0.28)}
  </style><body>${drawn}</body>`;
}

/** For a test that wants to know where the outer box is. */
export const SAFE = { action: ACTION_SAFE, title: TITLE_SAFE } as const;
