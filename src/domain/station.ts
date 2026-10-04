/**
 * A channel's public identity.  [Doctrine CHANNEL §2, §3, D-04, D-18,
 * TV-NETWORK N-1]
 *
 *     REDEMPTION TV
 *     RDTV · Channel 124
 *     Faith · English · United States
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

/**
 * One audio rendition of a channel.
 *
 * A TAG AND A LABEL, because they answer different questions. The
 * tag is what HLS carries and what a player matches a viewer's
 * preference against; the label is what a station calls it, which
 * is not always the language's own name — *"Original"*, *"Audio
 * description"*, *"Commentary"*. A product that derived the
 * second from the first would be a product renaming a
 * broadcaster's own tracks. [`languageSays`]
 */
export interface AudioTrack {
  /** A language subtag: `en`, `fr`, `sw`. */
  language: string;
  /** What the station calls it. Absent falls back to the tag's name. */
  label?: string;
  /**
   * The one a player starts on.
   *
   * EXACTLY ONE, ENFORCED WHERE THESE ARE WRITTEN rather than
   * trusted here: a list with two defaults is a stream whose
   * opening audio depends on which rendition the player read
   * first, which is a bug that appears for some viewers and not
   * others.
   */
  default?: boolean;
}

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
  /**
   * THE STATION'S OWN PICTURE, behind its name.  [N-4]
   *
   * A LOGO IS A MARK AND A BANNER IS A PHOTOGRAPH, and a station
   * page built on the first alone reads as a database row with a
   * sticker on it. This is the picture a broadcaster would put
   * behind their own name: a congregation, a studio floor, a
   * street — the thing that says what the channel IS before a
   * word is read.
   *
   * OPTIONAL, AND ABSENT IS DESIGNED RATHER THAN HANDLED. A new
   * station has no banner on the day it is published, which is
   * the ordinary case; the page draws the identity gradient it
   * already generates for a logo-less card, at the size of a
   * band. Nothing is broken and nothing says *missing*.
   *
   * A LIBRARY ASSET, like the logo and like every other picture
   * reference in this product, served by its own slug-keyed route
   * so a stranger reading the page is never handed a library id.
   * [§3, D-18, D-03]
   */
  bannerAssetId?: string;
  /**
   * THE LANGUAGES THIS CHANNEL IS HEARD IN.  [N-4]
   *
   * MODELLED BEFORE IT IS BUILT, DELIBERATELY. The chain is four
   * links — this record, the ingest that supplies the extra
   * audio, the encoder that muxes and publishes it as HLS
   * `EXT-X-MEDIA` renditions, and a player that lists them — and
   * only the first is cheap. Writing it now means nothing built
   * between now and then has to be unpicked; writing a panel now
   * would mean five flags over one audio track.
   *
   * ABSENT MEANS ONE TRACK, which is every channel today, and
   * `language` above remains the answer for it. This list is for
   * a channel that genuinely carries more than one, and a list of
   * one is the same as no list. Nothing reads it yet.
   *
   * PRICED, AND THE GATE IS ON OFFERING RATHER THAN HEARING. The
   * broadcaster's account needs the `multi-audio` extra to
   * declare these; a viewer never needs anything, and must never
   * be told that audio they want exists but is locked. They are
   * not the customer. [account.ts `EXTRAS`]
   */
  audio?: AudioTrack[];
  /**
   * A HOST THIS STATION ALSO ANSWERS ON: `tv.redemption.example`.
   *
   * > *"The channel owner can eventually have a custom domain, but
   * > BalanceVid provides the canonical public channel identity."*
   *
   * SECOND, NEVER INSTEAD. The slug above is the identity — it is
   * what the directory links to, what a share card names and what
   * the canonical tag on both pages points at. This is a front
   * door the owner also owns, and the brief is explicit about why
   * it cannot be the identity:
   *
   * > *"imagine 10,000 BalanceVid channels. A viewer cannot
   * > reasonably remember `channel-name-247.some-domain.com`."*
   *
   * THE HOST ALONE. No scheme, no port, no path, no trailing dot —
   * refused rather than repaired, like every other identifier
   * here, because a domain is a thing somebody prints on a poster
   * and quietly turning what they typed into something else is how
   * a station advertises an address that is not theirs.
   */
  domain?: string;
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

/* ------------------------------------------------------------------------ *
 *  The custom domain.  [TV-NETWORK N-8]
 * ------------------------------------------------------------------------ */

/** The length a hostname may not exceed, from the DNS itself. */
export const DOMAIN_LONGEST = 253;
/** And one label of it. */
export const LABEL_LONGEST = 63;

