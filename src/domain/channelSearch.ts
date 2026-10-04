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

import type { Channel } from './channel.js';
import type { Listing } from './channelListing.js';
import { countrySays, languageSays } from './station.js';
import { rowFor } from './tvGuide.js';

/** How much each kind of match is worth. */
const WEIGHT = {
  exactSlug: 100,
  exactCallsign: 90,
  nameStarts: 60,
  nameHolds: 40,
  descriptionHolds: 10,
  genre: 8,
  country: 6,
  language: 6,
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
  /*
   * THE COUNTRY MATCHES BY ITS NAME AS WELL AS BY ITS CODE.
   *
   * > *"Search, Countries, Languages. This is how hundreds or
   * > thousands of user-created channels become navigable."*
   *
   * The row says `Faith · English · Japan`, so `japan` is what a
   * reader types — and until the row said that, the only thing
   * that matched was `jp`. A surface showing one word and
   * searching a different one is the worst of both: the reader
   * can see the answer on the screen and cannot find it.
   *
   * AND THE LANGUAGE MATCHES AT ALL, which it never did. The
   * brief names Languages beside Countries as the second way a
   * network of thousands becomes navigable, and `language` has
   * been on every listing since the station existed with nothing
   * reading it. [N-4, D-21]
   */
  if (row.country && sameWord(row.country, want, countrySays)) {
    score += WEIGHT.country;
  }
  if (row.language && sameWord(row.language, want, languageSays)) {
    score += WEIGHT.language;
  }
  return score;
}

/**
 * The tag, or the word it reads as, against what was typed.
 *
 * WHOLE AND NOT PARTIAL, like the callsign and for the same
 * reason: `en` against every English channel is the match a
 * reader means, and `e` against them is noise. The code is
 * compared folded because `CM` is stored and `cm` is typed.
 */
function sameWord(
  tag: string, want: string, says: (code: string) => string,
): boolean {
  return tag.toLowerCase() === want || says(tag).toLowerCase() === want;
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

/* ------------------------------------------------------------------ *
 *  Searching what is ON, rather than what is CARRIED.  [N-4, D-04]
 *
 *  The design this page was built against offers three tabs:
 *  CHANNELS, PROGRAMS and CATEGORIES. Two of the three existed —
 *  `matching` answers the first and `byGenre` the third — and the
 *  middle one was the question this network could not answer at
 *  all, although every piece of the answer was already here.
 *
 *  A viewer who types `worship` may mean a channel called Worship
 *  Live, or they may mean *where can I watch worship this
 *  evening*. Those are two questions and the benchmark is right
 *  to put a control between them. [D-04]
 * ------------------------------------------------------------------ */

/** One thing that is on, somewhere, at some point in the window. */
export interface Showing {
  channel: Listing;
  title: string;
  fromMs: number;
  toMs: number;
  /** It is on the air at the instant the search was made. */
  now: boolean;
  /** Booked, and not broadcast yet. [§6] */
  booked: boolean;
}

/**
 * How far ahead a search for a programme looks.
 *
 * TWELVE HOURS, WHICH IS AN EVENING AND THE MORNING AFTER IT. A
 * search across the whole schedule would answer a query about
 * *worship* with every Sunday until the heat death of the
 * universe, and a search across the next hour would answer most
 * queries with nothing. The number is here rather than on the
 * page because it is a judgement about what the question means.
 */
export const SHOWING_AHEAD_MS = 12 * 60 * 60 * 1000;

/**
 * What is on that matches, soonest first.
 *
 * BUILT ON `rowFor`, WHICH IS THE GUIDE'S OWN WALK, and therefore
 * on `airtime` underneath it. A second reading of the schedule
 * would be a second opinion about what is on — it would miss the
 * loop that fills most of a channel's day, and it would miss the
 * booked live slots the guide now announces. One walk, two
 * readers. [D-19]
 *
 * MATCHED ON THE TITLE AND ON NOTHING ELSE. A programme has no
 * genre and no description of its own; what it has is the name
 * somebody gave the slot. Folding the CHANNEL's genre into the
 * match would make every programme on a faith channel a hit for
 * `faith`, which is what the CHANNELS tab is for.
 *
 * SOONEST FIRST, NOT BEST FIRST, which is the opposite of the
 * channel search and deliberately so: a list of programmes is a
 * list of times, and a reader scanning it is asking *what can I
 * watch next*. Two orderings for two questions. [D-04]
 */
export function showings(
  channels: Iterable<{ channel: Channel; listing: Listing }>,
  query: string, nowMs: number, aheadMs = SHOWING_AHEAD_MS,
): Showing[] {
  const want = query.trim().toLowerCase();
  if (!want) return [];
  const out: Showing[] = [];
  for (const { channel, listing } of channels) {
    for (const slot of rowFor(channel, listing, nowMs, nowMs + aheadMs).slots) {
      /*
       * NOT *OFF AIR*, EVER. A channel showing nothing is drawn
       * as dead air by a title this product wrote, and a viewer
       * searching for `air` would otherwise be handed every
       * silent channel on the network as though it were a
       * programme. [D-21]
       */
      if (slot.kind === 'off') continue;
      if (!slot.title.toLowerCase().includes(want)) continue;
      out.push({
        channel: listing,
        title: slot.title,
        fromMs: slot.fromMs,
        toMs: slot.toMs,
        /*
         * NOTHING IN THIS WALK HAS ENDED, because the walk
         * STARTS at `nowMs`: the only slot that can contain the
         * instant is the one that begins on it. A second clause
         * testing the end stood here and survived every
         * mutation, for exactly that reason. [the twenty-first]
         */
        now: slot.fromMs <= nowMs,
        booked: slot.kind === 'live_event',
      });
    }
  }
  /* Ties break by channel name, so a search run twice is the same
     list. A result page that reshuffles is one a viewer cannot
     come back to. [D-04] */
  return out.sort((a, b) => a.fromMs - b.fromMs
    || a.channel.name.localeCompare(b.channel.name));
}
