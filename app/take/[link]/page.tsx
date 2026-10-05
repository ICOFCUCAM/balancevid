import type { Metadata } from 'next';

import { GROUND } from '../installs.js';
import TakeApp from './TakeApp.js';

export const dynamic = 'force-dynamic';

/**
 * THE PAGE'S OWN GROUND, so a phone that has installed this paints the
 * status bar to match instead of flashing white on launch.
 *
 * IT WAS A FIELD OF THE METADATA AND SO IT WAS NEVER THERE. Next
 * accepts `themeColor` in a `Metadata` object, builds it without a
 * word, and emits nothing — found by reading the head of the served
 * page. The colour is shared with the application's own pages
 * because it is the same ground; nothing else about the manifest is.
 * [installs.ts, U-02, D-19]
 */
export const viewport = GROUND;

/**
 * What a phone needs to install this.  [TAKE-APP T2c, T13a]
 *
 * THE MANIFEST IS PER LINK, so the head is too: an installed icon
 * opens the assignment it was installed from, not a page asking for
 * a link. The route composes it; this only points at it.
 *
 * NOTHING HERE NAMES THE PRODUCTION. `generateMetadata` runs on the
 * server and could read the request, and deliberately does not: a
 * title carrying the song would put it in the tab, the history and
 * any preview a chat app draws of the link. The page's own rule.
 * [D-03, D-25]
 */
export function generateMetadata(
  { params: _params }: { params: Promise<{ link: string }> },
): Metadata {
  return {
    title: 'Your take · BalanceVid',
    appleWebApp: {
      capable: true,
      title: 'Your take',
      statusBarStyle: 'black-translucent',
    },
    icons: { apple: '/take-app/apple-touch-icon.png' },
  };
}

/**
 * The Take App, in a browser.  [Doctrine D-25; TAKE-APP T2c, T3, T13]
 *
 * "You don't want participation to fail simply because somebody hasn't
 * installed the application." So this IS the client, and the packaged
 * Android and iOS apps are a better delivery of it — better camera
 * access, background upload, retry — rather than a precondition for
 * taking part.
 *
 * IT RENDERS NOTHING ABOUT THE PRODUCTION BEFORE THE LINK IS ACCEPTED,
 * the same rule the room's join page follows: what the request asks for
 * is fetched by the client against the same link, and a bad one is
 * answered exactly as a link that never existed. A page that said "not
 * found" for one and showed a song title for the other would be a way
 * to test ids. [D-03]
 */
export default async function TakePage(
  { params }: { params: Promise<{ link: string }> },
) {
  const { link } = await params;
  return (
    <>
      {/*
        * NOT `metadata.manifest`, BECAUSE THIS ONE IS PER LINK and
        * Next resolves that field once for the route rather than per
        * request. A link element in the page is read by the browser
        * at the same moment and points where it must.
        */}
      <link
        rel="manifest"
        href={`/api/take/${encodeURIComponent(link)}/manifest`}
      />
      <TakeApp link={link} />
    </>
  );
}
