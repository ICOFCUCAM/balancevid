/**
 * Channel numbers.  [Doctrine CHANNEL §2, D-04, D-18, TV-NETWORK N-6]
 *
 *     CH 102   REDEMPTION TV
 *     CH 103   AFRIN KONG TV
 *     CH 104   MUSIC HOUSE
 *
 * > *"The channel number is the key network-level identity, while
 * > the name/callsign is the human identity."*
 *
 * ALLOCATED, NEVER CHOSEN, and that is the whole reason this is a
 * separate record rather than a field on the channel:
 *
 * > *"I would not allow every user to choose any number they
 * > want."*
 *
 * A channel document is edited by its owner. A field in it that
 * the owner must not set would be a rule enforced only by the code
 * that happens to write it, and the first route that forgot would
 * let two channels be 102. The assignment lives where the owner
 * does not reach, keyed by the id that never changes.
 *
 * WHICH IS ALSO WHAT MAKES A LINEUP REORGANISABLE:
 *
 * > *"Channel ID: immutable. Channel Number: assigned/display
 * > identity… That means you can reorganize the lineup without
 * > breaking the actual channel."*
 *
 * Every address a viewer holds — the slug, the watch page, the
 * playlist — is keyed by id or slug and survives a renumbering
 * untouched.
 *
 * AND THE BRIEF'S RANGES ARE DELIBERATELY NOT BUILT. It proposes
 * 100–199 General, 200–299 Music, 300–399 Culture, and then warns
 * against itself:
 *
 * > *"But I would be careful about making these permanent
 * > categories too early."*
 *
 * It is right. A channel that changes its genre would change its
 * number, which is the one thing numbers are supposed not to do,
 * and an installation with four channels does not need six empty
 * hundreds. Numbers come from one pool; a network that later wants
 * ranges can impose them precisely BECAUSE the number is an
 * assignment and not an identity.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/**
 * The first number a channel can be given.
 *
 * > *"000–099 BalanceVid Network"*
 *
 * The one part of the brief's namespace that is kept, because it
 * is not a category: it is the network reserving room for itself,
 * and a station that wanted CH 1 would be taking the front of a
 * lineup it does not own.
 */
export const FIRST_NUMBER = 100;

/**
 * And the last.
 *
 * Four figures, because a viewer types a channel number on a
 * keypad and nobody keys five. An installation that fills nine
 * thousand nine hundred channels has a problem this constant is
 * not the answer to.
 */
export const LAST_NUMBER = 9999;

/** What the registry holds: a number per channel id. */
export type Assignments = Readonly<Record<string, number>>;

/**
 * Is this a number a channel may hold?
 *
 * Whole, in range, and nothing else. Checked rather than assumed
 * because assignments come off disk, where a hand-edited file can
 * say anything.
 */
export function usableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= FIRST_NUMBER && value <= LAST_NUMBER;
}

/**
 * Every number already spoken for.
 *
 * IT TOOK AN `exceptId` AND DID NOT NEED ONE. `numberFor` passed
 * its own channel, which looked careful and was unreachable: a
 * channel holding a usable number has already returned by then,
 * and one holding anything else is dropped by the filter below.
 * The clause survived every mutation, which is how it was found.
 * [the twenty-first]
 *
 * THE FILTER STAYS, because it is what makes the return type
 * true. This reads a record that comes off disk, and a
 * `Set<number>` that can contain `'rubbish'` is a lie told to
 * every caller in the type system's own words.
 */
export function takenNumbers(assigned: Assignments): Set<number> {
  const out = new Set<number>();
  for (const number of Object.values(assigned)) {
    if (usableNumber(number)) out.add(number);
  }
  return out;
}

