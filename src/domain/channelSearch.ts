/**
 * Finding a channel.  [Doctrine CHANNEL §2, D-04, TV-NETWORK N-4]
 *
 * > *"Search, Countries, Languages. This is how hundreds or
 * > thousands of user-created channels become navigable."*
 *
 * WHAT COUNTS AS A HIT IS A JUDGEMENT, not a filter written inline
 * on a page. A viewer typing `faith` means the shelf; typing `RDTV`
 * means the callsign; typing `redemption` means the name. One
 * expression over the row covers all three, and putting it here
 * means the page, the API and whatever client comes next agree
 * about what a search is.
 *
 * A CALLSIGN MATCHES WHOLE OR NOT AT ALL. A partial clause stood
 * here and survived every mutation: every realistic query that
 * hits part of a callsign — `tv` against RDTV and AKTV — already
 * hits the NAME, and the queries it uniquely answered are
 * fragments like `USH` that nobody types. What it reliably added
 * was noise, scoring every station whose four letters end in TV
 * for a two-letter query. [the twentieth]
 *
 * SCORED SO THAT A NAME BEATS A SHELF. A search for `music` must
 * put a channel called Music House above eleven channels whose
 * genre is music, because somebody typing a name has a specific
 * channel in mind and somebody browsing a shelf uses the shelf.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Listing } from './channelListing.js';

/** How much each kind of match is worth. */
const WEIGHT = {
  exactSlug: 100,
  exactCallsign: 90,
  nameStarts: 60,
  nameHolds: 40,
  descriptionHolds: 10,
  genre: 8,
  country: 6,
} as const;

/**
 * A row's score for a query, or zero for no match at all.
 *
 * FOLDED AND TRIMMED ON BOTH SIDES, because a viewer types
 * ` Redemption ` and means `redemption`, and a search that cared
 * would be a search that fails for a reason nobody can see.
 */
export function scoreOf(row: Listing, query: string): number {
  const want = query.trim().toLowerCase();
  if (!want) return 0;
  const name = row.name.toLowerCase();
  const callsign = (row.callsign ?? '').toLowerCase();
  let score = 0;
  if (row.slug === want) score += WEIGHT.exactSlug;
  if (callsign && callsign === want) score += WEIGHT.exactCallsign;
  if (name.startsWith(want)) score += WEIGHT.nameStarts;
  else if (name.includes(want)) score += WEIGHT.nameHolds;
  if ((row.description ?? '').toLowerCase().includes(want)) {
    score += WEIGHT.descriptionHolds;
  }
  if ((row.genre ?? '') === want) score += WEIGHT.genre;
  if ((row.country ?? '').toLowerCase() === want) score += WEIGHT.country;
  return score;
}

/**
 * The rows that match, best first.
 *
 * TIES BREAK BY NAME, so a search run twice returns the same order.
 * A directory that reshuffles equal results is a directory a
 * viewer cannot come back to. [D-04]
 */
export function matching(rows: readonly Listing[], query: string): Listing[] {
  return rows
    .map((row) => ({ row, score: scoreOf(row, query) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .map((hit) => hit.row);
}
