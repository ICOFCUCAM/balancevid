import { describe, expect, it } from 'vitest';
import { generateArticle } from '../../src/article/generate.js';
import { renderMarkdown } from '../../src/article/markdown.js';
import { renderHtml } from '../../src/article/html.js';
import { REPRESENTATIONS, rebuildAll } from '../../src/representations/registry.js';
import { segment } from '../../src/transcribe/segmentation.js';
import { TRANSCRIPT_VERSION, type Transcript } from '../../src/transcribe/types.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { quoteHash } from '../../src/domain/ids.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';

const F = (seconds: number) => Math.round(seconds * HOUSE_FPS);
const AT = '2026-09-22T12:00:00.000Z';

function transcript(spec: Array<[string, number, number]>): Transcript {
  const words = spec.map(([text, start, end]) => ({
    text, startFrame: F(start), endFrame: F(end), segment: 0,
  }));
  const { sentences, paragraphs } = segment(words);
  return {
    version: TRANSCRIPT_VERSION,
    engine: 'sherpa-onnx', model: 'zipformer-en', language: 'en',
    characteristics: { punctuation: false, casing: 'upper', speakerLabels: false },
    createdAt: AT, assetId: 'asset_x', durationFrames: F(600),
    words, sentences, paragraphs,
  };
}

function fixture() {
  const claim = 'The policy was clearly successful.';
  const conversation = makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: claim }),
    makeIntervention(S(300), S(15), { type: 'context' }),
  ]);
  const sourceTranscript = transcript([
    ['THEREFORE', 298, 298.5], ['THE', 298.5, 298.8], ['POLICY', 298.8, 299.4],
    ['WORKED', 299.4, 300],
  ]);
  const takeTranscripts = new Map<string, Transcript>();
  const take = conversation.interventions[0]!.takes[0]!;
  // Words before mediaIn are pre-roll: said before the author decided to speak.
  takeTranscripts.set(take.id, transcript([
    ['UM', 1, 1.3],
    ['THAT', take.mediaInFrame / HOUSE_FPS + 0.2, take.mediaInFrame / HOUSE_FPS + 0.6],
    ['DOES', take.mediaInFrame / HOUSE_FPS + 0.6, take.mediaInFrame / HOUSE_FPS + 0.9],
    ['NOT', take.mediaInFrame / HOUSE_FPS + 0.9, take.mediaInFrame / HOUSE_FPS + 1.2],
    ['FOLLOW', take.mediaInFrame / HOUSE_FPS + 1.2, take.mediaInFrame / HOUSE_FPS + 1.7],
  ]));
  return { conversation, sourceTranscript, takeTranscripts, claim };
}

describe('the article (U-14)', () => {
  const { conversation, sourceTranscript, takeTranscripts, claim } = fixture();
  const article = generateArticle({
    conversation, sourceTranscript, takeTranscripts, transcriptVersion: 1, generatedAt: AT,
  });

  it('lists exchanges in source order, numbered for citation', () => {
    expect(article.exchanges.map((e) => e.index)).toEqual([1, 2]);
    expect(article.exchanges[0]!.tSourceFrame).toBeLessThan(article.exchanges[1]!.tSourceFrame);
    expect(article.exchanges[0]!.timecode).toBe('00:01:40.000');
  });

  it('carries the bound claim with its hash (U-10, INV-05)', () => {
    expect(article.exchanges[0]!.claim).toMatchObject({ text: claim, hash: quoteHash(claim) });
  });

  it('falls back to the sentence being answered when no claim was bound', () => {
    expect(article.exchanges[0]!.context).toBeUndefined();
    expect(article.exchanges[1]!.claim).toBeUndefined();
    expect(article.exchanges[1]!.context).toBe('Therefore the policy worked');
  });

  it('prints only what the author kept, excluding the pre-roll', () => {
    // "UM" was captured before the key press and trimmed away by default.
    expect(article.exchanges[0]!.response.text).toBe('That does not follow');
    expect(article.exchanges[0]!.response.text).not.toContain('Um');
  });

  it('says so plainly when a response has no transcript, rather than inventing one', () => {
    expect(article.exchanges[1]!.response.text).toBeNull();
    expect(renderMarkdown(article)).toContain('no transcript available');
  });

  it('carries the generated attribution, which the author never typed (U-21)', () => {
    expect(article.attribution).toContain('The History of Europe');
    expect(article.attribution).toContain('Example Channel');
    expect(renderMarkdown(article)).toContain(article.attribution);
    expect(renderHtml(article)).toContain('Example Channel');
  });

  it('states its provenance, including what the engine cannot do (U-15)', () => {
    expect(article.provenance.transcriptionEngine).toBe('sherpa-onnx');
    expect(article.provenance.notes.join(' ')).toContain('spoken by the author');
    expect(article.provenance.notes.join(' ')).toContain('no punctuation');
  });

  it('reports the source-to-response ratio (U-35)', () => {
    expect(article.stats.sourceRatio).toBeGreaterThan(0);
    expect(article.stats.sourceRatio).toBeLessThanOrEqual(1);
    expect(article.stats.exchanges).toBe(2);
  });

  it('quotes the claim but does not reproduce the source transcript', () => {
    const markdown = renderMarkdown(article);
    expect(markdown).toContain(claim);
    // Only the one sentence being answered appears, not the whole transcript.
    const quoted = markdown.split('\n').filter((l) => l.startsWith('> '));
    expect(quoted.length).toBeLessThanOrEqual(3);
  });
});

