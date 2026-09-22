import { describe, expect, it } from 'vitest';
import { parseProviderUrl } from '../../src/domain/providers.js';

describe('recognising an embeddable source (U-01)', () => {
  it('recognises the forms a YouTube link actually takes', () => {
    const forms = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=42',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ];
    for (const form of forms) {
      expect(parseProviderUrl(form)?.videoId, form).toBe('dQw4w9WgXcQ');
    }
  });

  it('recognises Vimeo', () => {
    expect(parseProviderUrl('https://vimeo.com/123456789')?.videoId).toBe('123456789');
    expect(parseProviderUrl('https://player.vimeo.com/video/123456789')?.provider).toBe('vimeo');
  });

  it('embeds through the provider, and sends viewers to the provider', () => {
    const source = parseProviderUrl('https://youtu.be/dQw4w9WgXcQ')!;
    expect(source.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(source.embedUrl).toContain('youtube-nocookie.com/embed/');
    // The viewer decides when it plays.
    expect(source.embedUrl).not.toContain('autoplay=1');
  });

  it('returns null rather than guessing', () => {
    for (const form of [
      'https://www.youtube.com/', 'https://www.youtube.com/watch',
      'https://www.youtube.com/watch?v=short', 'https://vimeo.com/',
      'https://example.org/video.mp4', 'not a url', 'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(parseProviderUrl(form), form).toBeNull();
    }
  });

  it('exposes no way to reach the media itself', () => {
    const source = parseProviderUrl('https://youtu.be/dQw4w9WgXcQ')!;
    // Every URL this module produces is a page or an official embed. If a
    // media URL ever appears here, the rule in U-35 §6 has been broken.
    for (const value of Object.values(source)) {
      expect(String(value)).not.toMatch(/\.(mp4|webm|m3u8|mpd)(\?|$)/);
    }
  });
});