/**
 * The number this channel has, or the one it should be given.
 *
 * LOWEST FREE, AND THE TRADE IS WORTH STATING. A number released
 * by a deleted channel is handed out again, so a viewer who
 * remembers CH 104 may find a different station there. The
 * alternative — never reusing — makes a five-channel installation
 * read 100, 103, 107, 112, which is a lineup with holes in it and
 * no explanation for them.
 *
 * An installation is not a national allocation table. The gaps
 * would be visible on every page; the collision needs a viewer who
 * memorised a number for a channel that has since been deleted.
 *
 * IDEMPOTENT, which is the property everything else depends on:
 * asking twice gives the same answer, and asking about a channel
 * that already has a number never moves it.
 */
export function numberFor(assigned: Assignments, channelId: string): number {
  const held = assigned[channelId];
  if (usableNumber(held)) return held;
  const taken = takenNumbers(assigned);
  for (let at = FIRST_NUMBER; at <= LAST_NUMBER; at += 1) {
    if (!taken.has(at)) return at;
  }
  /*
   * A FULL LINEUP IS NOT A CRASH. Nine thousand nine hundred
   * channels on one installation is a condition nothing here can
   * fix, and throwing would take down the directory for every
   * channel that does have a number. Zero is outside the usable
   * range by construction, so it reads as "no number" everywhere
   * a number is drawn.
   */
  return 0;
}

/**
 * The lineup, numbered.
 *
 * ORDERED BY NUMBER, which is what a channel number is for: the
 * directory can be alphabetical because a viewer browsing wants
 * names, and a LINEUP is read in the order the numbers go. Two
 * orderings for two questions. [D-04]
 */
export function lineupOf<T extends { id: string }>(
  channels: readonly T[], assigned: Assignments,
): { channel: T; number: number }[] {
  return channels
    .map((channel) => ({ channel, number: assigned[channel.id] ?? 0 }))
    .filter((row) => usableNumber(row.number))
    .sort((a, b) => a.number - b.number);
}

/**
 * The order a lineup is read in: down the numbers, then by name.
 *
 * ONE COMPARATOR BECAUSE THERE ARE TWO LINEUPS. The M3U carries
 * every listed channel and a viewer's favourites carry a few, and
 * both are lineups rather than directories — *"a directory is
 * browsed by somebody reading names, a lineup is tuned"*. Two
 * copies of this would be two answers to what order a dial is in.
 * [D-19]
 *
 * UNNUMBERED LAST, never first. Zero is outside the usable band,
 * so a plain numeric sort would put a channel the lineup never
 * reached in front of CH 100 — at the head of a dial it is not
 * on.
 */
export function dialOrder(
  a: { number: number; name: string }, b: { number: number; name: string },
): number {
  if (a.number !== b.number) {
    if (a.number === 0) return 1;
    if (b.number === 0) return -1;
    return a.number - b.number;
  }
  return a.name.localeCompare(b.name);
}

/**
 * What the next channel up or down from here is, for a remote.
 *
 * > *"A remote control could eventually have: CH + / CH −"*
 *
 * IT WRAPS, because a lineup is a ring on every television ever
 * made: pressing CH− on the first channel goes to the last. A
 * viewer holding the button down and stopping at the end would be
 * a viewer who thinks the set is broken.
 *
 * Nothing for a lineup of one, because there is nowhere to go.
 */
export function tuneFrom(
  numbers: readonly number[], from: number, by: 1 | -1,
): number | null {
  const lineup = [...new Set(numbers.filter(usableNumber))].sort((a, b) => a - b);
  if (lineup.length === 0) return null;
  if (lineup.length === 1) return lineup[0] === from ? null : lineup[0]!;
  const at = lineup.indexOf(from);
  if (at < 0) {
    /* Tuning from a number that is not in the lineup goes to the
       nearest one in the direction asked, which is what a set does
       when a channel is removed while you are watching it. */
    const found = by === 1
      ? lineup.find((one) => one > from) ?? lineup[0]
      : [...lineup].reverse().find((one) => one < from) ?? lineup[lineup.length - 1];
    return found ?? null;
  }
  return lineup[(at + by + lineup.length) % lineup.length]!;
}

/** `CH 102`, or nothing for a channel that has no number. */
export function numberSays(number: number | undefined): string {
  return usableNumber(number) ? `CH ${number}` : '';
}
