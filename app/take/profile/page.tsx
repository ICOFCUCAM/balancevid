import type { Metadata } from 'next';

import Profile from './Profile.js';
import { GROUND, INSTALLS } from '../installs.js';

export const dynamic = 'force-dynamic';

/* The status bar, which `metadata` cannot carry. [installs.ts] */
export const viewport = GROUND;

export const metadata: Metadata = {
  /* The same app, so the same manifest: two spellings is two apps. */
  ...INSTALLS,
  title: 'Profile — BalanceVid',
  description: 'The installations this device takes part in.',
  /*
   * NOT INDEXED. Everything on this page comes out of one
   * browser's own storage, so a crawler would index an empty
   * shell and offer it to people as somebody's profile. [D-03]
   */
  robots: { index: false, follow: false },
};

/**
 * Profile and connections.  [TAKE-PLATFORM P13, P22; D-03]
 *
 * A SHELL, like the Library and for the same reason: every fact
 * on it is in the device's own storage, and a server component
 * that tried to render it would render nothing. [D-19]
 */
export default function ProfilePage() {
  return <Profile />;
}
