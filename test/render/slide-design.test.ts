/**
 * A slide is a broadcast graphic.  [Doctrine CHANNEL §21, §20, §27,
 * D-04, D-06, C-26]
 *
 * WHAT WAS WRONG BEFORE THIS. The renderer drew four layouts that were
 * all the same object — centred text on black — and applied the
 * channel's colour to every word on the slide. It was correct and it
 * looked like an application. The compositions here are asserted on
 * the HTML rather than a screenshot, for the reason the first slide
 * test gave: a pixel comparison is a test of a font, and it fails on
 * the machine that has a different one.
 *
 * SO THE FONT IS ASSERTED INSTEAD, which is the determinism this file
 * mostly exists for: the preview and the transmission are the same
 * function, drawn on two different machines, and a stack that resolves
 * differently on each is a preview that lies about what will fit.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTION_SAFE, BACKGROUNDS, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_SAFE, TYPE,
  contrast, presetFor, slideHtml, slideProblems,
} from '../../src/render/slideDesign.js';
import { slideHtml as fromRenderer } from '../../src/render/slide.js';

const PIXEL = 'data:image/png;base64,AAAA';

describe('one renderer, one visual truth (C-26)', () => {
  /*
   * THE WHOLE ARCHITECTURE, IN ONE ASSERTION. The control room draws
   * the preview and the worker draws the transmission, and if those
   * are two functions they will drift — not today, but on the day
   * somebody adjusts a margin in one of them. They are one function,
   * and this is the test that fails when a second one appears.
   */
  it('is the same function the worker rasterises', () => {
    expect(fromRenderer).toBe(slideHtml);
  });

  it('names a face that exists on both machines', () => {
    const html = slideHtml({ layout: 'title', heading: 'H' });
    expect(html).toContain('Liberation Sans');
    /* `system-ui` is the operator's font in the browser and the render
       image's font on the wire, and they are not the same machine. */
    expect(html).not.toContain('system-ui');
  });

  it('is 16:9 at the house height', () => {
    expect(SLIDE_WIDTH / SLIDE_HEIGHT).toBeCloseTo(16 / 9, 5);
    const html = slideHtml({ layout: 'title', heading: 'H' });
    expect(html).toContain(`width:${SLIDE_WIDTH}px`);
    expect(html).toContain(`height:${SLIDE_HEIGHT}px`);
  });
});

describe('the safe area is a box, not a hope (§27, C-26)', () => {
  it('insets every word by the title-safe margin', () => {
    const html = slideHtml({ layout: 'text', heading: 'H', body: 'B' });
    expect(html).toContain(`inset:${Math.round(SLIDE_HEIGHT * TITLE_SAFE)}px `
      + `${Math.round(SLIDE_WIDTH * TITLE_SAFE)}px`);
  });

  it('clips rather than spills, so nothing can leave it', () => {
    const safe = /\s\.safe\{([^}]*)\}/.exec(
      slideHtml({ layout: 'text', body: 'B' }))?.[1] ?? '';
    expect(safe).toContain('overflow:hidden');
  });

  it('keeps title safe inside action safe, which is inside the frame', () => {
    expect(TITLE_SAFE).toBeGreaterThan(ACTION_SAFE);
    expect(ACTION_SAFE).toBeGreaterThan(0);
    expect(TITLE_SAFE).toBeLessThan(0.2);
  });

  /* A picture is the one thing allowed to reach the edge: that is what
     full bleed means, and it is why the plate is outside the safe box. */
  it('lets a filled picture run to the frame edge', () => {
    const html = slideHtml({ layout: 'picture', fill: true }, PIXEL);
    expect(html).toContain('class="plate"');
    expect(/\.plate\{[^}]*object-fit:cover/.test(html)).toBe(true);
  });
});

