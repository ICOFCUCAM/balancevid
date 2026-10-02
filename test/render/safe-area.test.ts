/**
 * The safe area, and the one thing that stood outside it.
 * [CHANNEL §21, §27, C-26, C-38]
 *
 * `ACTION_SAFE` was declared at C-26 and consumed by nothing — not
 * by the renderer, not by the editor, not by any check. The only
 * references in the repository were its own declaration, the
 * re-export beside it, and a test asserting it was smaller than
 * `TITLE_SAFE`. A constant nothing reads is a rule the product
 * states and does not keep.
 *
 * AND THE RULE IT STATES WAS NOT KEPT. `graphic.ts` says of the two
 * boxes:
 *
 *   *"Content is positioned against title safe and `overflow:hidden`,
 *   so a slide cannot put a word outside it. That is the whole of the
 *   'content outside the safe area' check: it is prevented rather
 *   than detected."*
 *
 * True of everything inside the safe box, and false of the one row
 * drawn beside it. `.foot` carries the credit and the station's own
 * name — both text — and was positioned at 56% of the title-safe
 * margin: 60px up from the bottom of 1080, with ink measured at 64,
 * against a title-safe line at 108.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTION_SAFE, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_SAFE, slideHtml,
} from '../../src/render/slide.js';

const SAFE_Y = Math.round(SLIDE_HEIGHT * TITLE_SAFE);
const SAFE_X = Math.round(SLIDE_WIDTH * TITLE_SAFE);

/**
 * What the stylesheet declares for one rule, as numbers.
 *
 * THE SELECTOR IS ANCHORED, because `.foot` is also the tail of
 * `.scrim.foot` — the gradient under a picture caption — and a loose
 * match reads that rule instead and finds no `bottom` at all. A test
 * that silently measured the wrong rule would have passed either way.
 */
function ruleFor(html: string, selector: string): Record<string, number> {
  const body = new RegExp(`(?<![\\w.-])\\${selector}\\{([^}]*)\\}`)
    .exec(html)?.[1] ?? '';
  const out: Record<string, number> = {};
  for (const part of body.split(';')) {
    const found = /^\s*([a-z-]+)\s*:\s*(\d+)px\s*$/.exec(part);
    if (found) out[found[1]!] = Number(found[2]);
  }
  return out;
}

const WITH_FOOT = slideHtml({
  layout: 'text', heading: 'A heading', body: 'Some words.',
  footnote: 'Photograph: somebody who must be credited',
  channel: 'BALANCEVID TV',
});

describe('the one row drawn outside the safe box (C-38)', () => {
  /*
   * MEASURED ON A REAL RENDER BEFORE AND AFTER, in Chromium at
   * 1920×1080: the lowest row carrying ink went from 64px from the
   * bottom to 112px. The assertion here is on the geometry the
   * stylesheet declares rather than on pixels, because a pixel
   * comparison is a test of a font — but it is the same fact, and
   * moving the foot back under the line fails it.
   */
  it('sits on the title-safe line rather than below it', () => {
    const foot = ruleFor(WITH_FOOT, '.foot');
    expect(foot['bottom']).toBe(SAFE_Y);
    expect(foot['bottom']).toBeGreaterThanOrEqual(SAFE_Y);
  });

  /* Its sides were always right; this holds them there. */
  it('keeps its sides on the same line', () => {
    const foot = ruleFor(WITH_FOOT, '.foot');
    expect(foot['left']).toBe(SAFE_X);
    expect(foot['right']).toBe(SAFE_X);
  });

  /*
   * AND IT IS THE ONLY ONE. Everything else that carries text is
   * inside `.safe`, which is inset to title safe and clips. If a
   * second absolutely-positioned row is ever added, this fails and
   * whoever adds it has to say where it sits.
   */
  it('is the only thing positioned outside the safe box', () => {
    const absolute = [...WITH_FOOT.matchAll(
      /(?<![\w.-])\.([a-z-]+)\{[^}]*position:absolute/g)].map((found) => found[1]);
    /*
     * `.wash`, `.plate`, `.scrim` and `.safe` share one declaration,
     * so the scan sees the last of them; `.safe` IS the title-safe
     * box and clips, and `.foot` is the row beside it. A third name
     * here means somebody has added an element nothing clips, and
     * they have to say where it sits.
     */
    expect(absolute).toEqual(['safe', 'foot']);
  });
});

describe('the guides are the editor’s, never the renderer’s (C-38)', () => {
  /*
   * THE WHOLE SAFETY PROPERTY OF THIS STAGE. The guides are a
   * measuring instrument drawn in the control room's own document,
   * as a sibling of the preview iframe. If they were ever drawn
   * inside `slideHtml` instead they would be rasterised into the
   * PNG and transmitted — two white rectangles across somebody's
   * broadcast — and nothing else would notice, because the preview
   * would look exactly as intended.
   *
   * So the test is on the renderer, where the mistake would be
   * made, and not on the overlay.
   */
  const everything = [
    slideHtml({ layout: 'title', heading: 'A title', channel: 'TV' }),
    slideHtml({ layout: 'text', heading: 'A heading', body: 'Words.' }),
    slideHtml({ layout: 'quote', body: 'A quotation.', footnote: 'Someone' }),
    slideHtml({ layout: 'picture', heading: 'A caption', picture: 'a' }, '/p'),
    slideHtml({ layout: 'picture', heading: 'Bleed', picture: 'a', fill: true },
      '/p'),
    slideHtml({ layout: 'text', body: 'On a photograph.', background: 'image' },
      '/p'),
  ];

  it('draws no guide on any composition', () => {
    for (const html of everything) {
      expect(html).not.toContain('safe-guides');
      expect(html).not.toContain('guide-action');
      expect(html).not.toContain('guide-title');
      expect(html).not.toContain('dashed');
    }
  });

  /*
   * AND THE RENDERER NEVER NEEDS THE OUTER BOX. `ACTION_SAFE` is
   * the editor's constant: a picture may run to the frame edge, so
   * nothing in the composition is positioned against it. If it ever
   * appears in the stylesheet, something is being drawn to a line
   * that is not a boundary.
   */
  it('never positions anything against action safe', () => {
    const action = Math.round(SLIDE_HEIGHT * ACTION_SAFE);
    for (const html of everything) {
      const styles = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
      expect(styles).not.toContain(`${action}px`);
    }
  });
});

describe('the two boxes themselves (C-38)', () => {
  /* Action safe is the outer one: a picture may reach it, text may not. */
  it('nests one inside the other', () => {
    expect(ACTION_SAFE).toBeGreaterThan(0);
    expect(TITLE_SAFE).toBeGreaterThan(ACTION_SAFE);
    expect(TITLE_SAFE).toBeLessThan(0.5);
  });

  /* The percentages the overlay insets by are these, not pixels: a
     pixel inset computed from 1920 is wrong the moment the panel
     changes width. */
  it('are fractions, so an overlay survives any scale', () => {
    expect(ACTION_SAFE * 100).toBe(5);
    expect(TITLE_SAFE * 100).toBe(10);
  });
});
