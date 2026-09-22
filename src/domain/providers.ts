/**
 * Embedded source providers.  [Doctrine U-01, U-35 §6]
 *
 * A Class B source is played through the provider's own official embed and is
 * never fetched, never downloaded, never decoded by us. This module only
 * recognises a URL and says which embed to honour.
 *
 * "Nothing in the product downloads from a platform that forbids it. No
 *  exceptions, no user-supplied workarounds, no third-party extraction
 *  integrations. This rule is not subject to growth arguments." (U-35 §6)
 *
 * There is deliberately no function here that returns a media URL. There is
 * nowhere for one to be added without it being obvious in review.
 */

export type ProviderId = 'youtube' | 'vimeo';

export interface EmbeddedSource {
  provider: ProviderId;
  videoId: string;
  /** Where a viewer should be sent to watch it on the provider. */
  canonicalUrl: string;
  /** The provider's own player, which is the only way we show their video. */
  embedUrl: string;
  /** Where to ask for the title, without an API key. */
  oembedUrl: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

/**
 * Recognise a URL, or return null.
 *
 * Returning null is the honest answer for anything we cannot embed officially:
 * the alternative is guessing, and a guess here becomes a download.
 */
export function parseProviderUrl(raw: string): EmbeddedSource | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'youtu.be') {
    return youtube(url.pathname.slice(1).split('/')[0] ?? '');
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') return youtube(url.searchParams.get('v') ?? '');
    const embedMatch = /^\/embed\/([^/]+)/.exec(url.pathname);
    if (embedMatch?.[1]) return youtube(embedMatch[1]);
    const shortsMatch = /^\/shorts\/([^/]+)/.exec(url.pathname);
    if (shortsMatch?.[1]) return youtube(shortsMatch[1]);
    const liveMatch = /^\/live\/([^/]+)/.exec(url.pathname);
    if (liveMatch?.[1]) return youtube(liveMatch[1]);
    return null;
  }
  if (host === 'youtube-nocookie.com') {
    const embedMatch = /^\/embed\/([^/]+)/.exec(url.pathname);
    return embedMatch?.[1] ? youtube(embedMatch[1]) : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /(\d{6,12})/.exec(url.pathname)?.[1];
    return id ? vimeo(id) : null;
  }
  return null;
}

function youtube(id: string): EmbeddedSource | null {
  if (!YOUTUBE_ID.test(id)) return null;
  return {
    provider: 'youtube',
    videoId: id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    // The privacy-preserving host, and no autoplay: the viewer decides.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&playsinline=1`,
    oembedUrl: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
  };
}

function vimeo(id: string): EmbeddedSource | null {
  if (!VIMEO_ID.test(id)) return null;
  return {
    provider: 'vimeo',
    videoId: id,
    canonicalUrl: `https://vimeo.com/${id}`,
    embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
    oembedUrl: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`,
  };
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
};
