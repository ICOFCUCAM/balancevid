import type { Metadata } from 'next';

import Library from './Library.js';
import { GROUND, INSTALLS } from '../installs.js';

export const dynamic = 'force-dynamic';

/* The status bar, which `metadata` cannot carry. [installs.ts] */
export const viewport = GROUND;

export const metadata: Metadata = {
  /*
   * THE SAME APP, SO THE SAME MANIFEST. A person who opened the
   * Library first and was offered an install there would otherwise
   * get nothing, or — worse — a second icon. Imported rather than
   * repeated: two spellings of one app is two apps. [D-19]
   */
  ...INSTALLS,
  title: 'Library — BalanceVid',
  description: 'What you have made, and what you have sent.',
  /*
   * NOT INDEXED, AND NOT BECAUSE IT IS SECRET. The page holds
   * nothing until a browser opens it — the list is in that
   * browser's own storage and the server has never heard of it
   * — so a crawler would index an empty shelf and offer it to
   * people as somebody's library. [D-03]
   */
  robots: { index: false, follow: false },
};

/**
 * The Library.  [TAKE-APP T16, P5]
 *
 * A SHELL AND NOTHING ELSE, because every fact on this page is
 * in the browser's own storage: which links this device holds,
 * and what each of them answers. A server component that tried
 * to render it would be a server component rendering nothing,
 * and the work would still happen on the client one frame
 * later. [D-19]
 */
export default function LibraryPage() {
  return <Library />;
}
