/**
 * Where a keystroke belongs.  [Doctrine D-04, U-19, CHANNEL §5, C-39]
 *
 *     a key is pressed
 *          │
 *     is somebody typing into something?   →  it is theirs
 *     did they hold a modifier?            →  it is the browser's
 *     otherwise                            →  it is the page's
 *
 * ONE JUDGEMENT, WRITTEN ONCE. It was written three times, in two
 * studios, in two different strengths. The performance studio asked
 * it twice in one function and the conversation studio asked a
 * stronger version — one that also honours an element's own opt-out —
 * so the same markup was protected on one surface and not on the
 * other. A rule with two implementations is a rule with one bug in
 * it that nobody can see from either side.
 *
 * AND THE OPT-OUT WAS SET BY NOTHING. `data-keys="own"` was read by
 * the conversation studio and written by no component in the
 * product, which means no element had ever actually used it and the
 * weaker copies had never been noticed. That is the third capability
 * in as many stages that this product declared and did not reach.
 *
 * STRUCTURAL, NOT DOM. The parameters are the shape a key event and
 * a focused element have, so this is a pure function a test can call
 * with two object literals and a browser satisfies without being
 * asked. Nothing here touches the filesystem, the network, a clock
 * or `document`.
 */

/**
 * The attribute an element sets to keep its own keys.
 *
 * ON THE THING THAT CONTAINS THEM, because `closest` walks up: a
 * tablist marked once protects every button inside it, and a dialog
 * marked once protects everything it traps focus over.
 */
export const OWN_KEYS = 'data-keys="own"';
export const OWN_KEYS_SELECTOR = `[${OWN_KEYS}]`;

/** Enough of an element to decide whose key this is. */
export interface Focused {
  tagName: string;
  isContentEditable: boolean;
  closest(selectors: string): unknown;
}

/** Enough of a key event to decide the same. */
export interface Pressed {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Is this keystroke the focused element's own?
 *
 * A FIELD KEEPS ITS KEYS, which is the whole of it: a "3" meant for
 * a take's name must not cut to take three, and an arrow meant to
 * move a cursor must not advance a slide. That is a question about
 * where the keystroke WENT rather than about a mode the operator has
 * to remember being in.
 *
 * `isContentEditable` AND the opt-out catch what the tag test misses:
 * a rich editor is a `div`, and a row of buttons that drives itself
 * with arrows is a row of buttons. Neither is an `INPUT` and both
 * would otherwise lose their keys to the page.
 */
export function typingIn(target: Focused | null | undefined): boolean {
  if (!target) return false;
  if (/^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest(OWN_KEYS_SELECTOR));
}

/**
 * Does the PAGE get this keystroke?
 *
 * MODIFIER COMBINATIONS ARE LEFT ALONE, because Cmd-1 belongs to the
 * browser and a page that takes it is a page that breaks a tab
 * shortcut somebody has used for fifteen years. Shift is not a
 * modifier for this purpose — it selects a direction, not a command,
 * and Shift-Space is still a page key.
 */
export function pageTakes(
  event: Pressed, target: Focused | null | undefined,
): boolean {
  if (event.metaKey === true || event.ctrlKey === true
    || event.altKey === true) return false;
  return !typingIn(target);
}

/* ------------------------------------------------------------------------ *
 *  The keys a gallery runs on.  [CHANNEL §20, §5, C-39]
 * ------------------------------------------------------------------------ */

export type DeckKey = 'next' | 'back' | 'blank';

/**
 * What this key asks a deck to do, or nothing.
 *
 * PAGE DOWN AND PAGE UP BECAUSE A PRESENTER'S REMOTE IS A KEYBOARD.
 * Every clicker sold sends those two codes — that is the whole of
 * what the hardware is — so a product with arrow keys and no page
 * keys works for the operator at the desk and not for the person
 * standing up in front of the room. They cost one line each.
 *
 * AND A FULL STOP BLANKS IT, which is the key every presentation
 * tool in the world has used for thirty years. It is reversible by
 * the key beside it, which is why it is safe to give a key at all:
 * the irreversible things on this desk go through a dialog (C-37)
 * and none of them is here.
 *
 * SPACE IS DELIBERATELY ABSENT. It scrolls a page, it starts a
 * recording in the conversation studio, and a key that means three
 * things on three surfaces of one product is a key an operator
 * cannot trust. The clickers that send Space also send Page Down.
 */
export function deckKey(
  event: Pressed, target: Focused | null | undefined,
): DeckKey | null {
  if (!pageTakes(event, target)) return null;
  switch (event.key) {
    case 'ArrowRight': case 'PageDown': return 'next';
    case 'ArrowLeft': case 'PageUp': return 'back';
    case '.': return 'blank';
    default: return null;
  }
}
