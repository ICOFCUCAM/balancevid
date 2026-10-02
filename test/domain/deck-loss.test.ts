/**
 * What is lost, said before it is lost.  [CHANNEL §20, §19, §5, D-04, C-37]
 *
 * THE SLIDES PANEL ASKED NOTHING. Nine surfaces in this product put a
 * dialog in front of something irreversible — `Confirm` exists for
 * it, and its own docstring is an argument about making a person
 * think. The one panel used BETWEEN TWO CUES, whose Remove deletes a
 * picture out of the library on a single press with no trash behind
 * it, reached that dialog from nowhere.
 *
 * These are the sentences. They are tested rather than written in
 * JSX because a confirmation is only worth having if it says what is
 * lost, and "are you sure?" is the version that gets clicked through.
 */

import { describe, expect, it } from 'vitest';

import type { Deck, Slide } from '../../src/domain/deck.js';
import {
  losingDeck, losingSlide, losingWriting, slideSays,
} from '../../src/domain/deck.js';

const AT = '2026-09-25T09:00:00.000Z';

function slide(over: Partial<Slide> = {}, page = 1): Slide {
  return {
    assetId: `asset_${page}`, page,
    spec: { layout: 'text', heading: `Heading ${page}` },
    ...over,
  };
}

function deckOf(...slides: Slide[]): Deck {
  return {
    id: 'deck_1' as Deck['id'], title: 'The quarterly talk', slides,
    origin: 'talk.pptx', createdAt: AT,
  };
}

describe('what to call a slide (C-37)', () => {
  it('uses its own words where it has any', () => {
    expect(slideSays(slide())).toBe('Heading 1');
  });

  /* A quote slide has no heading; its words are the body. */
  it('falls back to the first line of what it says', () => {
    expect(slideSays(slide({
      spec: { layout: 'quote', body: 'The first line\nand the second' },
    }))).toBe('The first line');
  });

  /* And a page of somebody's PowerPoint has neither. */
  it('falls back to the page number when it has no words at all', () => {
    expect(slideSays({ assetId: 'a', page: 7 })).toBe('Page 7');
  });
});

describe('removing a slide (C-37)', () => {
  const deck = deckOf(slide({}, 1), slide({}, 2), slide({}, 3));

  /*
   * NAMING IT IS THE POINT. A dialog that says "remove this slide?"
   * is a dialog the person answers from memory of which row they
   * pressed, which is the memory that was wrong.
   */
  it('names which slide, by number and by its own words', () => {
    const { question } = losingSlide(deck, 'asset_2');
    expect(question).toContain('slide 2');
    expect(question).toContain('Heading 2');
  });

  /* And says what is lost, which is more than the row. */
  it('says the picture goes and does not come back', () => {
    const { question } = losingSlide(deck, 'asset_2');
    expect(question).toContain('picture is deleted');
    expect(question).toContain('no way to bring it back');
  });

  /* The verb is on the button, never "OK". */
  it('puts the verb on the button', () => {
    expect(losingSlide(deck, 'asset_2').verb).toContain('Remove');
    expect(losingSlide(deck, 'asset_2').verb).not.toBe('OK');
  });

  /*
   * THE ON-AIR CASE IS A DIFFERENT DECISION. `bookingsFor` refuses a
   * slide that is in the schedule, the filler, the backup or the
   * emergency cut — and knows nothing about what is on the wire right
   * now. Deleting that file does not fail politely: the next segment
   * cannot read it and the channel falls back to black.
   */
  it('leads with the fact that changes the decision', () => {
    const { question, verb } = losingSlide(deck, 'asset_2', true);
    expect(question.startsWith('Slide 2')).toBe(true);
    expect(question).toContain('on air now');
    expect(question).toContain('black');
    expect(verb).toContain('anyway');
  });

  /* Two different decisions get two different sentences. */
  it('does not say the same thing either way', () => {
    expect(losingSlide(deck, 'asset_2', true).question)
      .not.toBe(losingSlide(deck, 'asset_2', false).question);
    expect(losingSlide(deck, 'asset_2', false).question)
      .not.toContain('on air now');
  });

  /* A slide that has already gone still gets a sentence that reads. */
  it('still reads when the slide is no longer there', () => {
    const { question } = losingSlide(deck, 'asset_gone');
    expect(question).toContain('this slide');
    expect(question).not.toContain('undefined');
    expect(question).not.toContain('NaN');
  });
});

describe('throwing a deck away (C-37)', () => {
  it('says how much goes with it', () => {
    const { question } = losingDeck(deckOf(slide({}, 1), slide({}, 2)));
    expect(question).toContain('The quarterly talk');
    expect(question).toContain('2 slides are deleted');
  });

  /*
   * ONE SLIDE IS NOT "1 SLIDES ARE". A sentence with the grammar
   * wrong is a sentence that was never read by anybody, which is
   * exactly what a person concludes about the warning in front of
   * them.
   */
  it('counts one slide in the singular', () => {
    const { question } = losingDeck(deckOf(slide()));
    expect(question).toContain('1 slide is deleted');
    expect(question).not.toContain('slides');
  });

  /* It is the one deletion here that really does remove media. */
  it('says why this one takes the pictures with it', () => {
    const { question } = losingDeck(deckOf(slide()));
    expect(question).toContain('not kept anywhere else');
  });
});

describe('loading a slide over words somebody typed (C-37)', () => {
  it('names the slide coming in and what goes out', () => {
    const { question, verb } = losingWriting(slide());
    expect(question).toContain('Heading 1');
    expect(question).toContain('not saved anywhere');
    expect(verb).toContain('Replace');
  });
});
