/**
 * THE ONE PLACE THE NETWORK'S PICTURES ARE NAMED.
 *   [TV-NETWORK N-4]
 *
 * Every image on the public television pages is listed here and
 * nowhere else, so swapping the artwork is editing this file
 * rather than hunting through markup. Drop a file into
 * `public/network/`, change the string, and nothing else moves.
 *
 * ITS OWN MODULE, AND THAT IS NOT TIDINESS. It lived in `Tv.tsx`,
 * which is `'use client'` — and a SERVER component importing a
 * plain constant from a client module gets `undefined`. The front
 * page survived it because its hero is a client component and so
 * resolved the value in the browser; the directory's band is
 * rendered on the server, and shipped `src="$undefined"` and a
 * black rectangle. Found by probing a screenshot that looked
 * merely dark.
 *
 * SO IT IS A MODULE WITH NO DIRECTIVE, importable from both sides,
 * which is what a shared constant has to be.
 *
 * THE DEFAULTS ARE PICTURES THIS PRODUCT ALREADY OWNS, rather than
 * stock photography bought for one page: `online-tv.webp` is how
 * the studio introduces the Online TV room, so the network's front
 * door and the room behind it are recognisably the same place
 * until something better arrives. [D-19]
 */
export const NETWORK_ART = {
  /** The tall band under the header on the front page. */
  hero: '/rooms/online-tv.webp',
  /** Where in the frame to hold when that band is cropped. */
  heroFocus: '72% 42%',
  /** The shorter band over the directory. */
  directory: '/rooms/online-tv.webp',
  directoryFocus: '76% 38%',
  /** The panel beside the search results. */
  search: '/rooms/online-tv.webp',
  searchFocus: '58% 40%',
} as const;
