/**
 * Three rooms, one frame, three identities.
 *   [D-19, D-24, U-19; rooms.ts, MASTER-EDIT §11]
 *
 * *"BalanceVid now has three production rooms, while only one has a true
 * room entrance."* And: *"They shouldn't merely be three copies of the
 * same shell."*
 *
 * Both halves are load-bearing and they pull against each other, so both
 * are held here: nothing that must be the same may diverge, and nothing
 * that must differ may be flattened.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOMS, roomFor } from '../../src/domain/rooms.js';
import { ALL_STUDIOS, STUDIOS } from '../../src/domain/account.js';
import { studioForPath } from '../../src/auth/policy.js';

const ROOT = join(import.meta.dirname, '..', '..');

function code(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/[^\n]*/gm, '');
}

describe('every studio is a room you can walk into', () => {
  /*
   * THE TABLE IS COMPLETE AGAINST THE ACCOUNT MODEL, which is the one
   * assertion that catches a fourth studio being sold before it has
   * anywhere to be. `roomFor` throws on a missing room precisely so
   * that this failure is loud rather than a blank card.
   */
  it('has a room for every studio an account can own', () => {
    for (const id of ALL_STUDIOS) expect(() => roomFor(id)).not.toThrow();
    expect(ROOMS).toHaveLength(ALL_STUDIOS.length);
  });

  /*
   * AND THE NAME IS THE ONE THE STUDIO IS SOLD UNDER. `account.ts` names
   * the studios as things that can be bought separately; a room that
   * called itself something else would mean the rail and the invoice
   * disagreed.
   */
  it.each(ROOMS)('$id is called what its entitlement is called', (room) => {
    expect(room.tab).toBe(STUDIOS[room.id].label);
    expect(room.label).toBe(STUDIOS[room.id].label.toUpperCase());
  });

  it.each(ROOMS)('$label has a page at $href', ({ href }) => {
    const file = join(ROOT, 'app', href.replace(/^\//, ''), 'page.tsx');
    expect(existsSync(file), file).toBe(true);
  });

  /*
   * AND EACH ROOM IS BEHIND ITS OWN STUDIO'S ENTITLEMENT. All three
   * prefixes were written `^/x/` with a trailing slash, so none of them
   * covered the room itself — a gap that could not be noticed while the
   * rooms did not exist.
   */
  it.each(ROOMS)('$href is behind $id', ({ href, id }) => {
    expect(studioForPath(href)).toBe(id);
  });

  /*
   * `/take` IS NOT `/t`. The consumer application is a public page and
   * the control room is not, and a prefix rule that matched on `/t`
   * alone would have put the Take App behind an entitlement — locking
   * out exactly the people it exists for, who have no account at all.
   */
  it('does not swallow the Take App', () => {
    expect(studioForPath('/take')).toBeNull();
    expect(studioForPath('/take/abc.def')).toBeNull();
  });
});

describe('the rooms do not merely repeat each other', () => {
  it('gives each room a different shape of work', () => {
    const stages = ROOMS.map((one) => one.stages.join(' '));
    expect(new Set(stages).size).toBe(ROOMS.length);
  });

  /*
   * THE AUTHOR'S OWN THREE, KEPT WORD FOR WORD. They are the one line
   * that says what kind of production happens in a room, and a
   * paraphrase of them is a different claim about the product.
   */
  it('keeps the three the author wrote', () => {
    expect(roomFor('studio-one').stages).toEqual(['SOURCE', 'RESPONSE']);
    expect(roomFor('studio-two').stages).toEqual(['TAKES', 'TIMELINE', 'MASTER']);
    expect(roomFor('online-tv').stages).toEqual(['PROGRAMME', 'PLAYOUT', 'LIVE']);
  });

  /*
   * A CONTROL ROOM IS OPENED, A STUDIO IS ENTERED. The author drew that
   * distinction and it is a real one: a studio is somewhere you go to
   * make something, and a control room is already running whether or
   * not anybody is standing in it.
   */
  it('opens the control room and enters the studios', () => {
    expect(roomFor('studio-one').enter).toBe('Enter Studio');
    expect(roomFor('studio-two').enter).toBe('Enter Studio');
    expect(roomFor('online-tv').enter).toBe('Open Control');
  });

  it('says something different in each room', () => {
    expect(new Set(ROOMS.map((one) => one.says)).size).toBe(ROOMS.length);
  });
});

describe('the frame is shared, and so is what it is called', () => {
  /*
   * ONE FRAME. Studio One invented this layout for itself; writing it
   * twice more is how three shells come to have three back links in
   * three places.
   */
  it.each(ROOMS)('$label stands in the shared frame', ({ href }) => {
    const page = code('app', href.replace(/^\//, ''), 'page.tsx');
    expect(page).toContain("from '../Room.js'");
    expect(page).toMatch(/<Room room=\{roomFor\('[a-z-]+'\)\}/);
  });

  /*
   * AND ONE FRAME MEANS ONE `.shell-scroll`, one back link, one
   * heading size. If a room ever needs its own, that is a decision to
   * argue for rather than one to arrive at by copying.
   */
  it('lets no room draw its own frame', () => {
    for (const room of ROOMS) {
      const page = code('app', room.href.replace(/^\//, ''), 'page.tsx');
      expect(page, room.href).not.toContain('shell-scroll');
      expect(page, room.href).not.toContain('back-home');
    }
  });

  /*
   * A ROOM'S NAME IS NOT WRITTEN IN THE COMPONENT THAT DRAWS ONE OF ITS
   * FOUR APPEARANCES. The card, the rail, the room and the empty state
   * all read `rooms.ts`.
   */
  it('takes the card’s words from the room and not from the card', () => {
    const workspace = code('app', 'Workspace.tsx');
    expect(workspace).toContain('roomFor(studio.id)');
    expect(workspace).toContain('{room.enter}');
    expect(workspace).not.toContain("'Conversation Studio'");
    expect(workspace).not.toContain("label: 'STUDIO ONE'");
  });
});

describe('a missing picture is never a broken one', () => {
  /*
   * `Still` WAS INSIDE `Workspace.tsx` AND THE ROOMS DID NOT GET IT. The
   * first browser run of the performance room showed the browser's
   * broken-image glyph down the whole list, because `RoomList` had
   * written a plain `<img>` — the exact fault `Still` exists to prevent,
   * reintroduced in a second file.
   */
  it('draws every poster through the one component that can fail well', () => {
    expect(existsSync(join(ROOT, 'app', 'Still.tsx'))).toBe(true);
    const list = code('app', 'Room.tsx');
    expect(list).toContain('<Still src={one.poster} />');
    expect(list).not.toMatch(/<img[^>]*src=\{one\.poster\}/);
  });

  it('leaves no second copy of it in the workspace', () => {
    expect(code('app', 'Workspace.tsx')).toContain("from './Still.js'");
    expect(code('app', 'Workspace.tsx')).not.toContain('function Still(');
  });

  /*
   * AND A LIST WHOSE ROWS CANNOT HAVE A PICTURE DOES NOT KEEP A COLUMN
   * FOR ONE. A channel is a schedule, not a thing with a first frame.
   */
  it('drops the picture column when nothing in a list has one', () => {
    expect(code('app', 'Room.tsx'))
      .toContain('rows.some((one) => one.poster !== null)');
  });
});

describe('the hallway holds no intake', () => {
  /*
   * THE HOME PAGE PASSED THREE FORMS INTO THE WORKSPACE AND THE
   * WORKSPACE UNFOLDED THEM INSIDE CARDS. That is what made the cards
   * promise rooms they were not: pressing one filled in a form where
   * you stood.
   */
  it('passes no starter into the workspace', () => {
    expect(code('app', 'page.tsx')).not.toContain('starters');
    expect(code('app', 'Workspace.tsx')).not.toContain('starters');
  });

  it('keeps no expander state', () => {
    const workspace = code('app', 'Workspace.tsx');
    expect(workspace).not.toContain('setOpened');
    expect(workspace).not.toContain('aria-expanded');
  });

  /*
   * AND EACH INTAKE IS IN ITS OWN ROOM — asserted by name, because
   * "the form is not on the home page" is also true of a form that was
   * deleted.
   */
  it.each([
    ['/c', 'StartConversation'],
    ['/p', 'StartPerformance'],
    ['/t', 'StartChannel'],
  ])('%s holds %s', (href, starter) => {
    expect(code('app', href.replace(/^\//, ''), 'page.tsx')).toContain(`<${starter} />`);
  });

  /*
   * EVERY QUICK ACTION NAVIGATES. Two of the five opened a form on the
   * page instead, which is the same fault in a smaller control.
   */
  it('leaves no quick action that unfolds something', () => {
    expect(code('app', 'Workspace.tsx')).not.toContain('onSelect');
  });
});
