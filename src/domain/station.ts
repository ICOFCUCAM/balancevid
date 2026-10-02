/**
 * A channel's public identity.  [Doctrine CHANNEL §2, §3, D-04, D-18,
 * TV-NETWORK N-1]
 *
 *     REDEMPTION TV
 *     RDTV · Channel 124
 *     Faith · English · Africa
 *
 * A CHANNEL HAD A NAME AND AN ID AND NOTHING ELSE A STRANGER COULD
 * USE. `balancevid.com/t/chan_c3bf272865354bc3baa3` is an address a
 * machine chose, and the brief is about what happens when there are
 * thousands of them:
 *
 * > *"how does a viewer find their channel, distinguish it from
 * > every other BalanceVid channel, and tune into it like a real TV
 * > service?"*
 *
 * FOUR IDENTITIES, AND ONLY ONE OF THEM IS PERMANENT. The brief is
 * explicit about why, and it is the whole reason this is a separate
 * record rather than fields on the channel:
 *
 * > *"Channel ID: immutable. Channel Number: assigned/display
 * > identity. Callsign: human identity. Slug: URL identity. That
 * > means you can reorganize the lineup without breaking the actual
 * > channel."*
 *
 * So `Channel.id` stays what it has always been and nothing here
 * can change it. Everything in this file is a thing the owner or
 * the network may change later, and the system must keep working
 * when they do.
 *
 * AND THE NUMBER IS DELIBERATELY ABSENT. A channel number is
 * allocated by the network, not chosen by the owner — *"I would not
 * allow every user to choose any number they want"* — so it belongs
 * with the registry that allocates it. A field here before an
 * allocator exists is an invitation to pick one.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/** What kind of channel this is, for the directory's shelves. */
export const GENRES = [
  'general', 'news', 'music', 'faith', 'education', 'culture',
  'entertainment', 'sport', 'children', 'talk',
] as const;
export type Genre = (typeof GENRES)[number];

export interface Station {
  /**
   * THE URL IDENTITY: `/tv/channels/redemption-tv`.
   *
   * Unique across the installation, because it is an address. Not
   * unique across installations, and it does not need to be: a
   * self-hosted channel is reached through its own origin, which is
   * the same argument `connections.ts` makes about Take.
   */
  slug: string;
  /** The short human identity. `RDTV`. */
  callsign?: string;
  /** One or two sentences, for a card and a station page. */
  description?: string;
  /** A primary language subtag: `en`, `fr`, `sw`. */
  language?: string;
  /** ISO 3166-1 alpha-2, or nothing for a channel that is everywhere. */
  country?: string;
  genre?: Genre;
  /** A library asset, like every other picture reference. [§3, D-18] */
  logoAssetId?: string;
}

/* ------------------------------------------------------------------------ *
 *  The slug.
 * ------------------------------------------------------------------------ */

export const SLUG_SHORTEST = 2;
export const SLUG_LONGEST = 48;

/**
 * WORDS A SLUG MAY NOT BE, because the directory owns them.
 *
 * `/tv/guide` and `/tv/channels/guide` do not collide — they are
 * different depths — but a channel called `guide` produces a link
 * nobody can read correctly at a glance, and the first time the
 * directory grows a route these become ambiguous for real. Refused
 * now, while refusing is free.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'channels', 'channel', 'guide', 'search', 'live', 'now', 'next',
  'tv', 'app', 'api', 'about', 'help', 'new', 'all', 'favorites',
];

/**
 * Why this slug cannot be used, or null.
 *
 * REFUSED RATHER THAN REPAIRED, the way every identifier in this
 * product is. A slug is an address somebody will print, and quietly
 * turning what they typed into something else is how a station ends
 * up advertising a URL that is not theirs. [`connections.ts`]
 */
export function slugProblem(slug: string): string | null {
  if (slug !== slug.trim()) return 'a web address cannot start or end with a space';
  if (slug.length < SLUG_SHORTEST) return 'too short to be an address';
  if (slug.length > SLUG_LONGEST) {
    return `too long — ${SLUG_LONGEST} characters at most`;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'only lower-case letters, numbers and hyphens';
  }
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return 'cannot start or end with a hyphen';
  }
  if (slug.includes('--')) return 'two hyphens together is a typing mistake';
  if (RESERVED_SLUGS.includes(slug)) return 'that word belongs to the directory';
  return null;
}

