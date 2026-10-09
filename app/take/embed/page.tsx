import type { Metadata } from 'next';
import { headers } from 'next/headers';

import Embed from './Embed.js';
import { GROUND, INSTALLS } from '../installs.js';
import { embedWays, takeAppAddress } from '../../../src/domain/embed.js';
import { originFrom } from '../../../src/web/share.js';

export const dynamic = 'force-dynamic';

/* The status bar, which `metadata` cannot carry. [installs.ts] */
export const viewport = GROUND;

export const metadata: Metadata = {
  /* The same app, so the same manifest: two spellings is two apps. */
  ...INSTALLS,
  title: 'Embed Take — BalanceVid',
  description: 'Put Take on your own website, as a link or as the app itself.',
};

/**
 * Embed Take.  [TAKE-PLATFORM P6, P13; D-19, D-21, U-02]
 *
 * > *"Bring participation to your website."*
 *
 * A SERVER COMPONENT, UNLIKE EVERY OTHER PAGE IN THIS APP, and
 * for one reason: the only fact on it is the address of this
 * installation, which the request carries and the browser would
 * have to be told. `/take` and `/take/library` render nothing on
 * the server because what they show is in the device's own
 * storage; this shows the same answer to everybody, and an
 * address assembled in the client from `location` would be one
 * more place to get a forwarded host wrong. [D-19, share.ts]
 *
 * AND WHERE THERE IS NO HOST TO READ, the page says so instead of
 * printing a guess. An installation reached through a proxy that
 * strips its headers would otherwise hand a publisher a snippet
 * pointing at `undefined/take`, which fails on their website and
 * looks like their mistake. [U-19]
 */
export default async function EmbedPage() {
  const origin = originFrom(await headers());
  return (
    <Embed
      address={origin ? takeAppAddress(origin) : null}
      ways={origin ? embedWays(origin) : []}
    />
  );
}