describe('citations (U-33 §4)', () => {
  function withEvidence(archived = true) {
    const { conversation, sourceTranscript, takeTranscripts } = fixture();
    conversation.interventions[0]!.evidence = [{
      id: 'ev_1' as never,
      kind: 'web',
      title: 'ONS — unemployment, Q3',
      url: 'https://example.org/ons',
      retrievedAt: '2026-09-20T09:30:00.000Z',
      contentHash: 'a1b2c3d4e5f60718293a',
      locator: { quote: 'unemployment fell by 3%', page: 4 },
      archived,
    }];
    return {
      article: generateArticle({ conversation, sourceTranscript, takeTranscripts, generatedAt: AT }),
    };
  }

  it('cites evidence with its retrieval date and hash', () => {
    const { article } = withEvidence();
    expect(article.exchanges[0]!.citations).toHaveLength(1);
    const markdown = renderMarkdown(article);
    expect(markdown).toContain('ONS — unemployment, Q3');
    expect(markdown).toContain('retrieved 2026-09-20');
    expect(markdown).toContain('a1b2c3d4e5f6');
    expect(markdown).toContain('p. 4');
    expect(markdown).toContain('unemployment fell by 3%');
  });

  it('says when an archive failed rather than presenting it as sound', () => {
    const { article } = withEvidence(false);
    expect(renderMarkdown(article)).toContain('not archived');
    expect(renderHtml(article)).toContain('not archived');
  });

  it('links the citation without passing on authority', () => {
    const { article } = withEvidence();
    expect(renderHtml(article)).toContain('rel="nofollow noreferrer"');
  });
});

describe('the article as a document', () => {
  const { conversation, sourceTranscript, takeTranscripts } = fixture();

  it('escapes everything that reaches the HTML', () => {
    const hostile = structuredClone(conversation);
    hostile.title = '<script>alert(1)</script>';
    hostile.source.creator = '"><img src=x onerror=alert(1)>';
    const html = renderHtml(generateArticle({
      conversation: hostile, sourceTranscript, takeTranscripts, generatedAt: AT,
    }));
    // The payload may survive as literal TEXT -- that is what escaping is for.
    // What must not survive is any of it becoming markup.
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    // The quote that would have closed the attribute is itself escaped, so the
    // payload stays inside the value it was injected into.
    expect(html).toContain('&quot;&gt;&lt;img src=x');
  });

  it('links back into the editor at the anchored frame', () => {
    const html = renderHtml(
      generateArticle({ conversation, sourceTranscript, takeTranscripts, generatedAt: AT }),
      { conversationHref: (frame) => `/c/${conversation.id}?t=${frame}` },
    );
    expect(html).toContain(`/c/${conversation.id}?t=${S(100)}`);
  });

  it('is a complete standalone document with no scripts to load', () => {
    const html = renderHtml(generateArticle({ conversation, generatedAt: AT }));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toContain('<script');
  });
});

/**
 * D-16's rebuild test.
 *
 * "For every fixture conversation, every registered representation is deleted
 *  and regenerated, and the result must match byte-for-byte. A representation
 *  that cannot survive deletion is a fork and fails the build."
 */
