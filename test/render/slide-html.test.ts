/**
 * Slides written rather than uploaded.  [Doctrine CHANNEL §21, D-06]
 *
 * The layout rules are asserted on the HTML rather than on a screenshot:
 * a test that compared pixels would be a test of a font, and it would fail
 * on the machine that has a different one. What matters here is that the
 * four layouts differ, that typed text becomes the structure somebody
 * expects, and that nothing typed can escape into the page.
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

  /* Four layouts that are different from each other, which is what makes
     "diverse" mean something. */
  it('draws each layout differently', () => {
    const spec = { heading: 'H', body: 'B', footnote: 'F' } as const;
    const title = slideHtml({ ...spec, layout: 'title' });
    const text = slideHtml({ ...spec, layout: 'text' });
    const quote = slideHtml({ ...spec, layout: 'quote' });
    const picture = slideHtml({ ...spec, layout: 'picture' });

    expect(title).toContain('class="big"');
    expect(quote).toContain('<blockquote>');
    expect(quote).toContain('— F');
    expect(picture).toContain('class="shot"');
    expect(text).not.toContain('<blockquote>');
    expect(text).not.toContain('class="big"');
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
      layout: 'text', heading: 'H', ink: 'red;}body{display:none',
    });
    expect(html).not.toContain('display:none');
    expect(html).toContain('color:#ffffff');
  });

  it('takes a real colour', () => {
    expect(slideHtml({ layout: 'text', heading: 'H', ink: '#ffcc00' }))
      .toContain('color:#ffcc00');
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
