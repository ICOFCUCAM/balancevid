import { requestForLink } from '../../../../../src/store/requests.js';
import { fail } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ link: string }> };

/**
 * The Take App, as something that installs.  [TAKE-APP T2c, T13, T13a]
 *
 * PER LINK, AND THAT IS THE WHOLE DESIGN. A single manifest at
 * `/take/` would install an icon that opens a page saying "paste your
 * link" — which is worse than a bookmark. What a performer wants on
 * their home screen is THIS assignment: the song they were asked to
 * sing on, under its own name, opening straight into the recorder.
 * So `start_url` is their link and the name is what they were asked
 * for.
 *
 * WHICH MEANS THE MANIFEST CARRIES THE CREDENTIAL, and that is the
 * same exposure the URL bar already is: the link is the request, it
 * reached this device because somebody sent it here, and it is
 * refused the moment it is rotated. Nothing about the PRODUCTION is
 * in here — not the performance, not the other performers, not the
 * producer — for the reason the page itself gives. [D-03, D-25]
 *
 * AND IT IS REFUSED FOR A LINK THAT IS NOT OPEN, exactly as the page
 * is. An icon installed from a closed request is an icon that opens
 * a refusal, and the performer will think the app is broken rather
 * than the invitation withdrawn.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { link } = await params;
  const found = await requestForLink(link, new Date().toISOString());
  if (!found) return fail(404, 'that link is not open');

  const at = `/take/${encodeURIComponent(link)}`;
  /*
   * A HOME-SCREEN LABEL IS ABOUT TWELVE CHARACTERS before the launcher
   * truncates it, so `short_name` is not the ask — it is what the
   * thing IS. The full ask is the name, which is what an install
   * prompt and the app switcher show.
   */
  const asks = (found.assignment?.asks ?? '').trim();

  return new Response(JSON.stringify({
    name: asks ? `BalanceVid — ${asks}` : 'BalanceVid — your take',
    short_name: 'Your take',
    description: asks
      ? `Record your part: ${asks}`
      : 'Record your part and send it to the producer.',
    start_url: at,
    /*
     * SCOPED TO THE ONE LINK. Anything outside it opens in the
     * browser, which is right: a performer's installed icon is for
     * their assignment, not a window onto the product.
     */
    scope: at,
    /*
     * NO BROWSER CHROME. The point of installing is a recorder that
     * looks like a recorder — and on a phone the address bar is
     * roughly the height of the Record button. [U-19]
     */
    display: 'standalone',
    orientation: 'portrait',
    /* The page's own ground, so there is no white flash on launch. */
    background_color: '#0e0f11',
    theme_color: '#0e0f11',
    icons: [
      { src: '/take-app/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/take-app/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/take-app/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        /* Android crops an installed icon to whatever shape the
           launcher uses; this one is drawn inside the safe area. */
        purpose: 'maskable',
      },
    ],
  }), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      /* The ask can be edited and the link can be rotated: never a
         stale manifest promising an install that no longer opens. */
      'cache-control': 'no-store, private',
    },
  });
}
