/**
 * One menu, reached two ways.  [Doctrine D-04, D-19, U-19]
 *
 * THE DEFECT THIS LOCKS DOWN is the ordinary one: a Delete added to a
 * row's `⋯` menu and not to its right-click, six months apart, by two
 * people who did not know the other menu existed. Before this, four
 * surfaces each had their own `<details>` pretending to be a menu, and
 * adding right-click to each separately would have made eight.
 *
 * So the rule is structural rather than cosmetic: a surface declares what
 * can be done to a row ONCE, as data, and the shared component draws it
 * for both the button and the pointer. These tests assert the parts of
 * that which are easy to undo by hand.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const MENU = readFileSync(join(ROOT, 'app', 'Menu.tsx'), 'utf8');

function components(dir = join(ROOT, 'app')): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...components(full));
    else if (/\.tsx$/.test(entry.name)) found.push(full);
  }
  return found;
}

const code = (file: string) => readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const named = (file: string) => file.slice(file.indexOf('app/'));

describe('the shared menu', () => {
  /*
   * THE BROWSER'S MENU WINS INSIDE A FIELD AND OVER A SELECTION, and
   * this is the one rule a context menu gets wrong that people actually
   * notice: right-clicking a text box to paste, and getting an
   * application menu with no Paste in it. There is no way to give it
   * back once `preventDefault` has run.
   */
  it('leaves a field and a selection to the browser', () => {
    expect(MENU).toMatch(/input, textarea, select, \[contenteditable="true"\]/);
    expect(MENU).toMatch(/getSelection\(\)/);
    expect(MENU).toMatch(/isCollapsed/);
    /*
     * AND ACTUALLY ASKS. The first draft of this test checked only that
     * the rule was written down somewhere in the file, which a `theirs`
     * function nobody calls satisfies perfectly.
     */
    const handler = MENU.slice(MENU.indexOf('onContextMenu: (event'));
    const asks = handler.indexOf('if (theirs(event)) return;');
    const prevents = handler.indexOf('event.preventDefault()');
    expect(asks, 'the right-click handler never asks whose menu this is')
      .toBeGreaterThan(-1);
    expect(prevents, 'it takes the browser\u2019s menu before asking')
      .toBeGreaterThan(asks);
  });

  /* Escape, an outside press, a scroll and a resize all mean no. */
  it.each(['Escape', 'pointerdown', 'scroll', 'resize'])(
    'closes on %s', (signal) => {
      expect(MENU).toContain(signal);
    });

  /*
   * A MENU THAT KEEPS FOCUS AFTER IT CLOSES loses somebody's place in the
   * page — they press Escape and the next Tab starts from the top.
   */
  it('gives focus back to whatever opened it', () => {
    expect(MENU).toMatch(/returnTo\.current\?\.focus\(\)/);
  });

  it('is a menu to a screen reader, not a list of buttons', () => {
    expect(MENU).toMatch(/role="menu"/);
    expect(MENU).toMatch(/role="menuitem"/);
    expect(MENU).toMatch(/aria-haspopup="menu"/);
    expect(MENU).toMatch(/aria-label=\{`Actions for/);
  });

  /* Arrow keys, or it is a list of buttons that says it is a menu. */
  it.each(['ArrowDown', 'ArrowUp', 'Home', 'End'])(
    'moves on %s', (key) => {
      expect(MENU).toContain(key);
    });

  /*
   * MEASURED BEFORE IT IS PAINTED. A menu raised near the right edge that
   * renders at the pointer and then jumps left has already been misread.
   */
  it('is placed before the browser paints it', () => {
    expect(MENU).toContain('useLayoutEffect');
    expect(MENU).toMatch(/visibility = 'visible'/);
  });

  /*
   * CLOSED BEFORE THE ACTION RUNS. Most of these raise a confirmation,
   * and a menu left open behind a modal is the bug the take menu had.
   */
  it('closes itself before running what was chosen', () => {
    const chose = MENU.slice(MENU.indexOf('const chose ='));
    const closes = chose.indexOf('close()');
    const runs = chose.indexOf('item.onSelect?.()');
    expect(closes).toBeGreaterThan(-1);
    expect(runs).toBeGreaterThan(closes);
  });
});

describe('every surface uses it', () => {
  /*
   * NO SECOND MENU SYSTEM. `<details>` is a disclosure widget: it
   * announces itself as one, has no arrow keys, and is what all four of
   * the old menus were built from. One `name`-grouped `<details>` per
   * rail is exactly the thing this replaced, so a new one is a
   * regression rather than a style preference. [D-19]
   */
  it('has no <details> pretending to be a menu', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const body = code(file);
      for (const [hit] of body.matchAll(/<details[^>]*name=["'][^"']*menu/gi)) {
        offenders.push(`${named(file)}: ${hit.trim()}`);
      }
      /* A summary whose whole content is the ⋯ character. */
      if (/<summary[^>]*>\s*&#8943;\s*<\/summary>/.test(body)) {
        offenders.push(`${named(file)}: a ⋯ summary`);
      }
    }
    expect(offenders, `a second menu system: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  /*
   * AND THE RIGHT-CLICK IS NEVER WIRED BY HAND. `onContextMenu` written
   * directly on a row is a menu that does not share the button's list,
   * which is the whole defect. The one place allowed to write it is the
   * component that owns the list.
   */
  it('wires the right-click in exactly one place', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      if (named(file) === 'app/Menu.tsx') continue;
      /* Passing the handler through as a prop type is not wiring it. */
      for (const [hit] of code(file).matchAll(/onContextMenu=\{[^}]/g)) {
        offenders.push(`${named(file)}: ${hit}`);
      }
    }
    expect(offenders, `a hand-rolled context menu: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  /*
   * THE THREE STUDIOS AND THE BUILDING ALL HAVE ONE. This is the check
   * that answers "did you actually go through all of them", and it names
   * the surface that was missed rather than failing abstractly.
   */
  it.each([
    ['app/Workspace.tsx', 'the building'],
    ['app/c/[id]/Studio.tsx', 'Studio One'],
    ['app/p/[id]/PerformanceStudio.tsx', 'Studio Two'],
    ['app/t/[id]/ChannelStudio.tsx', 'Online TV'],
  ])('%s (%s) raises the shared menu', (file) => {
    const body = code(join(ROOT, file));
    expect(body).toMatch(/from '\.{1,2}(\/\.\.)*\/Menu\.js'/);
    expect(body).toMatch(/useMenu\(\)|MenuHost/);
  });

  /*
   * AND NOBODY IS EXPECTED TO GUESS. A right-click that is not
   * advertised is a right-click nobody finds; one line at the foot of a
   * rail is how every file manager has done it since 1995.
   */
  it.each([
    'app/c/[id]/ClipRail.tsx',
    'app/p/[id]/PerformanceStudio.tsx',
    'app/t/[id]/ChannelStudio.tsx',
  ])('%s says so', (file) => {
    /* The JSX, not the import: an import is not a hint on the page. */
    expect(code(join(ROOT, file))).toContain('<RightClickHint');
  });
});

/**
 * THE SONG CAN BE DELETED FROM THE ROOM IT IS IN.  [STUDIO-TWO §3]
 *
 * Studio Two is one song and the takes performed over it. Until now the
 * only way to remove a song uploaded by mistake — which is the commonest
 * mistake in that room — was to leave the studio, find the card on the
 * home page and delete the whole performance from there.
 */
describe('the song in Studio Two', () => {
  const STUDIO = readFileSync(
    join(ROOT, 'app', 'p', '[id]', 'PerformanceStudio.tsx'), 'utf8');

  it('can be deleted from the studio', () => {
    expect(STUDIO).toMatch(/askDeleteSong/);
    expect(STUDIO).toMatch(/method: 'DELETE'/);
  });

  it('can be renamed, which is the other half of owning it', () => {
    expect(STUDIO).toMatch(/action: 'rename', title: next/);
  });

  /*
   * AND IT SAYS WHAT GOES WITH IT. "Delete the song" reads as far
   * smaller than it is when nine takes have been recorded over it, so
   * the count is in the question.
   */
  it('names the takes that go with it', () => {
    const ask = STUDIO.slice(STUDIO.indexOf('const askDeleteSong'),
      STUDIO.indexOf('const deleteSong'));
    expect(ask).toMatch(/takes\b/);
    expect(ask).toMatch(/cannot be undone/);
    expect(ask).toMatch(/verb: 'Delete the song'/);
    expect(ask).toMatch(/danger: true/);
  });
});