describe('four compositions, not four input modes (C-26)', () => {
  const spec = { heading: 'Heading', body: 'Body', footnote: 'Foot' } as const;

  it('draws a title card as a title card', () => {
    const html = slideHtml({ ...spec, layout: 'title' });
    expect(html).toContain('class="title"');
    expect(html).toContain(`font-size:${TYPE.title}px`);
    expect(html).not.toContain('<blockquote>');
  });

  it('draws an information slide top-aligned with its points', () => {
    const html = slideHtml({ ...spec, layout: 'text', body: '- one\n- two' });
    expect(html).toContain('class="col top"');
    expect(html).toContain('<ul><li>one</li>');
    expect(html).not.toContain('class="title"');
  });

  it('draws a quotation as a quotation', () => {
    const html = slideHtml({ ...spec, layout: 'quote' });
    expect(html).toContain('<blockquote>');
    expect(html).toContain('class="qm"');
    expect(html).toContain('— Foot');
  });

  /* The four are DIFFERENT, which is the whole claim. Measured as the
     set of composition classes each one emits. */
  it('gives each layout a shape none of the others has', () => {
    const shapeOf = (html: string) =>
      (html.match(/class="(?:col )?(title|qm|split|low|top)"?/g) ?? []).join();
    const shapes = (['title', 'text', 'picture', 'quote'] as const)
      .map((layout) => shapeOf(slideHtml({ ...spec, layout }, PIXEL)));
    expect(new Set(shapes).size).toBe(4);
  });
});

describe('fit and fill are two compositions (C-26)', () => {
  it('splits the frame when the picture fits', () => {
    const html = slideHtml(
      { layout: 'picture', heading: 'H', body: 'C' }, PIXEL);
    expect(html).toContain('class="split"');
    expect(html).not.toContain('class="plate"');
    /* Words BESIDE the picture, so neither is over the other. */
    expect(/\.split\{[^}]*grid-template-columns/.test(html)).toBe(true);
    /*
     * AND THE PICTURE ARRIVES WHOLE, which is the entire reason this
     * composition exists. The first version covered the split's box
     * too, and a 16:9 photograph in a portrait column lost both its
     * sides — a chart with its edge cropped off is exactly the fault
     * Fit is the answer to. Found by rendering it and looking.
     */
    expect(/\.plate-box img\{[^}]*object-fit:contain/.test(html)).toBe(true);
    expect(/\.plate-box img\{[^}]*object-position/.test(html)).toBe(false);
  });

  it('bleeds the picture and puts the words over it when it fills', () => {
    const html = slideHtml(
      { layout: 'picture', heading: 'H', fill: true }, PIXEL);
    expect(html).toContain('class="plate"');
    expect(html).toContain('class="scrim foot"');
    expect(html).toContain('class="col low"');
    expect(html).not.toContain('class="split"');
  });

  /* Words on a photograph are unreadable without one, and the scrim is
     the only reason the full-bleed composition is allowed to exist. */
  it('never puts words on a bare photograph', () => {
    const html = slideHtml(
      { layout: 'picture', heading: 'H', fill: true }, PIXEL);
    expect(html.indexOf('class="scrim'))
      .toBeLessThan(html.indexOf('class="safe"'));
  });

  /*
   * AND IT DARKENS WHERE THE WORDS ARE. A picture slide anchors its
   * caption to the bottom; a title over the same photograph puts its
   * headline in the middle. The first version used the foot gradient
   * for both and left the headline on the bright part of the
   * picture — found by rendering it and looking, not by reasoning.
   */
  it('puts the darkening under the words, not always at the foot', () => {
    expect(slideHtml({ layout: 'picture', heading: 'H', fill: true }, PIXEL))
      .toContain('class="scrim foot"');
    expect(slideHtml(
      { layout: 'title', heading: 'H', background: 'image' }, PIXEL))
      .toContain('class="scrim side"');
    expect(slideHtml(
      { layout: 'quote', body: 'Q', background: 'image' }, PIXEL))
      .toContain('class="scrim side"');
  });

  it('holds the part of the picture the operator chose', () => {
    expect(slideHtml({ layout: 'picture', fill: true, focus: 'top' }, PIXEL))
      .toContain('object-position:50% 18%');
    expect(slideHtml({ layout: 'picture', fill: true, focus: 'bottom' }, PIXEL))
      .toContain('object-position:50% 82%');
  });

  it('falls back to a split with a hole when there is no picture', () => {
    const html = slideHtml({ layout: 'picture', fill: true, heading: 'H' });
    expect(html).toContain('no picture');
    expect(html).not.toContain('<img');
  });
});

