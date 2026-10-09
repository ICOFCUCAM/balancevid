/**
 * Where a person's own work stands.
 *   [TAKE-APP T16, P5; Doctrine D-03, D-04, D-19, U-02, U-19]
 *
 * > *"My Takes. Drafts — private until you choose to send. Sent
 * > to studio — submission status from the owning installation.
 * > Published — creator copies and share permissions."*
 *
 * THE DATA WAS ALREADY ON THE WIRE. `/api/take/<link>` has
 * answered with `state` and `submitted` on every row since the
 * recorder existed, and the Library asked for them on every row
 * and kept neither — so nine takes across four studios sat in
 * one undifferentiated list, and the one row that still needed
 * recording looked exactly like the eight that did not.
 */

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  SHELVES, type Shelf, shelvesWith, standingOf,
} from '../../src/domain/takeShelf.js';
import { REQUEST_STATES, type RequestState } from '../../src/domain/participation.js';

const where = (
  state: RequestState | undefined, submitted: number, published = false,
): Shelf => standingOf({ state, submitted, published }).shelf;

describe('whose move it is', () => {
  /*
   * THE ONE SUBTLE LINE IN THE FILE. A request moves to
   * `recording` the moment somebody opens the recorder and
   * points a camera at themselves, and a page that called that
   * "sent to the studio" would be telling a person their face
   * had left the device when it had not. `submitted` decides
   * this, and the state does not. [D-03, U-19]
   */
  it('keeps a take that was recorded and never sent on the performer’s own shelf', () => {
    expect(where('recording', 0)).toBe('mine');
    expect(standingOf({ state: 'recording', submitted: 0, published: false }).says)
      .toMatch(/not sent/i);
  });

  it('moves it the moment one has actually arrived', () => {
    expect(where('recording', 1)).toBe('theirs');
    expect(where('submitted', 1)).toBe('theirs');
    expect(where('received', 2)).toBe('theirs');
    expect(where('reviewed', 3)).toBe('theirs');
  });

  /*
   * HOW MANY, BECAUSE THEY SENT THEM ONE AT A TIME AND REMEMBER
   * DOING IT. "Sent" on a row where somebody sent three is a
   * page that has not been paying attention.
   */
  it('counts them back, in the singular and the plural', () => {
    expect(standingOf({ state: 'submitted', submitted: 1, published: false }).says)
      .toMatch(/^One take sent/);
    expect(standingOf({ state: 'submitted', submitted: 3, published: false }).says)
      .toMatch(/^3 takes sent/);
  });

  it('says a studio took it, and says when one published it', () => {
    expect(where('accepted', 1)).toBe('done');
    expect(where('attached', 1)).toBe('done');
    expect(standingOf({ state: 'accepted', submitted: 1, published: true }).says)
      .toMatch(/published/i);
  });

  /*
   * THE FOURTH SHELF IS NOT IN THE BENCHMARK, and it is in this
   * product because `rejected` is a state a real request
   * reaches. Folding it into "sent" would leave somebody waiting
   * for an answer that has already come. [U-19]
   */
  it('does not leave somebody waiting for an answer that came', () => {
    expect(where('rejected', 2)).toBe('closed');
    expect(standingOf({ state: 'rejected', submitted: 2, published: false }).says)
      .not.toMatch(/waiting/i);
  });

  /*
   * AND A ROW NOBODY HAS HEARD BACK ABOUT YET STANDS SOMEWHERE.
   * The Library fetches each link one at a time; a row whose
   * answer has not landed has no state at all, and an
   * `undefined` that fell through every branch would be a take
   * on no shelf — invisible, on the page whose whole job is to
   * hold everything. [U-19]
   */
  it('puts a row it has not heard about anywhere but nowhere', () => {
    expect(where(undefined, 0)).toBe('mine');
    expect(where(undefined, 0)).not.toBe(undefined);
  });

  /* Every state the product has reaches a shelf, including any
     added after this was written. [V-8] */
  it('has an answer for all ten states a request can be in', () => {
    for (const state of REQUEST_STATES) {
      const shelf = where(state, 1);
      expect(SHELVES.map((one) => one.shelf), state).toContain(shelf);
    }
  });
});

describe('the shelves that get drawn', () => {
  /*
   * A SHELF WITH NOTHING ON IT IS NOT DRAWN. The benchmark draws
   * all three headings with a dash beside each — a design
   * showing its own structure. A person with one take does not
   * need to be told they have nothing published and nothing
   * rejected, and this product's own rule about headings with
   * nothing under them applies to its own app. [D-04, U-19]
   */
  it('draws none of the empty ones', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const all = shelvesWith(rows, (row) =>
      standingOf({
        state: row.id === 'a' ? 'recording' : 'accepted',
        submitted: row.id === 'a' ? 0 : 1,
        published: false,
      }));
    expect(all.map((one) => one.shelf)).toEqual(['mine', 'done']);
    expect(all.every((one) => one.rows.length > 0)).toBe(true);
  });

  /* Whose move it is, first: the only rows anybody can act on. */
  it('puts the ones still waiting on the performer at the top', () => {
    expect(SHELVES[0]?.shelf).toBe('mine');
    expect(SHELVES.map((one) => one.shelf))
      .toEqual(['mine', 'theirs', 'done', 'closed']);
    for (const one of SHELVES) {
      expect(one.says.length).toBeGreaterThan(3);
      expect(one.under.length).toBeGreaterThan(15);
    }
  });

  it('keeps every row, on one shelf and only one', () => {
    const rows = REQUEST_STATES.map((state) => ({ state }));
    const all = shelvesWith(rows, (row) =>
      standingOf({ state: row.state, submitted: 1, published: false }));
    const kept = all.flatMap((one) => one.rows);
    expect(kept.length).toBe(rows.length);
    expect(new Set(kept.map((one) => one.state)).size).toBe(rows.length);
  });
});

