/**
 * The three rooms, as photographs.  [D-24, D-19, U-19]
 *
 * THE CARD ART STOPPED BEING THE PERSON'S WORK AND STARTED BEING THE
 * ROOM, and that is the kind of change a later refactor undoes by
 * accident — a poster frame is the obvious thing to put in a band on a
 * card, and it was there for a year. What follows is not a snapshot of
 * the markup; it is the three things the decision consists of.
 *
 * AND ONE OF THEM IS A FILE ON DISK. A studio naming
 * `/rooms/conversation.webp` while `public/rooms/` holds nothing of the
 * sort is a broken image on the first screen of the product, which no
 * typecheck and no render test that stubs the network would catch.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const WORKSPACE = readFileSync(join(ROOT, 'app', 'Workspace.tsx'), 'utf8');

/** Code only: a path in a comment is documentation, not a reference. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/[^\n]*/gm, '');
}

const ROOMS = [
  { studio: 'one', art: 'conversation.webp', master: 'Conversational Studio.png' },
  { studio: 'two', art: 'performance.webp', master: 'Performance Studio.png' },
  { studio: 'tv', art: 'online-tv.webp', master: 'OnlineTV.png' },
];

describe('every studio card carries a photograph of its own room', () => {
  it.each(ROOMS)('studio $studio names $art', ({ art }) => {
    expect(code(WORKSPACE)).toContain(`art: '/rooms/${art}'`);
  });

  it.each(ROOMS)('$art is actually on disk', ({ art }) => {
    expect(existsSync(join(ROOT, 'public', 'rooms', art))).toBe(true);
  });

  /*
   * A DERIVATIVE WHOSE MASTER IS GONE CANNOT BE RE-CUT. The next person
   * who wants these at a different size, or a different crop, needs the
   * 1671x941 originals — and `scripts/room-art.mjs` reads them from
   * `art/`, so a master that moved breaks the only way to rebuild.
   */
  it.each(ROOMS)('$master is kept where the script reads it', ({ master }) => {
    expect(existsSync(join(ROOT, 'art', master))).toBe(true);
  });

  /*
   * AND THE MASTERS ARE NOT SERVED. They were uploaded into `public/`,
   * where every deploy carries six megabytes nothing asks for and
   * anybody can fetch two of them to look at a thumbnail.
   */
  it.each(ROOMS)('$master is not in public/', ({ master }) => {
    expect(existsSync(join(ROOT, 'public', master))).toBe(false);
  });

  /*
   * WHAT SHIPS IS SMALL. A band of a card is never taller than about
   * 130 CSS pixels; a hundred and fifty kilobytes of WebP is already
   * generous for it, and a PNG dropped in by hand would be ten times
   * that without anybody noticing until the home page felt slow.
   */
  it.each(ROOMS)('$art is under 150 kB', ({ art }) => {
    const size = statSync(join(ROOT, 'public', 'rooms', art)).size;
    expect(size, `${art} is ${Math.round(size / 1024)} kB`)
      .toBeLessThanOrEqual(150 * 1024);
  });
});

describe('the photographs are a set, and nothing sits on top of them', () => {
  /*
   * THE ROOM'S COLOUR IS WHAT MAKES THREE PHOTOGRAPHS ONE ROW. They were
   * shot in three places under three lights; the veil each is washed in
   * is the only thing that makes the row read as a family rather than as
   * three pictures somebody found. [studios.css]
   */
  it('washes each photograph in its own room colour', () => {
    expect(code(WORKSPACE))
      .toContain("position: 'absolute', inset: 0, background: studio.veil,");
  });

  /*
   * THE FADE IS ONE VALUE FOR ALL THREE. Written inline it would be
   * three values within a release.
   */
  it('fades into the card with the shared token', () => {
    expect(code(WORKSPACE)).toContain('var(--art-fade)');
    expect(readFileSync(join(ROOT, 'app', 'styles', 'studios.css'), 'utf8'))
      .toMatch(/--art-fade:\s*rgba\(/);
  });

  /*
   * NO GLYPH ON THE PICTURE. A dark disc holding the room's icon sat in
   * the corner of every card, which is a second name for a room whose
   * name is printed two lines below — and on a photograph it reads as a
   * sticker. The icon is still in the table, because the rail and the
   * rows use it; what must not come back is it being drawn over the art.
   */
  it('does not draw the studio glyph over the photograph', () => {
    const source = code(WORKSPACE);
    const from = source.indexOf("height: 132, position: 'relative'");
    /*
     * THE END IS SEARCHED FROM THE START AND NOT FROM THE TOP OF THE
     * FILE. The first version passed the label's own style string to a
     * bare `indexOf`, which found an identical line eight hundred lines
     * ABOVE the band — so `slice` ran backwards and returned `''`, and
     * `''` contains no `studio.icon`, so the test passed while looking
     * at nothing at all. It is written down because it is the second
     * time in this codebase a test has passed on an empty string.
     */
    const band = source.slice(from, source.indexOf('</div>', from));
    /*
     * THE SLICE HAS TO BE THE BAND. Two `indexOf` calls that stop
     * matching return an empty string, and `''` contains nothing at
     * all — a test that passes because it is looking at nothing is
     * the exact failure this one is here to prevent.
     */
    expect(band).toContain('src={studio.art}');
    expect(band).not.toContain('studio.icon');
  });

  /*
   * AND THE ICON IS STILL THERE TO BE USED, so the test above is about
   * placement and cannot be satisfied by deleting the field.
   */
  it.each([
    ['one', 'conversation'], ['two', 'music'], ['tv', 'broadcast'],
  ])('studio %s still keeps its %s glyph', (_studio, glyph) => {
    expect(code(WORKSPACE)).toContain(`icon: '${glyph}',`);
  });
});