describe('representations rebuild from the Conversation alone (INV-00, D-16)', () => {
  const { conversation, sourceTranscript, takeTranscripts } = fixture();
  const context = { conversation, sourceTranscript, takeTranscripts, transcriptVersion: 1, generatedAt: AT };

  it('regenerates every representation byte-for-byte', () => {
    const first = rebuildAll(context);
    const second = rebuildAll(context);
    expect([...first.keys()].sort()).toEqual([...second.keys()].sort());
    for (const [id, value] of first) {
      expect(second.get(id), `${id} is not reproducible`).toBe(value);
    }
  });

  it('produces every representation the registry declares available', () => {
    const built = rebuildAll(context);
    for (const representation of REPRESENTATIONS) {
      if (!representation.available(context)) continue;
      expect(built.has(representation.id), `${representation.id} was not built`).toBe(true);
      expect(built.get(representation.id)!.length).toBeGreaterThan(0);
    }
  });

  it('declares, for every representation, which parts of the Conversation it reads', () => {
    for (const representation of REPRESENTATIONS) {
      expect(representation.inputs.length, `${representation.id} declares no inputs`)
        .toBeGreaterThan(0);
    }
  });

  it('withholds the render plan for a source that cannot produce one (INV-01, INV-04)', () => {
    const embedded = structuredClone(conversation);
    embedded.source.class = 'B';
    delete embedded.source.mezzanineAssetId;
    const built = rebuildAll({ ...context, conversation: embedded });
    expect(built.has('render-plan.json')).toBe(false);
    // The article still builds: a Class B conversation is a real conversation.
    expect(built.has('article.md')).toBe(true);
  });
});

/**
 * What the article says about itself when somebody shares it.  [U-31, D-03]
 *
 * The article is the form of a conversation that gets cited, so it is the one
 * most likely to be pasted somewhere. What is defended here is that a draft
 * says nothing at all, and that a title containing a quotation mark — which
 * every title in this product does, because they quote the source — cannot
 * break out of the attribute it is written into.
 */
describe('the article as a shared link', () => {
  const share = (over: Record<string, unknown> = {}) => ({
    card: {
      title: 'My Response to "The History of Europe"',
      description: 'Answering “The History of Europe”. 2 responses · 04:12.',
      hero: { text: 'Rome fell in 476.', quoted: true },
      eyebrow: 'Answering “The History of Europe”',
      attribution: 'Source: "The History of Europe"',
      scale: '2 responses · 04:12',
      image: { width: 1200, height: 630, alt: 'A response' },
    },
    pageUrl: 'https://example.test/c/conv_1/article',
    imageUrl: 'https://example.test/api/conversations/conv_1/card',
    ...over,
  });

  it('a draft carries no preview of any kind', () => {
    const { conversation, sourceTranscript } = fixture();
    const html = renderHtml(
      generateArticle({ conversation, sourceTranscript, generatedAt: AT }));
    expect(html).not.toContain('og:title');
    expect(html).not.toContain('twitter:card');
  });

  it('a published one describes itself in the card\'s own words', () => {
    const { conversation, sourceTranscript } = fixture();
    const html = renderHtml(
      generateArticle({ conversation, sourceTranscript, generatedAt: AT }),
      { share: share() as never });
    expect(html).toContain('<meta property="og:image" content="https://example.test'
      + '/api/conversations/conv_1/card">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
  });

  it('and a quotation mark in the title cannot break out of the tag', () => {
    /*
     * Every title in this product quotes the source, so this is the normal
     * case rather than an exotic one. Unescaped it would close the attribute
     * and put whatever followed into the document as markup.
     */
    const { conversation, sourceTranscript } = fixture();
    const html = renderHtml(
      generateArticle({ conversation, sourceTranscript, generatedAt: AT }),
      { share: share() as never });
    expect(html).toContain('content="My Response to &quot;The History of Europe&quot;"');
    expect(html).not.toContain('content="My Response to "The');
  });

  it('claiming a picture only when there is one to claim', () => {
    const { conversation, sourceTranscript } = fixture();
    const without = share();
    delete (without as { imageUrl?: string }).imageUrl;
    const html = renderHtml(
      generateArticle({ conversation, sourceTranscript, generatedAt: AT }),
      { share: without as never });
    expect(html).toContain('<meta property="og:title"');
    expect(html).not.toContain('og:image');
    // Still previewable, just without a picture.
    expect(html).toContain('<meta name="twitter:card" content="summary">');
  });
});
