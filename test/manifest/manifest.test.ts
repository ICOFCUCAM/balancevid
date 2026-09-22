import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../src/manifest/build.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';

const AT = '2026-09-22T12:00:00.000Z';

function embedded() {
  return makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
    makeIntervention(S(300), S(15), { type: 'context' }),
  ], {
    class: 'B', mezzanineAssetId: undefined,
    provider: 'youtube', providerVideoId: 'dQw4w9WgXcQ',
    embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0&playsinline=1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });
}

/**
 * "The viewer sees the full conversation; the provider serves their own video,
 *  keeps their analytics, and their monetisation is intact." [U-01]
 */
describe('the conversation manifest (U-01, D-08)', () => {
  it('describes the whole exchange in order', () => {
    const manifest = buildManifest({ conversation: embedded(), generatedAt: AT });
    expect(manifest.segments.map((s) => s.kind))
      .toEqual(['source', 'response', 'source', 'response', 'source']);
  });

  it('sends the viewer to the provider\'s own player, never to media', () => {
    const manifest = buildManifest({ conversation: embedded(), generatedAt: AT });
    expect(manifest.source.embedUrl).toContain('youtube-nocookie.com/embed/');
    expect(manifest.source.canonicalUrl).toContain('youtube.com/watch');
    expect(manifest.source.playbackUrl).toBeUndefined();
    // Nothing anywhere in a Class B manifest points at provider media.
    expect(JSON.stringify(manifest)).not.toMatch(/\.(mp4|webm|m3u8|mpd)(["'?]|$)/);
  });

  it('resumes the provider at exactly the frame it was stopped (U-07)', () => {
    const manifest = buildManifest({ conversation: embedded(), generatedAt: AT });
    const [before, response, after] = manifest.segments as [any, any, any];
    expect(before.sourceOutFrame).toBe(S(100));
    expect(response.anchorFrame).toBe(S(100));
    expect(after.sourceInFrame).toBe(S(100));
  });

  it('carries the claim each response answers', () => {
    const manifest = buildManifest({ conversation: embedded(), generatedAt: AT });
    const response = manifest.segments.find((s) => s.kind === 'response') as any;
    expect(response.claim).toBe('The policy worked.');
    expect(response.typeLabel).toBe('CRITIQUE');
  });

  it('carries the generated attribution, like every other export (U-21)', () => {
    const manifest = buildManifest({ conversation: embedded(), generatedAt: AT });
    expect(manifest.attribution).toContain('The History of Europe');
  });

  it('points a governed source at our own player instead of an embed', () => {
    const conversation = makeConversation(S(600), [makeIntervention(S(100), S(20))]);
    const manifest = buildManifest({ conversation, generatedAt: AT });
    expect(manifest.source.class).toBe('A');
    expect(manifest.source.playbackUrl).toContain('/source');
    expect(manifest.source.embedUrl).toBeUndefined();
  });

  it('is the same document either way — only the player differs (U-01)', () => {
    const b = buildManifest({ conversation: embedded(), generatedAt: AT });
    const a = buildManifest({
      conversation: makeConversation(S(600), [
        makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
        makeIntervention(S(300), S(15), { type: 'context' }),
      ]),
      generatedAt: AT,
    });
    const shape = (m: typeof a) => m.segments.map((s) =>
      s.kind === 'source' ? `src:${s.sourceInFrame}-${s.sourceOutFrame}` : `res:${s.anchorFrame}`);
    expect(shape(b)).toEqual(shape(a));
  });
});
