/**
 * A deck is an order.  [Doctrine CHANNEL §20, D-18, D-19, D-22]
 *
 * What is being protected here is the claim that a deck adds nothing to the
 * product but an order: a slide is a library image, and putting one on air
 * is the `roll-in` that already existed.
 */

import { describe, expect, it } from 'vitest';

import type { ProgrammeSource } from '../../src/domain/channel.js';
import {
  type Deck, canMakeDeckFrom, deckAssetIds, slideOnAir, sourceForSlide, step,
} from '../../src/domain/deck.js';

const deck: Deck = {
  id: 'deck_talk' as Deck['id'],
  title: 'The Long Conversation',
  slides: [
    { assetId: 'ast_1', page: 1 },
    { assetId: 'ast_2', page: 2 },
    { assetId: 'ast_3', page: 3 },
  ],
  origin: 'talk.pptx',
  createdAt: '2026-04-20T09:00:00.000Z',
};

const empty: Deck = { ...deck, slides: [] };

describe('a slide is a library image', () => {
  /*
   * THE WHOLE CLAIM OF §20. If a slide were a new kind of media, the
   * playout engine, the monitor and the schedule would each need to learn
   * it. It is the kind they have all handled since they were written.
   */
  it('is an ordinary media reference, of the kind the engine can broadcast', () => {
    const source = sourceForSlide(deck.slides[1]!);
    expect(source).toEqual({ kind: 'media', assetId: 'ast_2', form: 'image' });
  });

  it('names every page, for the check that counts what is on disk', () => {
    expect(deckAssetIds(deck)).toEqual(['ast_1', 'ast_2', 'ast_3']);
  });
});

describe('where the deck is', () => {
  /*
   * READ FROM WHAT IS ON AIR, not from a counter. A stored cursor is a
   * second opinion about what a viewer can see, and the two disagree on
   * exactly the press that matters. [D-22]
   */
  it('is read from the thing that is actually on air', () => {
    expect(slideOnAir(deck, sourceForSlide(deck.slides[2]!))).toBe(2);
  });

  it('is nowhere when something else is up', () => {
    const film: ProgrammeSource = {
      kind: 'render', document: 'performance',
      documentId: 'perf_1', planHash: 'a'.repeat(64),
    };
    expect(slideOnAir(deck, film)).toBe(-1);
    expect(slideOnAir(deck, undefined)).toBe(-1);
    /* Another deck's page is not this deck's page. */
    expect(slideOnAir(deck, { kind: 'media', assetId: 'ast_other', form: 'image' }))
      .toBe(-1);
  });
});

describe('stepping through it', () => {
  it('goes forward and back', () => {
    expect(step(deck, 0, 1)?.assetId).toBe('ast_2');
    expect(step(deck, 2, -1)?.assetId).toBe('ast_2');
  });

  /*
   * Pressing NEXT when none of the deck is up starts it, which is what the
   * button looks like it should do.
   */
  it('starts the deck from nowhere', () => {
    expect(step(deck, -1, 1)?.assetId).toBe('ast_1');
    /* Backwards from nowhere is nowhere: there is nothing behind you. */
    expect(step(deck, -1, -1)).toBeUndefined();
  });

  /*
   * IT DOES NOT WRAP, and this is the one behaviour worth a test of its
   * own. A deck that looped would put the title card back up in front of
   * an audience waiting for the presenter to finish, and the operator
   * pressing NEXT would have no way to tell that from one more slide.
   */
  it('runs out rather than wrapping', () => {
    expect(step(deck, 2, 1)).toBeUndefined();
    expect(step(deck, 0, -1)).toBeUndefined();
  });

  it('has nothing to step through when it is empty', () => {
    expect(step(empty, -1, 1)).toBeUndefined();
    expect(step(empty, 0, 1)).toBeUndefined();
  });
});

describe('what can become a deck', () => {
  it('accepts the formats the evidence pipeline can already rasterise', () => {
    for (const name of [
      'talk.pdf', 'talk.pptx', 'TALK.PPT', 'talk.odp',
      'notes.docx', 'notes.doc', 'notes.odt', 'notes.rtf',
      'figures.xlsx', 'figures.ods',
    ]) {
      expect(canMakeDeckFrom(name), name).toBe(true);
    }
  });

  /*
   * Refused before a byte is written, because an unknown extension handed
   * to a converter is two minutes of a worker discovering it cannot be
   * done — the reason `pages.ts` keeps a list rather than trying.
   */
  it('refuses what a converter would only fail at later', () => {
    for (const name of ['clip.mp4', 'photo.png', 'archive.zip', 'noextension']) {
      expect(canMakeDeckFrom(name), name).toBe(false);
    }
  });
});
