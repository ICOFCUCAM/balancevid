/**
 * A deck is one thing with twelve pages.
 *   [Doctrine CHANNEL §20, §3, D-04, D-18, D-19, C-48]
 *
 *     LIBRARY                          LIBRARY
 *     01  Admission Package — 1/12     01  Admission Package   12 slides  ▸
 *     02  Admission Package — 2/12     02  THE ANCIENT OF DAYS      4:05
 *     …                            →
 *     12  Admission Package — 12/12
 *     13  THE ANCIENT OF DAYS  4:05
 *
 * THE TWELVE ROWS WERE EACH CORRECT, which is what makes this a
 * listing fault rather than a data one. A page is a still, a still
 * is schedulable, and the schedule is the only way to put a caption
 * card on air AT A TIME — the Slides panel puts one up NOW and says
 * so: *"this panel adds no way of putting anything on air… the
 * schedule can already hold one."* So the pages cannot be hidden.
 *
 * What was wrong is that nothing said they were one thing. Twelve
 * rows carrying the same name pushed the operator's one video off
 * the bottom of the rail, and the deck they belong to — which has
 * a title, and a page count, and is the unit a person thinks in —
 * was not in the list at all.
 *
 * THE ROW IS CLOSED UNTIL IT IS ASKED FOR. [D-04] A deck of twelve
 * is one line until somebody wants a page out of it, and then it is
 * twelve. That is the same bargain every file list has made since
 * folders were invented, and it is the only one that keeps both
 * facts — *this is one deck* and *this page is schedulable*.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/** What this needs of a library item, and no more. */
export interface Listed {
  title: string;
  deck?: { id: string; title: string; page: number; of: number };
}

export type Row<T extends Listed> =
  | { kind: 'item'; item: T }
  /** A deck, shut: one line standing for all of its pages. */
  | { kind: 'deck'; id: string; title: string; pages: T[]; open: boolean }
  /** One page of an open deck. */
  | { kind: 'page'; item: T; deckId: string };

/**
 * The rail's rows, with each deck's pages gathered into one.
 *
 * A DECK KEEPS THE PLACE OF ITS FIRST PAGE, so the ordering the
 * caller sorted by — newest first — still holds. Moving decks to
 * the top would be this function having an opinion about what
 * matters, which belongs to whoever sorted the list. [D-04]
 *
 * AND THE PAGES COME OUT IN PAGE ORDER, which is not the order
 * they are listed in: the listing is by modification time, and a
 * page re-rasterised on its own would otherwise sort away from
 * the rest of its deck.
 */
export function libraryRows<T extends Listed>(
  items: readonly T[], openDeckId: string | null,
): Row<T>[] {
  const rows: Row<T>[] = [];
  const pages = new Map<string, T[]>();
  const at = new Map<string, number>();

  for (const item of items) {
    const deck = item.deck;
    if (!deck) { rows.push({ kind: 'item', item }); continue; }
    const seen = pages.get(deck.id);
    if (seen) { seen.push(item); continue; }
    pages.set(deck.id, [item]);
    at.set(deck.id, rows.length);
    rows.push({
      kind: 'deck', id: deck.id, title: deck.title, pages: [], open: false,
    });
  }

  for (const [id, found] of pages) {
    const where = at.get(id)!;
    const sorted = [...found].sort(
      (a, b) => (a.deck?.page ?? 0) - (b.deck?.page ?? 0));
    rows[where] = {
      kind: 'deck', id, title: sorted[0]!.deck!.title,
      pages: sorted, open: id === openDeckId,
    };
  }

  /*
   * AN OPEN DECK SPILLS ITS PAGES BELOW ITS OWN ROW, rather than
   * replacing it: the deck line is what closes it again, and a
   * list that swapped one row for twelve would leave nothing to
   * press. [D-04]
   */
  if (openDeckId === null) return rows;
  const out: Row<T>[] = [];
  for (const row of rows) {
    out.push(row);
    if (row.kind === 'deck' && row.open) {
      for (const page of row.pages) {
        out.push({ kind: 'page', item: page, deckId: row.id });
      }
    }
  }
  return out;
}

/** What a shut deck row says it holds. */
export function deckSays(pages: number): string {
  return `${pages} slide${pages === 1 ? '' : 's'}`;
}