/**
 * A slug from a channel's name, avoiding what is taken.
 *
 * SUGGESTED, NEVER IMPOSED. This is what the field is filled with
 * before anybody edits it; `slugProblem` is what decides whether
 * what they left is allowed. One function that both guessed and
 * enforced would be a function that silently accepts its own
 * guesses and refuses the operator's.
 */
export function slugFor(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base = name.toLowerCase()
    /* Anything that is not a letter or a number becomes a join.
       Accented letters are stripped rather than transliterated: a
       guess at the right Latin spelling of a name is worse than a
       shorter slug the owner can correct. */
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_LONGEST)
    .replace(/-+$/, '');
  /*
   * AND THE FALLBACK MUST NOT BE REFUSED BY THE RULE ABOVE IT.
   *
   * This read `channel-${base}` falling back to a bare `channel`,
   * and `channel` is a reserved word — so a station called `!!!`
   * got a suggestion the validator rejected, which is the one
   * thing a suggester must never do. The test that asserts "never
   * suggests something it would refuse" is what found it.
   *
   * AND THE SECOND FALLBACK WENT WITH IT. Once the prefix is
   * `station-`, the result cannot fail: `base` carries no doubled
   * or edge hyphens by construction, the prefix is seven
   * characters so the slice never empties it, and no reserved word
   * begins `station-`. A third branch for a case that cannot
   * happen survived every mutation, which is how it was found.
   * [the eighteenth]
   */
  const safe = slugProblem(base) === null ? base
    : `station-${base}`.slice(0, SLUG_LONGEST).replace(/-+$/, '');
  if (!used.has(safe)) return safe;
  /* `redemption-tv-2`, which is what every system does and what a
     person expects to see when the name is already spoken for. */
  for (let at = 2; at < 1000; at += 1) {
    const next = `${safe.slice(0, SLUG_LONGEST - String(at).length - 1)}-${at}`;
    if (!used.has(next)) return next;
  }
  return `${safe}-${Date.now()}`.slice(0, SLUG_LONGEST);
}

/* ------------------------------------------------------------------------ *
 *  The callsign.
 * ------------------------------------------------------------------------ */

export const CALLSIGN_SHORTEST = 2;
export const CALLSIGN_LONGEST = 6;

/**
 * Why this callsign cannot be used, or null.
 *
 * SHORT AND LOUD, which is what a callsign is for: it goes in a
 * corner of a listing beside a number, and a "callsign" of fifteen
 * characters is a second name competing with the first.
 */
export function callsignProblem(callsign: string): string | null {
  if (callsign !== callsign.trim()) return 'no spaces at either end';
  if (callsign.length < CALLSIGN_SHORTEST) return 'too short to be a callsign';
  if (callsign.length > CALLSIGN_LONGEST) {
    return `a callsign is ${CALLSIGN_LONGEST} characters at most`;
  }
  if (!/^[A-Z0-9]+$/.test(callsign)) {
    return 'capital letters and numbers only';
  }
  return null;
}

/* ------------------------------------------------------------------------ *
 *  What a listing says about it.
 * ------------------------------------------------------------------------ */

/**
 * The line under a channel's name in a directory.
 *
 * ONLY WHAT IS KNOWN, joined. A channel that has set nothing gets
 * nothing rather than a row of placeholders — the brief's own
 * *"don't overdo the writing"*, one surface along. [D-04]
 */
export function stationSays(station: Station | undefined): string {
  if (!station) return '';
  return [
    station.genre ? titleCase(station.genre) : null,
    station.language ? languageSays(station.language) : null,
    station.country ? station.country.toUpperCase() : null,
  ].filter(Boolean).join(' · ');
}

function titleCase(word: string): string {
  return word.slice(0, 1).toUpperCase() + word.slice(1);
}

/**
 * A language subtag as a reader's own word for it, where the
 * platform knows one.
 *
 * `Intl.DisplayNames` is the platform's table and this product does
 * not get to keep a second one: a hand-written list of languages is
 * a list that is wrong about somebody's language. Falls back to the
 * tag, which is honest.
 */
export function languageSays(tag: string, inLocale = 'en'): string {
  try {
    const names = new Intl.DisplayNames([inLocale], { type: 'language' });
    return names.of(tag) ?? tag;
  } catch {
    return tag;
  }
}
