import TakeApp from './TakeApp.js';

export const dynamic = 'force-dynamic';

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
  return <TakeApp link={link} />;
}
