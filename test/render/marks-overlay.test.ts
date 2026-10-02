/**
 * The compositor that can draw.  [CHANNEL §13, §27, D-16, C-24, C-40]
 *
 * The channel bug, the lower third, the LIVE lamp and NEXT have been
 * built since the identity was written. None of them reached the
 * wire, because the one thing that drew them was ffmpeg's
 * `drawtext`, and the pinned `ffmpeg-static` this product ships is
 * built without freetype. C-24 traded a black channel for a clean
 * one with no identity; this is the trade bought back.
 *
 * The marks are drawn by the renderer the slides already use and
 * composited with `overlay` — a filter every ffmpeg has, including
 * the one that cannot draw a character. Nothing about `marksFor`
 * changed: the same descriptions arrive, and only what draws them is
 * different.
 */

import { describe, expect, it } from 'vitest';

import type { Mark } from '../../src/domain/identity.js';
import {
  MARK_INSET, marksHtml, scaled, twoLines,
} from '../../src/render/markDesign.js';
import { TITLE_SAFE } from '../../src/render/slideDesign.js';
import { overlayKey } from '../../src/render/overlay.js';
import { videoChain } from '../../src/playout/segment.js';

const FRAME = { width: 1280, height: 720 };

function mark(over: Partial<Mark> = {}): Mark {
  return {
    kind: 'bug', text: 'REDEMPTION TV', corner: 'top-right',
    opacity: 0.85, size: 22, ink: '#ffffff', ...over,
  };
}

describe('a lower third is a name and a role (C-40)', () => {
  /*
   * THE BRIEF DRAWS TWO LINES — the name large, what they are small
   * underneath — and that hierarchy is most of what makes a lower
   * third look like television rather than a subtitle. `drawtext`
   * could never have done it.
   */
  it('splits a composed caption into its two parts', () => {
    expect(twoLines('Studio One · James Chama Meyembi'))
      .toEqual({ lead: 'Studio One', under: 'James Chama Meyembi' });
  });

  /* A title with nobody named is one line, not an empty second one. */
  it('leaves a single caption alone', () => {
    expect(twoLines('The Ancient of Days'))
      .toEqual({ lead: 'The Ancient of Days' });
    expect(twoLines('The Ancient of Days · ').under).toBe(undefined);
  });

  /*
   * SPLIT ONCE, ON THE FIRST SEPARATOR. Three lines in the corner of
   * a broadcast is the "don't overdo the writing" the brief warns
   * about, in its own hierarchy.
   */
  it('makes two lines out of three parts, not three', () => {
    expect(twoLines('A · B · C'))
      .toEqual({ lead: 'A', under: 'B · C' });
  });

  it('draws both parts, at different sizes', () => {
    const html = marksHtml([mark({
      kind: 'lower-third', text: 'Studio One · James', size: 26,
      corner: 'bottom-left', plate: true,
    })], FRAME);
    expect(html).toContain('Studio One');
    expect(html).toContain('James');
    expect(html).toContain('class="name"');
    expect(html).toContain('class="role"');
  });
});

describe('where the marks sit (C-40)', () => {
  /*
   * INSIDE TITLE SAFE, which the identity never was. `markFilters`
   * used a flat 28px — 2.6% of a 1080-line frame, well outside the
   * line C-38 measured a slide's credit against. A channel is
   * watched on a set that may overscan the outer 5%.
   */
  it('insets every mark to title safe', () => {
    expect(MARK_INSET).toBe(TITLE_SAFE);
    const inset = Math.round(MARK_INSET * FRAME.height);
    const html = marksHtml([mark({ corner: 'top-right' })], FRAME);
    expect(html).toContain(`top:${inset}px`);
    expect(html).toContain(`right:${Math.round(MARK_INSET * FRAME.width)}px`);
    expect(inset).toBeGreaterThan(28);
  });

  it('puts each corner where it belongs', () => {
    for (const [corner, sides] of [
      ['top-left', ['left:', 'top:']], ['top-right', ['right:', 'top:']],
      ['bottom-left', ['left:', 'bottom:']],
      ['bottom-right', ['right:', 'bottom:']],
    ] as const) {
      const html = marksHtml([mark({ corner })], FRAME);
      for (const side of sides) expect(html, corner).toContain(side);
    }
  });

  /* NEXT sits under the title rather than on top of it. */
  it('stacks the lower-left marks upward', () => {
    const html = marksHtml([
      mark({ kind: 'lower-third', text: 'A title', corner: 'bottom-left',
        size: 26, plate: true }),
      mark({ kind: 'next', text: 'NEXT Something', corner: 'bottom-left',
        size: 18, plate: true }),
    ], FRAME);
    const bottoms = [...html.matchAll(/bottom:(\d+)px/g)]
      .map((found) => Number(found[1]));
    expect(bottoms).toHaveLength(2);
    expect(bottoms[1]!).toBeGreaterThan(bottoms[0]!);
  });

  /*
   * A REGION BEATS A CORNER, as it always has: a set draws a
   * rectangle where its furniture is not, and bottom-left is the
   * front of a desk. [§27, C-20]
   */
  it('honours a set’s own rectangle over the corner', () => {
    const html = marksHtml([mark({
      kind: 'lower-third', text: 'A title', corner: 'bottom-left',
      at: { x: 0.08, y: 0.62, w: 0.5, h: 0.2 },
    })], FRAME);
    expect(html).toContain(`left:${Math.round(0.08 * FRAME.width)}px`);
    /* 1 - (0.62 + 0.2) = 0.18 of the frame up from the bottom. */
    expect(html).toContain(`bottom:${Math.round(0.18 * FRAME.height)}px`);
  });
});

