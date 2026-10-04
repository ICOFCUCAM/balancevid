/**
 * What kind of channel a channel is, in words and in a mark.
 *   [TV-NETWORK N-4]
 *
 * ITS OWN MODULE, AND NOT A CORNER OF `Tv.tsx`, FOR ONE REASON:
 * `Tv.tsx` carries `'use client'`, and a server component that
 * imports a plain constant across that boundary gets `undefined`
 * — only components cross it. `NETWORK_ART` learned this by
 * printing `src="$undefined"` on every card in the directory, and
 * the guide needs both of these from a server page.
 */

import { type IconName } from '../Icon.js';

/**
 * A genre as a word rather than as a key.
 *
 * `Genre` is stored lowercase because it is an enum on a record.
 * A strip reading *culture · faith · children* is a strip showing
 * its database, which is the fault the studio's own surfaces are
 * careful about everywhere else.
 */
export function asWord(genre: string): string {
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}

/**
 * A mark per kind.
 *
 * ONE ENTRY PER `GENRE`, AND THAT IS A RECENT REPAIR. This map
 * held `sports`, `kids` and `film`, none of which is a genre this
 * product has — three keys nothing could ever look up — while
 * `general`, `children` and `talk`, which it does have, fell
 * through to the fallback. A lookup table that drifts from the
 * list it is keyed on is a table that looks complete and is not.
 *
 * THE FALLBACK STAYS. `genre` is validated against `GENRES` where
 * it is written, but a document on disk predates any list this
 * file knows about, and a row of icons with a hole in it reads as
 * a loading failure rather than as a channel with an unusual
 * genre. [U-19]
 */
export const GENRE_MARKS: Record<string, IconName> = {
  general: 'broadcast', news: 'broadcast', music: 'music',
  faith: 'passed', education: 'list', culture: 'library',
  entertainment: 'play', sport: 'live', children: 'sun',
  talk: 'conversation', health: 'person', business: 'faders',
};

/** The mark for a kind, or the network's own. */
export function markFor(genre: string): IconName {
  return GENRE_MARKS[genre.toLowerCase()] ?? 'broadcast';
}
