import { parseProviderUrl, PROVIDER_LABELS } from '../../../../src/domain/providers.js';
import { assertPublicUrl } from '../../../../src/evidence/ssrf.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 8000;

/**
 * What is at the other end of this link.  [Doctrine U-01, U-35 §6, D-06]
 *
 * Before someone commits to a conversation they should see what they are
 * about to have one with — the title, who made it, how long it is, a picture.
 * "YouTube video Jt_snoCkMas" is an identifier, not a video.
 *
 * Asked through the provider's own oEmbed endpoint, which is the published
 * way to get a title without an API key and without touching their media. No
 * download happens here and none ever will: a Class B source is played by its
 * owner's player, and this only reads the label on the tin.
 *
 * The URL is checked before it is fetched (D-06). A preview endpoint that
 * fetches whatever it is handed is a way to make the server knock on doors
 * inside its own network.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { url?: string };
  const raw = (body.url ?? '').trim();
  if (!raw) return fail(400, 'paste a link first');

  const source = parseProviderUrl(raw);
  if (!source) {
    return fail(422, 'That link is not one we can play. YouTube and Vimeo links work; '
      + 'for anything else, upload the file instead.');
  }

  try {
    await assertPublicUrl(source.oembedUrl);
  } catch {
    return fail(400, 'that link cannot be looked up');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(source.oembedUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`oembed ${response.status}`);
    const data = await response.json() as {
      title?: string; author_name?: string; thumbnail_url?: string; duration?: number;
    };

    return json({
      provider: source.provider,
      providerLabel: PROVIDER_LABELS[source.provider],
      videoId: source.videoId,
      canonicalUrl: source.canonicalUrl,
      embedUrl: source.embedUrl,
      title: data.title ?? '',
      author: data.author_name ?? '',
      thumbnailUrl: data.thumbnail_url ?? '',
      // Vimeo gives a duration; YouTube's oEmbed does not, and the player
      // reports it once the conversation opens.
      ...(typeof data.duration === 'number' ? { durationSeconds: data.duration } : {}),
    });
  } catch {
    /*
     * The provider did not answer. That is not a reason to refuse the
     * conversation — the link is still playable — so what comes back is
     * enough to carry on with, and the title is filled in later.
     */
    return json({
      provider: source.provider,
      providerLabel: PROVIDER_LABELS[source.provider],
      videoId: source.videoId,
      canonicalUrl: source.canonicalUrl,
      embedUrl: source.embedUrl,
      title: '',
      author: '',
      thumbnailUrl: '',
      unverified: true,
    });
  } finally {
    clearTimeout(timer);
  }
}