/**
 * AND THE PAGE DRAWS THEM.
 *
 * Asserted by rendering, for the reason the install tests give:
 * a file that holds the right markup and never reaches it is the
 * failure this suite could not see until it started rendering.
 * The page reads the device's storage, which a server render
 * does not have — so this proves the shelves are reached and the
 * empty state is honest, which is what the page shows a phone
 * with nothing on it. [U-02]
 */
describe('the Library’s own derivation', () => {
  /*
   * THE ONE EXPRESSION A RENDER CANNOT REACH, PULLED OUT SO A
   * TEST CAN. Everything on that page arrives through an effect
   * reading the device's storage, and effects do not run in a
   * server render — so a mutation that handed the shelves an
   * empty list instead of the person's takes emptied the
   * Library and the whole suite passed. [U-02]
   */
  it('builds the shelves out of the takes the device holds', async () => {
    const { shelvesFor } = await import('../../app/take/library/Library.js');
    const held = [
      { link: 'a.1', title: 'One', kind: 'performance', at: '2026-01-01' },
      { link: 'b.2', title: 'Two', kind: 'performance', at: '2026-01-01' },
      { link: 'c.3', title: 'Three', kind: 'performance', at: '2026-01-01' },
      /*
       * A FOURTH ROW, ADDED BECAUSE THE FIRST THREE COULD NOT
       * TELL THE STATE FROM THE COUNT. With `state` ignored
       * altogether every one of them still landed on the shelf
       * it belonged on — the count and the collection carried
       * them — so the test passed with the studio's own answer
       * thrown away. `rejected` is the one shelf only the state
       * can reach. [U-02]
       */
      { link: 'd.4', title: 'Four', kind: 'performance', at: '2026-01-01' },
    ];
    const rows = {
      'a.1': { mine: held[0]!, state: 'recording' as const, submitted: 0 },
      'b.2': { mine: held[1]!, state: 'submitted' as const, submitted: 2 },
      'c.3': {
        mine: held[2]!, state: 'accepted' as const, submitted: 1,
        collection: { title: 'A song', watch: '/w', file: '/f' },
      },
      'd.4': { mine: held[3]!, state: 'rejected' as const, submitted: 2 },
    };
    const shelves = shelvesFor(held, rows);
    expect(shelves.map((one) => one.shelf))
      .toEqual(['mine', 'theirs', 'done', 'closed']);
    expect(shelves.flatMap((one) => one.rows).length).toBe(4);
    /*
     * AND THE FINISHED PIECE IS NAMED AS ONE. A take the studio
     * accepted and a take the studio PUBLISHED land on the same
     * shelf and are not the same news: only the second gives a
     * person something to watch and send to their family. The
     * first version of this test asserted that through
     * `standingOf` directly and proved nothing about the page —
     * a mutation that stopped reading `collection` in the
     * derivation shelved every row correctly and silently
     * dropped the sentence. The standing now travels WITH the
     * row, so the claim is about what the Library produced.
     * [U-02, D-19]
     */
    const used = shelves.find((one) => one.shelf === 'done');
    expect(used?.rows[0]?.standing.says).toMatch(/published/i);
    expect(shelves.find((one) => one.shelf === 'theirs')?.rows[0]?.standing.says)
      .toMatch(/2 takes sent/);
  });

  /* A device with nothing on it, and one that has not answered
     yet, are both nothing to draw — and neither throws. */
  it('draws nothing for a device that holds nothing', async () => {
    const { shelvesFor } = await import('../../app/take/library/Library.js');
    expect(shelvesFor(null, {})).toEqual([]);
    expect(shelvesFor([], {})).toEqual([]);
  });

  /*
   * AND A TAKE NOBODY HAS ANSWERED FOR YET IS STILL ON THE
   * PAGE. The rows arrive one fetch at a time; a derivation that
   * only kept the ones it had heard about would make a person's
   * list grow in front of them from empty. [U-19]
   */
  it('keeps a take whose answer has not landed', async () => {
    const { shelvesFor } = await import('../../app/take/library/Library.js');
    const held = [{ link: 'z.9', title: 'Waiting', kind: 'performance', at: '2026-01-01' }];
    const shelves = shelvesFor(held, {});
    expect(shelves.map((one) => one.shelf)).toEqual(['mine']);
    expect(shelves[0]?.rows.length).toBe(1);
    expect(shelves[0]?.rows[0]?.standing.says).toMatch(/not recorded/i);
  });
});

describe('the Library', () => {
  vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

  /*
   * THE FIRST FRAME HOLDS NOTHING, AND THAT IS THE CLAIM.
   *
   * This was written expecting the empty sentence and got an
   * empty section, which is the page being right and the test
   * being wrong: `held` is `null` until the effect reads the
   * device, effects do not run in a server render, and the
   * sentence "you have not taken part in anything" belongs to a
   * phone that has ANSWERED with nothing rather than to one
   * that has not been asked. A page that printed it on the
   * first frame would tell somebody with nine takes that they
   * had none, for one frame, every time they opened it. [U-19]
   *
   * What the populated shelves look like is measured in a
   * browser with a seeded device and the real API shapes, not
   * here: no server render can reach them.
   */
  it('claims nothing about a device it has not read yet', async () => {
    const { default: Library } = await import('../../app/take/library/Library.js');
    const html = renderToStaticMarkup(createElement(Library));
    expect(html).toContain('data-testid="section-mine"');
    expect(html).not.toContain('data-testid="mine-shelf"');
    expect(html).not.toContain('data-testid="mine-row"');
    /* And no sentence about being empty, which would be a guess. */
    expect(html).not.toContain('have not taken part');
  });
});
