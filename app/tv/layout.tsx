import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * The television network as something that installs.
 *   [TV-NETWORK N-9]
 *
 * > *"Yes — I think BalanceVid should eventually have a dedicated
 * > Online TV application. Not just the existing web Watch page."*
 *
 * ON THE LAYOUT AND NOT ON FIVE PAGES, because the manifest is a
 * property of the surface and `/tv` is one surface. Next merges a
 * layout's metadata into each page's, so the directory, the
 * guide, the search, the favourites and every station page carry
 * it without any of them mentioning it — and a sixth page added
 * tomorrow carries it too.
 *
 * NOT PER CHANNEL. The Take App's manifest is composed per link
 * for a reason it states — *"a single manifest at `/take/` would
 * install an icon that opens a page saying 'paste your link'"* —
 * and the opposite is true here. What a viewer wants on a home
 * screen is the NETWORK: the guide, the channels, and whatever
 * they were watching last. An icon per station would be a home
 * screen full of one company's channels. [D-04]
 */
export const metadata: Metadata = {
  manifest: '/tv-app/manifest.json',
  icons: { apple: '/tv-app/apple-touch-icon.png' },
};

export default function TvLayout({ children }: { children: ReactNode }) {
  return children;
}
