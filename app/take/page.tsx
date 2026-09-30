import type { Metadata } from 'next';

import TakeHome from './TakeHome.js';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BalanceVid — take part',
  description: 'Watch, listen, and take part.',
};

/**
 * The Take App, opened without an invitation.
 *   [TAKE-PLATFORM P1, P6; D-25, D-03]
 *
 * `/take/<link>` is one assignment for one person. This is the other
 * door: somebody who was sent nothing, arriving to see what this
 * installation is offering.
 *
 * IT RENDERS NOTHING ON THE SERVER ABOUT WHAT IS HERE, the same rule
 * `/take/<link>` follows. The list is fetched by the client from
 * `/api/participate`, which answers only with things their author
 * published AND chose to list — so a page source cannot carry a title
 * somebody had not decided to show. [D-03]
 */
export default function TakeHomePage() {
  return <TakeHome />;
}
