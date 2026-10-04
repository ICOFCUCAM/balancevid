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
 * A mark per kind, where this product happens to own one.
 *
 * DELIBERATELY INCOMPLETE. `genre` is a field a broadcaster fills
 * in, not a list this product closes, and a map that had to be
 * complete would be a map that broke the strip the first time
 * somebody wrote *Documentary*. Anything unlisted gets the
 * network's own mark rather than nothing, because a row of icons
 * with a hole in it reads as a loading failure.
 */
export const GENRE_MARKS: Record<string, IconName> = {
  faith: 'passed', news: 'broadcast', culture: 'library',
  education: 'list', music: 'music', sport: 'live', sports: 'live',
  entertainment: 'play', talk: 'conversation', kids: 'sun', film: 'play',
};

/** The mark for a kind, or the network's own. */
export function markFor(genre: string): IconName {
  return GENRE_MARKS[genre.toLowerCase()] ?? 'broadcast';
}
