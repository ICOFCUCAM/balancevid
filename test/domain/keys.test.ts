/**
 * Where a keystroke belongs.  [D-04, U-19, CHANNEL §20, §5, C-39]
 *
 * THE SAME JUDGEMENT WAS WRITTEN THREE TIMES, in two studios, in two
 * different strengths — twice in one function of the performance
 * studio, and once, stronger, in the conversation studio. The strong
 * one honoured an element's own opt-out; the weak ones did not. So
 * the same markup kept its keys on one surface and lost them on
 * another, and nothing anywhere said which was right.
 *
 * AND THE OPT-OUT WAS SET BY NOTHING. `data-keys="own"` had a reader
 * and no writer in the whole product, so no element had ever used
 * it and the disagreement had never been felt.
 *
 * These are object literals rather than a browser because the
 * functions are structural: a test satisfies them with two plain
 * objects and a real event satisfies them without being asked.
 */

import { describe, expect, it } from 'vitest';

import {
  type Focused, type Pressed,
  OWN_KEYS_SELECTOR, deckKey, pageTakes, typingIn,
} from '../../src/domain/keys.js';

/** An element, with nothing above it unless `own` says so. */
function focused(
  tagName: string,
  { editable = false, own = false }: { editable?: boolean; own?: boolean } = {},
): Focused {
  return {
    tagName,
    isContentEditable: editable,
    closest: (selectors: string) =>
      (own && selectors === OWN_KEYS_SELECTOR ? {} : null),
  };
}

const press = (key: string, held: Partial<Pressed> = {}): Pressed =>
  ({ key, ...held });

describe('whose key is it (C-39)', () => {
  /* A "3" meant for a take's name must not cut to take three. */
  it('leaves a field its own keys', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(typingIn(focused(tag)), tag).toBe(true);
    }
  });

  /* A rich editor is a div, which the tag test alone misses. */
  it('leaves an editor that is not a field its own keys', () => {
    expect(typingIn(focused('DIV', { editable: true }))).toBe(true);
    expect(typingIn(focused('DIV'))).toBe(false);
  });

  /*
   * AND THE OPT-OUT, which is the half the weaker copies did not
   * have. A row of buttons that drives itself with arrows is a row
   * of buttons: no tag test will ever catch it, and without this it
   * loses its arrows to the page.
   */
  it('honours an element’s own claim on its keys', () => {
    expect(typingIn(focused('BUTTON', { own: true }))).toBe(true);
    expect(typingIn(focused('BUTTON'))).toBe(false);
  });

  /* Nothing focused is not somebody typing. */
  it('takes the key when nothing is focused', () => {
    expect(typingIn(null)).toBe(false);
    expect(typingIn(undefined)).toBe(false);
  });

  /* A lowercase tag name is not a field by accident. */
  it('matches the whole tag name rather than part of one', () => {
    expect(typingIn(focused('INPUTS'))).toBe(false);
    expect(typingIn(focused('MYINPUT'))).toBe(false);
  });
});

describe('what the page may take (C-39)', () => {
  /* Cmd-1 belongs to the browser and always has. */
  it('leaves every modifier combination alone', () => {
    for (const held of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      expect(pageTakes(press('1', held), null), JSON.stringify(held)).toBe(false);
    }
  });

  /*
   * SHIFT IS NOT ONE OF THEM. It chooses a direction rather than a
   * command, and a page that gave up Shift-Space would be a page
   * that scrolls backwards for nobody.
   */
  it('still takes a shifted key', () => {
    expect(pageTakes(press(' ', { shiftKey: true }), null)).toBe(true);
  });

  it('gives the key back to whoever is typing', () => {
    expect(pageTakes(press('1'), focused('INPUT'))).toBe(false);
    expect(pageTakes(press('1'), focused('DIV'))).toBe(true);
  });
});

describe('the keys a deck answers to (C-39)', () => {
  /*
   * A PRESENTER'S REMOTE IS A KEYBOARD. Every clicker sold sends
   * Page Down and Page Up — that is the whole of what the hardware
   * is — so a product with arrows and no page keys works for the
   * operator at the desk and not for the person standing up in
   * front of the room.
   */
  it('answers to a clicker as well as to the arrows', () => {
    expect(deckKey(press('ArrowRight'), null)).toBe('next');
    expect(deckKey(press('PageDown'), null)).toBe('next');
    expect(deckKey(press('ArrowLeft'), null)).toBe('back');
    expect(deckKey(press('PageUp'), null)).toBe('back');
  });

  /* The key every presentation tool has used for thirty years. */
  it('blanks on a full stop', () => {
    expect(deckKey(press('.'), null)).toBe('blank');
  });

  /*
   * SPACE IS DELIBERATELY ABSENT. It scrolls a page and it starts a
   * recording in the conversation studio; a key meaning three
   * things on three surfaces of one product is a key an operator
   * cannot trust. The clickers that send it send Page Down too.
   */
  it('does not take the space bar', () => {
    expect(deckKey(press(' '), null)).toBe(null);
    expect(deckKey(press('Spacebar'), null)).toBe(null);
  });

  it('ignores everything it was not given', () => {
    for (const key of ['a', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', '/']) {
      expect(deckKey(press(key), null), key).toBe(null);
    }
  });

  /*
   * AND IT ASKS THE SAME QUESTION FIRST. An arrow typed into a
   * caption moves a cursor; an arrow on the layout row changes the
   * layout; an arrow with a confirmation open belongs to the
   * dialog. None of the three advances a slide.
   */
  it('advances nothing while somebody is typing', () => {
    expect(deckKey(press('ArrowRight'), focused('TEXTAREA'))).toBe(null);
    expect(deckKey(press('ArrowRight'), focused('BUTTON', { own: true })))
      .toBe(null);
    expect(deckKey(press('ArrowRight'), focused('BUTTON'))).toBe('next');
  });

  it('leaves a modified arrow to the browser', () => {
    expect(deckKey(press('ArrowRight', { metaKey: true }), null)).toBe(null);
    expect(deckKey(press('PageDown', { ctrlKey: true }), null)).toBe(null);
  });
});
