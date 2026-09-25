/**
 * The conversation, to move around in.  [Doctrine D-16, U-14, U-31, D-04]
 *
 * Two claims are defended here, and both are about what the page must NOT be.
 *
 *   IT MUST NOT NEED A SCRIPT TO BE A DOCUMENT. The product promised an
 *   accessible form of every conversation (U-14). A page whose content appears
 *   only after JavaScript runs is not one, however good the seeking is. So the
 *   tests read the markup with the script removed and expect the whole
 *   argument still to be there.
 *
 *   IT MUST NOT PLAY THE AUTHOR'S WORKING MATERIAL. Publishing publishes ONE
 *   video (U-31, INV-15). A page that played the newest render on disk would
 *   show a reader a draft, and two readers sent the same link would see
 *   different things.
 */
import { describe, expect, it } from 'vitest';

import { generateInteractive } from '../../src/interactive/generate.js';
import { renderInteractive } from '../../src/interactive/html.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { addAnnotation } from '../../src/domain/edit.js';
import { S, makeConversation, makeIntervention, makeTake } from '../domain/fixtures.js';
import type { Annotation, AnnotationId, Conversation } from '../../src/domain/document.js';

const AT = '2026-01-01T00:00:00.000Z';

function answered(n: number, quote?: string): Conversation {
  const conversation = makeConversation(
    S(600),
    Array.from({ length: n }, (_, i) => makeIntervention(
      S(60 * (i + 1)), S(20), quote ? { type: 'critique', quote } : { type: 'critique' })),
  );
  for (const intervention of conversation.interventions) {
    intervention.takes = [makeTake(S(20))];
    intervention.selectedTakeId = intervention.takes[0]!.id;
  }
  return conversation;
}

const build = (conversation: Conversation) =>
  generateInteractive({ conversation, generatedAt: AT });

/** The page with every <script> removed: what a reader without JS gets. */
const withoutScript = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '');

describe('what the page is made of', () => {
  it('is the article, rearranged — every exchange, in order', () => {
    const doc = build(answered(3, 'Growth was the highest in Europe.'));
    expect(doc.exchanges).toHaveLength(3);
    expect(doc.exchanges.map((e) => e.index)).toEqual([1, 2, 3]);
    expect(doc.exchanges[0]!.claim?.text).toBe('Growth was the highest in Europe.');
  });

  it('converts the output frame to seconds once, here, and keeps the frame', () => {
    const doc = build(answered(1));
    const exchange = doc.exchanges[0]!;
    expect(exchange.outputStartFrame).toBeDefined();
    expect(exchange.seekSeconds).toBeCloseTo(exchange.outputStartFrame! / HOUSE_FPS, 3);
  });

  it('counts the marks so a reader knows something is being pointed at', () => {
    const conversation = answered(2);
    const mark = (): Annotation => ({
      id: 'ann_1' as AnnotationId, kind: 'ellipse',
      points: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.6 }], style: {}, z: 0,
    });
    addAnnotation(conversation, conversation.interventions[0]!.id, mark());
    const doc = build(conversation);
    expect(doc.exchanges[0]!.marks).toBe(1);
    expect(doc.exchanges[1]!.marks).toBe(0);
    expect(renderInteractive(doc)).toContain('One mark on the frame');
  });
});

describe('which video it plays (U-31, INV-15)', () => {
  it('none at all for a draft, and says so rather than showing a dead player', () => {
    const doc = build(answered(1));
    expect(doc.video).toBeUndefined();
    const html = renderInteractive(doc);
    expect(html).toContain('has not published a video yet');
    expect(html).not.toContain('<video');
  });

  it('the one the publication names, and only that one', () => {
    const conversation = answered(1);
    conversation.publication = {
      publishedAt: AT, respondable: true, planHash: 'abc123',
    };
    const doc = build(conversation);
    expect(doc.video?.planHash).toBe('abc123');
    expect(doc.video?.src).toContain('/renders/abc123/file');
    // The captions ship with every export, so the page that plays it offers
    // them rather than leaving a reader to find them. [INV-07]
    expect(doc.video?.captions).toContain('kind=vtt');
  });

  it('and nothing once it has been withdrawn', () => {
    const conversation = answered(1);
    conversation.publication = {
      publishedAt: AT, respondable: true, planHash: 'abc123', unpublishedAt: AT,
    };
    expect(build(conversation).video).toBeUndefined();
  });
});

describe('without JavaScript (U-14, D-04)', () => {
  const conversation = (() => {
    const c = answered(2, 'Growth was the highest in Europe.');
    c.publication = { publishedAt: AT, respondable: true, planHash: 'abc123' };
    return c;
  })();
  const plain = withoutScript(renderInteractive(build(conversation)));

  it('the whole argument is still in the markup', () => {
    expect(plain).toContain('Growth was the highest in Europe.');
    expect(plain).toContain('id="e1"');
    expect(plain).toContain('id="e2"');
  });

  it('the index is ordinary anchors that jump down the page', () => {
    expect(plain).toContain('href="#e1"');
    expect(plain).toContain('href="#e2"');
  });

  it('the video is still there, with its captions, playable from the start', () => {
    expect(plain).toContain('<video');
    expect(plain).toContain('kind="captions"');
  });

  it('and the timecodes are readable text, not something a script fills in', () => {
    expect(plain).toMatch(/<span class="stamp">\d\d:\d\d:\d\d/);
  });
});

describe('what it says about itself', () => {
  it('escapes everything, because all of it is somebody else\'s text', () => {
    const conversation = answered(1, '<script>alert(1)</script> & "quoted"');
    conversation.title = 'A <b>title</b>';
    const html = renderInteractive(build(conversation));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &lt;b&gt;title&lt;/b&gt;');
  });

  it('never omits the attribution', () => {
    // Escaped exactly as the page escapes it: the attribution names a source
    // whose title has an apostrophe in it more often than not.
    const esc = (value: string) => value
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const doc = build(answered(1));
    expect(doc.attribution.length).toBeGreaterThan(0);
    expect(renderInteractive(doc)).toContain(esc(doc.attribution));
  });

  /*
   * D-16's rule, checked at the one point it is easy to break: the page is
   * generated twice from the same document and must be the same bytes. A page
   * that read the clock, or ordered a Map, would pass every other test here
   * and fail the rebuild.
   */
  it('is reproducible from its inputs alone', () => {
    const conversation = answered(3, 'Growth was the highest in Europe.');
    expect(renderInteractive(build(conversation)))
      .toBe(renderInteractive(build(conversation)));
  });
});