describe('the page itself (C-40)', () => {
  /*
   * TRANSPARENT, AND THAT IS THE WHOLE TRICK. A page with a
   * background covers the programme instead of sitting on it.
   */
  it('has no background of its own', () => {
    expect(marksHtml([mark()], FRAME)).toContain('background:transparent');
  });

  it('is exactly the frame it will be laid over', () => {
    const html = marksHtml([mark()], { width: 1920, height: 1080 });
    expect(html).toContain('width:1920px');
    expect(html).toContain('height:1080px');
  });

  /* Points against a 720-line frame, which is the unit the identity
     has always used, so a bug is the same size relative to the
     picture at any output height. */
  it('scales a mark with the picture', () => {
    expect(scaled(22, { width: 1280, height: 720 })).toBe(22);
    expect(scaled(22, { width: 1920, height: 1080 })).toBe(33);
  });

  /* Nothing typed can escape into the page. [D-06] */
  it('escapes what somebody typed', () => {
    const html = marksHtml([mark({ text: '<script>x</script>&"' })], FRAME);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  /* An empty identity draws an empty page rather than nothing. */
  it('draws nothing when there is nothing to draw', () => {
    const html = marksHtml([], FRAME);
    expect(html).toContain('<body></body>');
  });
});

describe('putting it over the picture (C-40)', () => {
  /*
   * CHAINS JOIN WITH `;` AND FILTERS WITH `,`. A graph with a second
   * source cannot be a comma list, and a caller that got it wrong
   * would produce a filtergraph ffmpeg rejects WHOLE — the exact
   * failure C-24 is about.
   */
  it('builds one chain when there is nothing to overlay', () => {
    expect(videoChain(['scale=1:1', 'setsar=1'])).toBe('scale=1:1,setsar=1');
  });

  it('joins the picture and the overlay as two chains', () => {
    const chain = videoChain(['scale=1:1'], '/var/overlays/abc.png');
    expect(chain).toContain('[bv_bg];');
    expect(chain).toContain('movie=/var/overlays/abc.png[bv_marks]');
    expect(chain).toContain('[bv_bg][bv_marks]overlay=0:0');
    /* One external input and one output, so every -map is untouched. */
    expect(chain.split(';')).toHaveLength(3);
  });

  /* A colon in a path separates a filter's options. */
  it('escapes a path a filtergraph would misread', () => {
    expect(videoChain(['scale=1:1'], '/odd:name.png'))
      .toContain('movie=/odd\\:name.png');
  });
});

describe('drawing it only when it changed (C-40)', () => {
  /*
   * THE KEY IS WHAT THE MARKS SAY. The engine makes a segment every
   * four seconds and the marks change when the programme does, so
   * the same overlay serves a hundred segments and is drawn once.
   */
  it('is the same key for the same marks', () => {
    expect(overlayKey([mark()], FRAME)).toBe(overlayKey([mark()], FRAME));
  });

  it('is a different key for different words', () => {
    expect(overlayKey([mark({ text: 'A' })], FRAME))
      .not.toBe(overlayKey([mark({ text: 'B' })], FRAME));
  });

  /* A bug and a lower third saying the same words are not the same
     overlay, which a key over the text alone would get wrong. */
  it('is a different key for the same words drawn differently', () => {
    expect(overlayKey([mark({ kind: 'bug' })], FRAME))
      .not.toBe(overlayKey([mark({ kind: 'lower-third' })], FRAME));
    expect(overlayKey([mark({ corner: 'top-left' })], FRAME))
      .not.toBe(overlayKey([mark({ corner: 'top-right' })], FRAME));
  });

  /* And the same marks at a different output size are a different
     picture. */
  it('is a different key at a different frame size', () => {
    expect(overlayKey([mark()], { width: 1280, height: 720 }))
      .not.toBe(overlayKey([mark()], { width: 1920, height: 1080 }));
  });
});
