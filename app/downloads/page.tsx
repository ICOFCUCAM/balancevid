import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import DownloadCentre from './DownloadCentre.js';
import {
  ACTIVATION_COOKIE, activationCode, passHolds,
} from '../../src/web/activation.js';
import { listDownloads } from '../../src/store/downloads.js';
import '../gateway/gateway.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Downloads — BalanceVid',
  description:
    'Take for Android, Take Desktop for Windows and Linux, and the '
    + 'self-hosted BalanceVid installation.',
};

/**
 * The download centre.  [TAKE-PLATFORM P6; Doctrine D-21, U-02, D-03]
 *
 * > *"do it in a way we can download the app for mobile directly,
 * > download software Take for desktop, balance vid software
 * > download? all should have actication code for now so that we can
 * > use one master code to open them."*
 *
 * WHAT IS LISTED IS WHAT IS ON THE DISK. The gateway's own download
 * band is six cards, four of which went to `#`; this is the page
 * behind them, and it cannot advertise a file that is not there
 * because it is reading `var/downloads` rather than a list somebody
 * wrote. An installation with no releases says so, in words, with
 * the naming convention under it. [U-02, D-21]
 *
 * THE LIST IS RENDERED ON THE SERVER AND THE GATE IS READ HERE,
 * because both are facts this machine already has: the directory and
 * one cookie. A page that fetched its own API would be a round trip
 * to learn what the process it is running in already knows, and a
 * blank frame while it waited. [/tv's own rule]
 *
 * AND THE ANDROID CARD IS NOT A FILE. The Take App installs from
 * `/take` — it is a progressive web application, which is how it
 * reaches a phone with no store account and no signed binary — so
 * that card points at the thing that installs rather than at a
 * download that does not exist. When there is a signed `.apk` in
 * `var/downloads` it appears beside it, as another way in. [D-21]
 */
export default async function DownloadsPage() {
  const configured = activationCode() !== null;
  const open = configured
    && await passHolds((await cookies()).get(ACTIVATION_COOKIE)?.value);
  return (
    <DownloadCentre
      releases={await listDownloads()}
      gate={!configured ? 'unconfigured' : open ? 'open' : 'locked'}
    />
  );
}