/**
 * Why this host cannot be a station's domain, or null.
 *
 * THE ORDER OF THE CLAUSES IS THE QUALITY OF THE MESSAGE. Somebody
 * pasting `https://tv.example.com/` has made one mistake and should
 * be told which; checked label by label first, they would be told
 * their domain contains an illegal character, which is true and
 * useless.
 *
 * NO PORT, because a public station reached on `:8443` is not a
 * public station, and the host a request arrives with has its port
 * stripped before anything compares it.
 *
 * PUNYCODE OR NOTHING. `tv.café.example` is a real domain and its
 * wire form is `tv.xn--caf-dma.example`; converting it here would
 * be the quiet repair this product refuses everywhere else, and
 * storing the unicode form would be a value no incoming request
 * can ever equal.
 */
export function domainProblem(domain: string): string | null {
  if (domain !== domain.trim()) return 'a domain cannot start or end with a space';
  if (!domain) return 'nothing to use as a domain';
  if (domain.includes('://')) return 'just the host — no https:// in front';
  if (domain.includes('/')) return 'just the host — no path after it';
  if (domain.includes(':')) return 'a domain carries no port';
  if (domain.includes('@')) return 'that is an address, not a domain';
  if (domain.length > DOMAIN_LONGEST) {
    return `too long — ${DOMAIN_LONGEST} characters at most`;
  }
  if (domain.endsWith('.')) return 'a domain does not end with a dot';
  if (!domain.includes('.')) return 'needs at least one dot, like tv.example.com';
  if (/[^a-z0-9.-]/.test(domain)) {
    return 'lower case letters, numbers, dots and hyphens only — '
      + 'an international domain goes in its punycode form (xn--…)';
  }
  const labels = domain.split('.');
  for (const label of labels) {
    if (!label) return 'two dots together is a typing mistake';
    if (label.length > LABEL_LONGEST) {
      return `one part of it is too long — ${LABEL_LONGEST} characters at most`;
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return 'no part of a domain starts or ends with a hyphen';
    }
  }
  /*
   * AND THE LAST PART IS NOT A NUMBER, which is the whole of the
   * IP-address check: `1.2.3.4` passes every rule above and is not
   * a domain. A station reachable only at an address is a station
   * nobody can be told about.
   */
  if (/^[0-9]+$/.test(labels[labels.length - 1]!)) {
    return 'that is an IP address, not a domain';
  }
  return null;
}

/**
 * The host a request arrived on, as a domain can be compared to.
 *
 * ONE FUNCTION, BECAUSE THERE ARE TWO READERS AND THEY MUST AGREE.
 * The middleware decides whether a host is the installation's own
 * and the page decides which station answers on it; a port kept in
 * one and stripped in the other is a custom domain that routes and
 * then 404s, which is the worst of both.
 *
 * Nothing for a host there is no sense in comparing.
 */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  /* The first, where a proxy chain left several. */
  const first = value.split(',')[0]!.trim().toLowerCase();
  /* And without its port, which `tv.example.com:443` carries and a
     stored domain never does. */
  const bare = first.split(':')[0]!;
  return bare && !bare.includes('/') ? bare : null;
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
    station.genre ? genreSays(station.genre) : null,
    station.language ? languageSays(station.language) : null,
    station.country ? countrySays(station.country) : null,
  ].filter(Boolean).join(' · ');
}

/**
 * A genre as a reader sees it: `faith` becomes `Faith`.
 *
 * EXPORTED BECAUSE A SECOND READER ARRIVED. The genre is stored
 * lower case because it is an enum and a key — `/tv/channels?genre=faith`
 * — and every surface that shows it to a person has to undo that.
 * The directory line did it privately; the M3U's `group-title` is
 * a folder name on somebody's television and needs the same word.
 * A second copy is how one of them comes to say `faith`. [D-19]
 */
export function genreSays(genre: string): string {
  return genre.slice(0, 1).toUpperCase() + genre.slice(1);
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

/**
 * A country code as the country's name.
 *
 * > *"remember this is a world system not for only 54 countries"*
 *
 * The directory line read `Faith · English · CM`, which is a row
 * showing its database to a viewer who has no reason to know ISO
 * 3166. `Intl.DisplayNames` is the platform's own table and the
 * same argument `languageSays` already makes applies unchanged:
 * a hand-written list of countries is a list that is wrong about
 * somebody's country, and it is wrong about more of them every
 * decade. Falls back to the code in capitals, which is honest.
 *
 * THE CODE IS WHAT IS STORED AND THIS IS ONLY HOW IT READS.
 * Nothing filters or routes on the output — `?country=cm` stays
 * the key — because a name is a thing that can be translated and
 * a key is not. [D-19, N-4]
 */
export function countrySays(code: string, inLocale = 'en'): string {
  const want = code.trim().toUpperCase();
  if (!want) return '';
  try {
    const names = new Intl.DisplayNames([inLocale], { type: 'region' });
    /*
     * BACK TO THE CODE RATHER THAN TO A SHRUG. A reader can look
     * up `QZ`; they cannot look up a phrase meaning *we do not
     * know*. (`fallback: 'code'` stood here and said the same
     * thing twice — it survived every mutation, because this
     * clause already answers for every code the table misses.)
     */
    return names.of(want) ?? want;
  } catch {
    return want;
  }
}
