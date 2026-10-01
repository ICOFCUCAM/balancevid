/**
 * Slides written rather than uploaded.  [Doctrine CHANNEL §21, D-06]
 *
 * The layout rules are asserted on the HTML rather than on a screenshot:
 * a test that compared pixels would be a test of a font, and it would fail
 * on the machine that has a different one. What matters here is that the
 * four layouts differ, that typed text becomes the structure somebody
 * expects, and that nothing typed can escape into the page.
 *
 * FIVE OF THESE MOVED RATHER THAN WENT. C-26 replaced the four
 * layouts with four compositions, so the assertions about which CSS
 * class each one emitted, and about the channel's colour being
 * applied to every word, are now made — more strictly — in
 * `slide-design.test.ts`:
 *
 *   "draws each layout differently"   → "gives each layout a shape
 *                                        none of the others has"
 *   "takes a real colour"             → "colours the accent furniture
 *                                        rather than the words"
 *   the three `object-fit` ones       → "splits the frame when the
 *                                        picture fits" and the two
 *                                        full-bleed ones
 *
 * What stays here is this file's own subject: what typed text becomes
 * and what it cannot do.
 */

import { describe, expect, it } from 'vitest';

import {
  SLIDE_HEIGHT, SLIDE_WIDTH, slideHtml,
} from '../../src/render/slide.js';

describe('the shape of a slide', () => {
  it('is 16:9 at the house height, so it fills the frame unscaled', () => {
    expect(SLIDE_WIDTH / SLIDE_HEIGHT).toBeCloseTo(16 / 9, 5);
    const html = slideHtml({ layout: 'text', heading: 'Hello' });
    expect(html).toContain(`width:${SLIDE_WIDTH}px`);
    expect(html).toContain(`height:${SLIDE_HEIGHT}px`);
  });
});

describe('what typed text becomes', () => {
  it('turns blank lines into paragraphs', () => {
    const html = slideHtml({ layout: 'text', body: 'One.\n\nTwo.' });
    expect(html).toContain('<p>One.</p>');
    expect(html).toContain('<p>Two.</p>');
  });

  it('turns a block of dashes into a list', () => {
    const html = slideHtml({ layout: 'text', body: '- first\n- second' });
    expect(html).toContain('<ul><li>first</li><li>second</li></ul>');
  });

  /* A line that merely starts with a dash inside a paragraph is prose. */
  it('does not make a list out of a paragraph that happens to contain one', () => {
    const html = slideHtml({ layout: 'text', body: 'A sentence\n- and a dash' });
    expect(html).not.toContain('<ul>');
    expect(html).toContain('<p>A sentence - and a dash</p>');
  });

  it('joins wrapped lines rather than breaking them', () => {
    const html = slideHtml({ layout: 'text', body: 'one\ntwo\nthree' });
    expect(html).toContain('<p>one two three</p>');
  });
});

describe('what typed text cannot do', () => {
  /*
   * A SLIDE IS UNTRUSTED TEXT. It is rendered in a browser, so anything
   * that escaped into the page would be script running in the renderer —
   * the same reason the PDF rasteriser aborts every request. [D-06]
   */
  it('escapes anything that would become markup', () => {
    const html = slideHtml({
      layout: 'text',
      heading: '<script>alert(1)</script>',
      body: '<img src=x onerror=alert(2)>',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses a colour that is not a colour', () => {
    const html = slideHtml({
      layout: 'text', heading: 'H', accent: 'red;}body{display:none',
    });
    expect(html).not.toContain('display:none');
    expect(html).toContain('color:#ffffff');
  });

  /* The picture is inlined by the renderer or it is absent. A slide can
     never name a URL, so there is nothing for it to fetch. */
  it('shows a hole rather than a link when there is no picture', () => {
    const html = slideHtml({ layout: 'picture', heading: 'H' });
    expect(html).toContain('no picture');
    expect(html).not.toContain('<img');
  });

  it('inlines a picture it was given, as bytes', () => {
    const html = slideHtml({ layout: 'picture' }, 'data:image/png;base64,AAAA');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });
});

/**
 * Two additions, and a long list of things deliberately not added.
 * [CHANNEL §21, C-25]
 *
 * The panel that makes these slides was rebuilt to be read at a glance
 * and operated between two cues. The renderer took two of that work's
 * requests and refused the rest: a numbered list, because a numbered
 * list is STRUCTURE and a bullet already exists; and a picture that
 * fills the frame, because the alternative to fitting is a real
 * editorial choice an operator makes about a photograph. Bold,
 * italics, alignment and line spacing are decoration, and this file's
 * own module says why they are absent.
 */
describe('a numbered list is structure, so it is interpreted (C-25)', () => {
  it('turns a block of numbered lines into an ordered list', () => {
    const html = slideHtml({ layout: 'text', body: '1. first\n2. second' });
    expect(html).toContain('<li>first</li><li>second</li></ol>');
    expect(html).not.toContain('<ul>');
  });

  /*
   * THE NUMBERS ARE THE AUTHOR'S. A presenter whose list ran to five on
   * the previous slide types `6.` on this one, and a renderer that
   * restarted at one would have renumbered their talk for them.
   */
  it('starts from the number the author typed', () => {
    expect(slideHtml({ layout: 'text', body: '6. sixth\n7. seventh' }))
      .toContain('<ol start="6">');
    expect(slideHtml({ layout: 'text', body: '1. first\n2. second' }))
      .toContain('<ol start="1">');
  });

  it('takes the bracket form somebody else’s editor produces', () => {
    expect(slideHtml({ layout: 'text', body: '1) first\n2) second' }))
      .toContain('<ol start="1"><li>first</li>');
  });

  /* The same rule the dashes get: one numbered line in prose is prose. */
  it('does not make a list out of a paragraph that mentions a number', () => {
    const html = slideHtml({ layout: 'text', body: 'As follows\n1. first' });
    expect(html).not.toContain('<ol');
    expect(html).toContain('<p>As follows 1. first</p>');
  });

  it('styles an ordered list like the bulleted one it sits beside', () => {
    /* Two lists on consecutive slides with different leading would read
       as two different decks. */
    const css = /ul,ol\{([^}]*)\}/.exec(
      slideHtml({ layout: 'text', body: '1. first' }))?.[1] ?? '';
    expect(css).toContain('padding-left');
    expect(css).toContain('gap');
  });
});

describe('fit or fill, and nothing between them (C-25)', () => {
  const PIXEL = 'data:image/png;base64,AAAA';

  /* Fill is a statement about a picture. A layout with no picture in it
     has nothing to fill, and the flag is stored anyway because the
     operator may change the layout afterwards. */
  it('means nothing on a layout that has no picture', () => {
    /* Not just "not on the shot": not on ANY element. The cheap way to
       implement filling is a class on the root, and that would letterbox
       nothing and cover every text slide the operator ever flagged. */
    const html = slideHtml({ layout: 'text', body: 'B', fill: true });
    expect(/class="[^"]*bleed/.test(html)).toBe(false);
  });
});