describe('five backgrounds, and they are design assets (C-26)', () => {
  it('offers exactly the five, each with a measurable base', () => {
    expect(BACKGROUNDS.map((one) => one.id))
      .toEqual(['black', 'white', 'light', 'studio', 'image']);
    for (const preset of BACKGROUNDS) {
      expect(preset.base, `${preset.id} has no flat colour to measure`)
        .toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('turns the ink over on a light background', () => {
    expect(slideHtml({ layout: 'title', heading: 'H', background: 'white' }))
      .toContain('background:#ffffff');
    expect(presetFor('white').ink).not.toBe(presetFor('black').ink);
  });

  it('keeps every preset legible by construction', () => {
    for (const preset of BACKGROUNDS) {
      expect(contrast(preset.ink, preset.base),
        `${preset.id} is unreadable`).toBeGreaterThan(7);
    }
  });

  it('lets the picture be the background when asked', () => {
    const html = slideHtml(
      { layout: 'title', heading: 'H', background: 'image' }, PIXEL);
    expect(html).toContain('class="plate"');
    expect(html).toContain('class="title"');
  });

  it('falls back to a colour when the image background has no image', () => {
    const html = slideHtml({ layout: 'title', heading: 'H', background: 'image' });
    expect(html).not.toContain('class="plate"');
    expect(html).toContain('background:#07090c');
  });

  it('draws one wash and only on the studio field', () => {
    expect(slideHtml({ layout: 'title', heading: 'H', background: 'studio' }))
      .toContain('class="wash"');
    expect(slideHtml({ layout: 'title', heading: 'H', background: 'black' }))
      .not.toContain('class="wash"');
  });
});

describe('the channel is present and quiet (C-26)', () => {
  it('colours the accent furniture rather than the words', () => {
    const html = slideHtml({
      layout: 'title', heading: 'Heading', body: 'Body',
      accent: '#ffcc00', channel: 'BalanceVid TV',
    });
    /* The eyebrow and the rule take the channel's colour. The TITLE
       does not: a headline in the station's yellow is a station
       shouting, and it was what made every authored slide look wrong. */
    expect(/\.eyebrow\{[^}]*color:#ffcc00/.test(html)).toBe(true);
    expect(/\.rule\{[^}]*background:#ffcc00/.test(html)).toBe(true);
    expect(/\.title\{[^}]*color:/.test(html)).toBe(false);
  });

  /*
   * ONCE, ON EVERY COMPOSITION. A name in two corners of the same
   * graphic is a station that does not trust the viewer to have seen
   * it, and it is the difference between identity and branding.
   */
  it('names the channel exactly once, whatever the composition', () => {
    for (const layout of ['title', 'text', 'picture', 'quote'] as const) {
      for (const fill of [false, true]) {
        const html = slideHtml({
          layout, fill, heading: 'H', body: 'B', footnote: 'F',
          channel: 'BalanceVid TV',
        }, PIXEL);
        expect(html.match(/BalanceVid TV/g)?.length,
          `${layout}${fill ? ' filled' : ''} names it the wrong number of times`)
          .toBe(1);
      }
    }
  });

  /* And where it goes is the composition's answer, not a setting: the
     two that open with something of their own put it in the foot. */
  it('puts it above the content, or in the foot where there is no room', () => {
    const atTop = (html: string) => /class="eyebrow"/.test(html);
    expect(atTop(slideHtml({ layout: 'title', heading: 'H', channel: 'BV' })))
      .toBe(true);
    expect(atTop(slideHtml({ layout: 'quote', body: 'Q', channel: 'BV' })))
      .toBe(false);
    expect(atTop(slideHtml(
      { layout: 'picture', fill: true, channel: 'BV' }, PIXEL))).toBe(false);
    expect(atTop(slideHtml({ layout: 'picture', channel: 'BV' }, PIXEL)))
      .toBe(true);
  });

  it('draws the mark at the smallest size the system allows', () => {
    const html = slideHtml({ layout: 'text', body: 'B', channel: 'BV' });
    expect(/\.foot\{[^}]*font-size:(\d+)px/.exec(html)?.[1])
      .toBe(String(TYPE.source));
  });

  it('refuses a colour that is not a colour', () => {
    const html = slideHtml({
      layout: 'title', heading: 'H', accent: 'red;}body{display:none',
    });
    expect(html).not.toContain('display:none');
  });

  it('escapes anything that would become markup', () => {
    const html = slideHtml({
      layout: 'text', heading: '<script>alert(1)</script>',
      body: '<img src=x onerror=alert(2)>', channel: '<b>x</b>',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('a slide is checked before it is READY (§21, D-04, C-26)', () => {
  it('calls an empty slide empty, once', () => {
    const found = slideProblems({ layout: 'text' });
    expect(found.map((one) => one.code)).toEqual(['empty']);
  });

  it('wants a picture on a picture slide', () => {
    expect(slideProblems({ layout: 'picture', heading: 'H' })
      .map((one) => one.code)).toContain('no-picture');
  });

  it('wants the words on a quote slide', () => {
    expect(slideProblems({ layout: 'quote', footnote: 'Somebody' })
      .map((one) => one.code)).toContain('no-words');
  });

  it('catches a heading too long for its layout', () => {
    const long = 'A heading that simply keeps going and going and going '
      + 'well past the point at which anybody could read it across a room';
    expect(slideProblems({ layout: 'title', heading: long })
      .map((one) => one.code)).toContain('long-heading');
    /* The limit is per layout: an information slide's heading is set
       smaller, so it holds fewer characters, not more. */
    expect(slideProblems({ layout: 'text', heading: long })
      .map((one) => one.code)).toContain('long-heading');
  });

  it('catches more text than the layout can show at a readable size', () => {
    expect(slideProblems({ layout: 'picture', heading: 'H',
      picture: 'ast_1', body: 'word '.repeat(60) })
      .map((one) => one.code)).toContain('long-body');
  });

  it('catches a list nobody can follow', () => {
    const points = Array.from({ length: 9 }, (_, n) => `- point ${n}`).join('\n');
    expect(slideProblems({ layout: 'text', body: points })
      .map((one) => one.code)).toContain('many-points');
  });

  /*
   * THE CHECK THAT CANNOT BE MADE BY LOOKING. A channel whose colour
   * is a deep blue produces an eyebrow and a rule nobody can see on
   * the Studio field, and in a bright control room it looks fine.
   */
  it('measures the channel colour against the background', () => {
    expect(slideProblems({ layout: 'title', heading: 'H',
      accent: '#10203a', background: 'black' })
      .map((one) => one.code)).toContain('contrast');
    expect(slideProblems({ layout: 'title', heading: 'H',
      accent: '#10203a', background: 'white' })
      .map((one) => one.code)).not.toContain('contrast');
  });

  /*
   * TWO LINES AND NOT ONE. A picture slide with no picture renders
   * the words "no picture" and transmits them, so nothing should
   * take it. A heading four characters long is a judgement, and the
   * operator in the middle of a live programme makes it — a control
   * room that refuses to put anything up until it is perfect is a
   * control room somebody works around. [§5, D-04]
   */
  it('separates what is broken from what is merely imperfect', () => {
    const broken = slideProblems({ layout: 'picture', heading: 'H' });
    expect(broken.some((one) => one.blocking)).toBe(true);

    const long = { layout: 'title',
      heading: 'A heading that keeps going well past the point at which '
        + 'anybody could read it from across a room' } as const;
    expect(slideProblems(long)).not.toEqual([]);
    /* Said, and still allowed on the wire. */
    expect(slideProblems(long).every((one) => !one.blocking)).toBe(true);
  });

  /*
   * WHAT READY MEANS IS NOW ANSWERED IN `deck.ts`, by `standingOf`,
   * which is the only thing that ever asks it. The two predicates
   * tested here before had no caller at all — see
   * `deck-standing.test.ts` for the line they drew, drawn where
   * something reads it. [C-36]
   */
  it('finds nothing wrong with a slide that has nothing wrong with it', () => {
    const good = { layout: 'title', heading: 'Live from the control room',
      body: 'Written in the studio.', accent: '#4aa3ff' } as const;
    expect(slideProblems(good)).toEqual([]);
    expect(slideProblems({ layout: 'text' })).not.toEqual([]);
  });
});
