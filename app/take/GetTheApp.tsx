'use client';

import { DOWNLOADS_PATH, storeWays } from '../../src/domain/getTheApp.js';
import { useInstallOffer } from '../useInstallOffer.js';

/**
 * "Get the Take App" — the small one, that is always there.
 *   [TAKE-APP T13a; TAKE-PLATFORM P6; Doctrine U-19, D-21, D-04]
 *
 * THE LINE BESIDE `InstallBar`, FOR THE PHONES IT CANNOT HELP.
 * That bar offers a real installation and renders nothing when the
 * browser cannot give it one — which is right, and which on an
 * invitation opened inside WhatsApp, Messenger, Instagram or
 * Android Firefox means the page offers no way to get the app at
 * all. A chat app's own browser is how most invitations are
 * actually opened. This is one row, always rendered, that leads
 * somewhere real.
 *
 * SMALL ON PURPOSE AND NOT A SECOND BANNER. The person is here to
 * record a take for somebody who asked them to, and the app is a
 * better way to do that, not the point of the visit. Two banners
 * competing over a recording button is how a page teaches people
 * to scroll past everything on it. One quiet line, under the
 * thing they came for. [D-04]
 *
 * IT OPENS IN A NEW TAB, which is the one interaction detail that
 * matters here: they are mid-invitation, and a page that navigates
 * away from an assignment to show a download list has taken the
 * thing they came for off the screen. The take page keeps its
 * place and its recording.
 *
 * WHAT IT DOES NOT DO IS GUESS WHICH PHONE THIS IS. There is no
 * user-agent sniff deciding whether to say Android or iPhone: the
 * download centre reads what the installation actually has, and a
 * link that promises a platform this build has no artefact for is
 * the gateway's four dead cards again. [U-02, D-21]
 *
 * AND IT IS GONE ONCE THE APP IS INSTALLED. Somebody running from
 * their home-screen icon being offered a way to get the app is the
 * product not knowing where it is.
 */
export default function GetTheApp(
  { compact = false }: {
    /** Inside a dense column, where even one row has to earn itself. */
    compact?: boolean;
  } = {},
) {
  const { installed } = useInstallOffer();
  if (installed) return null;
  const stores = storeWays();

  return (
    <div
      data-testid="get-the-app"
      className="row"
      style={{
        gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center',
        ...(compact ? {} : { marginTop: 6 }),
      }}
    >
      <a
        href={DOWNLOADS_PATH}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="get-the-app-link"
        className="small muted"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          textDecoration: 'none',
        }}
      >
        {/*
          * A PHONE WITH AN ARROW INTO IT, drawn rather than
          * fetched. An <img> here is one more request on a
          * connection that is already carrying video, and a broken
          * image icon beside "Get the Take App" would say the
          * opposite of what the row is for. `currentColor` so it
          * is the same grey as the words and follows the theme.
          */}
        <svg
          width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <rect x="3.5" y="1" width="9" height="14" rx="1.6" />
          <path d="M8 5v5m0 0L6 8m2 2 2-2" />
        </svg>
        Get the Take App
      </a>

      {/*
        * THE STORES, WHEN THERE ARE ANY. `storeWays()` is empty
        * until a listing exists, so nothing renders here today and
        * the badge appears by itself on the day somebody fills in
        * one constant. A dark slot is not a feature waiting to be
        * built; it is this product refusing to draw a door before
        * there is a room behind it. [getTheApp.ts, U-19]
        */}
      {stores.map((way) => (
        <a
          key={way.store}
          href={way.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`get-the-app-${way.store}`}
          className="small muted"
          style={{ textDecoration: 'none' }}
        >
          {way.says}
        </a>
      ))}
    </div>
  );
}
