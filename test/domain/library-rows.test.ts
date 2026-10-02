/**
 * A deck is one thing with twelve pages.
 *   [CHANNEL §20, §3, D-04, D-18, D-19, C-48]
 *
 * > *"HOW COME I CANNOT UPLOAD MEDIA INTO PLAYLIST"*
 *
 * The rail the author was looking at held twelve rows all called
 * "Admission Package — Dorot…", above the one video they wanted.
 * Each row was CORRECT — a page is a still, a still is
 * schedulable, and the schedule is the only way to put a caption
 * card out at a time. Nothing said they were one thing.
 */

import { describe, expect, it } from 'vitest';

import {
  type Listed, deckSays, libraryRows,
} from '../../src/domain/libraryRows.js';

const page = (deck: string, page: number, of: number): Listed => ({
  title: `${deck} ${page}/${of}`,
  deck: { id: deck, title: deck, page, of },
});
const plain = (title: string): Listed => ({ title });

/** The author's rail: twelve pages of one deck, then a film. */
const RAIL: Listed[] = [
  ...Array.from({ length: 12 }, (_u, at) => page('admission', at + 1, 12)),
  plain('THE ANCIENT OF DAYS'),
];

describe('a deck does not fill the rail (C-48)', () => {
  it('is one row shut, not twelve', () => {
    const rows = libraryRows(RAIL, null);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'deck', id: 'admission' });
    expect(rows[1]).toMatchObject({ kind: 'item' });
  });

  /* And the film is no longer thirteenth. */
  it('puts the operator’s video where they can see it', () => {
    const rows = libraryRows(RAIL, null);
    const film = rows.findIndex(
      (row) => row.kind === 'item' && row.item.title === 'THE ANCIENT OF DAYS');
    expect(film).toBe(1);
  });

  /*
   * EVERY PAGE IS STILL REACHABLE, which is the whole reason this
   * groups rather than hides: the schedule is the only way to put
   * a caption card on air at a time.
   */
  it('gives every page back when the deck is opened', () => {
    const rows = libraryRows(RAIL, 'admission');
    const pages = rows.filter((row) => row.kind === 'page');
    expect(pages).toHaveLength(12);
    /* The deck line stays, because it is what shuts it again. */
    expect(rows[0]).toMatchObject({ kind: 'deck', open: true });
  });

  it('opens only the deck that was asked for', () => {
    const two = [...RAIL, page('other', 1, 2), page('other', 2, 2)];
    const rows = libraryRows(two, 'other');
    const open = rows.filter((row) => row.kind === 'deck' && row.open);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id: 'other' });
    expect(rows.filter((row) => row.kind === 'page')).toHaveLength(2);
  });
});

describe('the rail keeps the order it was given (C-48)', () => {
  /*
   * A DECK KEEPS THE PLACE OF ITS FIRST PAGE. Moving decks to the
   * top would be this function having an opinion about what
   * matters, which belongs to whoever sorted the list. [D-04]
   */
  it('leaves a deck where its first page was', () => {
    const mixed = [plain('first'), page('d', 1, 2), page('d', 2, 2), plain('last')];
    const rows = libraryRows(mixed, null);
    expect(rows.map((row) => row.kind)).toEqual(['item', 'deck', 'item']);
    expect((rows[0] as { item: Listed }).item.title).toBe('first');
    expect((rows[2] as { item: Listed }).item.title).toBe('last');
  });

  /*
   * AND THE PAGES COME OUT IN PAGE ORDER, which is not the order
   * they arrive in: the listing is by modification time, so a page
   * re-rasterised on its own sorts away from the rest of its deck.
   */
  it('puts the pages in page order, not in file order', () => {
    const shuffled = [page('d', 3, 3), page('d', 1, 3), page('d', 2, 3)];
    const rows = libraryRows(shuffled, 'd');
    expect(rows.filter((row) => row.kind === 'page')
      .map((row) => (row as { item: Listed }).item.deck!.page))
      .toEqual([1, 2, 3]);
  });

  /* Two decks interleaved in the listing are still two decks. */
  it('keeps two decks apart', () => {
    const mixed = [page('a', 1, 2), page('b', 1, 2), page('a', 2, 2), page('b', 2, 2)];
    const rows = libraryRows(mixed, null);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => (row as { id: string }).id)).toEqual(['a', 'b']);
    for (const row of rows) {
      expect((row as { pages: Listed[] }).pages).toHaveLength(2);
    }
  });
});

describe('a rail with no decks in it (C-48)', () => {
  /* Nothing changes for a channel that has never made one. */
  it('is exactly what it was', () => {
    const only = [plain('one'), plain('two')];
    expect(libraryRows(only, null).map((row) => row.kind))
      .toEqual(['item', 'item']);
    expect(libraryRows(only, 'nothing')).toHaveLength(2);
  });

  it('says nothing at all about an empty library', () => {
    expect(libraryRows([], null)).toEqual([]);
  });
});

describe('what a shut deck says it holds (C-48)', () => {
  it('counts its pages', () => {
    expect(deckSays(12)).toBe('12 slides');
  });

  /* One slide is a slide, which is the kind of thing a product
     gets wrong on the one deck somebody made to try it out. */
  it('does not say 1 slides', () => {
    expect(deckSays(1)).toBe('1 slide');
  });
});
