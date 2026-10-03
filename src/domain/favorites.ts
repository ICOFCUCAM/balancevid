/**
 * The channels this viewer keeps.  [Doctrine CHANNEL §2, D-03,
 * D-04, TV-NETWORK N-9]
 *
 *     BALANCEVID TV
 *     HOME · LIVE · GUIDE · CHANNELS · SEARCH · FAVORITES
 *
 * The one entry in the brief's own navigation that `/tv` did not
 * have.
 *
 * PER DEVICE, AND NOT BECAUSE THAT WAS EASIER. `/tv` is served
 * before any sign-in and most of the people who will ever see it
 * have no account, so a favourites list that needed one would be
 * a nav item that asks a viewer to register before it does
 * anything. The list lives in the browser that made it. The cost
 * is stated rather than hidden: it does not follow a viewer to
 * their phone, and clearing site data clears it.
 *
 * THE SPELLING IS THE BRIEF'S AND THE RESERVATION'S. This product
 * writes `colour`, and `RESERVED_SLUGS` has held `favorites`
 * since N-1 — the word was chosen when the directory's reserved
 * list was written, and a second spelling now would be a route
 * and a reservation that disagree.
 *
 * SLUGS, NOT IDS. A favourite is an address a viewer chose, and
 * `/tv/channels/<slug>` is the one the directory links to and the
 * canonical tag points at. Storing the channel id would be
 * durable through a rename and unreadable in a browser's own
 * storage inspector, and a list of `chan_c3bf…` is a list nobody
 * can check.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import { dialOrder } from './registry.js';

/** Where a browser keeps it. */
export const FAVORITES_KEY = 'balancevid.tv.favorites';

/**
 * How many a list may hold.
 *
 * Not a product limit anybody will reach — it is the bound on a
 * value that comes out of storage, where a bug in another tab or
 * a hand-edited entry can put anything at all. A list is read on
 * every page of the network, and an unbounded one is a page that
 * stops responding.
 */
export const MOST_FAVORITES = 200;

/**
 * What is actually in storage, whatever is actually in storage.
 *
 * NEVER A THROW, for the reason `readLineup` never throws: this
 * is on the path of every public television page, and a
 * directory that breaks because a JSON value was truncated is
 * worse than a directory with no stars on it. [D-21]
 */
export function readFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let read: unknown;
  try {
    read = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(read)) return [];
  const out: string[] = [];
  for (const one of read) {
    if (typeof one !== 'string') continue;
    const slug = one.trim().toLowerCase();
    /* Empty and duplicate both drop, so the count below is a
       count of channels rather than of entries. */
    if (!slug || out.includes(slug)) continue;
    out.push(slug);
    if (out.length >= MOST_FAVORITES) break;
  }
  return out;
}

export function isFavorite(list: readonly string[], slug: string): boolean {
  return list.includes(slug.trim().toLowerCase());
}

/**
 * The list with this one in it.
 *
 * APPENDED, NOT PREPENDED, and the order of the list is not the
 * order it is shown in anyway — `favoritesAmong` puts it down
 * the dial. This keeps the stored value stable so that starring a
 * channel does not rewrite every other entry.
 *
 * THE OLDEST GOES WHEN THE LIST IS FULL, which will not happen to
 * anybody and is still the right direction: the thing a viewer
 * just chose is the thing they want.
 */
export function withFavorite(list: readonly string[], slug: string): string[] {
  const wanted = slug.trim().toLowerCase();
  if (!wanted || list.includes(wanted)) return [...list];
  const next = [...list, wanted];
  return next.length > MOST_FAVORITES
    ? next.slice(next.length - MOST_FAVORITES) : next;
}

export function withoutFavorite(list: readonly string[], slug: string): string[] {
  const wanted = slug.trim().toLowerCase();
  return list.filter((one) => one !== wanted);
}

/**
 * The favourites a viewer actually has, among the channels there
 * are.
 *
 * A SLUG IN THE LIST THAT NOBODY ANSWERS TO IS DROPPED, NOT
 * SHOWN AS A GAP. A station can be renamed, unpublished or made
 * private after somebody stars it, and a favourites page
 * listing a channel that 404s is a page that looks broken when
 * the truth is that the channel went away. The slug stays in
 * storage, because a channel that comes back should come back
 * starred.
 *
 * DOWN THE DIAL, by `dialOrder`, which is the same comparator
 * the M3U uses: a favourites list is a personal lineup, and a
 * lineup is read in the order the numbers go. The directory is
 * alphabetical because browsing is reading names; this is not
 * browsing. [D-04, N-6]
 */
export function favoritesAmong<T extends { slug: string; name: string; number?: number }>(
  channels: readonly T[], list: readonly string[],
): T[] {
  const wanted = new Set(list);
  return channels
    .filter((channel) => wanted.has(channel.slug))
    .sort((a, b) => dialOrder(
      { number: a.number ?? 0, name: a.name },
      { number: b.number ?? 0, name: b.name }));
}
