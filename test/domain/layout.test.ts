/**
 * Layout a media query can reach.  [D-04, D-19, D-24; DESIGN "the building"]
 *
 * THE HOME PAGE WAS UNUSABLE ON A PHONE AND THE CAUSE WAS NOT A MISSING
 * BREAKPOINT. The breakpoints existed. What they could not touch was
 * `gridTemplateColumns` written inline in `Workspace.tsx`, because an
 * inline style is not a stylesheet and a media query has nothing to say
 * about one.
 *
 * The same thing bit four times in a single change: the building's two
 * columns, the hero's two columns, the rail's `flex-direction`, and a
 * sublabel's `display`. Each time the rule was written, the build passed,
 * and nothing happened — which is the worst kind of failure, because it
 * looks like the rule is wrong rather than unreachable.
 *
 * SO THE RULE IS: AN INLINE LAYOUT MUST BE ONE THAT NEEDS NO HELP.
 * `repeat(auto-fit, minmax(…))` reflows on its own at any width and is
 * perfectly fine inline. A fixed column pair is not, and belongs in
 * `surfaces.css` where a breakpoint can reach it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const SURFACES = readFileSync(join(ROOT, 'app', 'styles', 'surfaces.css'), 'utf8');

/**
 * THE BUILDING AND THE ROOMS, AND NOT THE STUDIOS.
 *
 * `DESIGN.md` says, and has said since before any of this: *"No phone
 * layout. There is a floor for laptops and `pointer: coarse` gets larger
 * targets, but a broadcast desk is operated at a desk."* That decision
 * stands, and the deep studios are full of fixed inline grids that are
 * correct for a desk.
 *
 * What this test covers is what a person reaches BEFORE a studio — the
 * way in, the three doors, and what they have made — because that is
 * what was broken on a phone and what is now fixed. Widening it to the
 * studios would either fail on purpose or force a rule nobody has
 * decided to follow there.
 */
const BUILDING = [
  'app/Workspace.tsx', 'app/Room.tsx', 'app/page.tsx',
  'app/c/page.tsx', 'app/p/page.tsx', 'app/t/page.tsx',
  'app/StartConversation.tsx', 'app/StartPerformance.tsx',
  'app/StartChannel.tsx',
];

function components(): string[] {
  return BUILDING.map((one) => join(ROOT, one));
}

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/[^\n]*/gm, '');
}

describe('the building is laid out where a breakpoint can reach it', () => {
  it.each(['building', 'building-rail', 'building-rail-links', 'building-body',
    'building-columns', 'hero-grid'])('.%s is declared in CSS', (name) => {
    expect(SURFACES).toContain(`.${name} {`);
  });

  it('uses those classes rather than inline grids', () => {
    const workspace = code(join(ROOT, 'app', 'Workspace.tsx'));
    expect(workspace).toContain('className="building"');
    expect(workspace).toContain('className="building-columns"');
    expect(workspace).toContain('panel hero-grid');
    /* The two column pairs that used to be literals here. */
    expect(workspace).not.toContain('minmax(0, 236px)');
    expect(workspace).not.toContain('minmax(0, 306px)');
    expect(workspace).not.toContain('minmax(0, 232px)');
  });

  /*
   * THE TOKEN IS READ. `--rail-width` was set under a breakpoint and
   * read by nothing for as long as the breakpoints existed — the width
   * that shipped was a literal in another file. A token nobody reads is
   * a rule nobody is following, and it is worse than no token because
   * it reads as though something is being configured.
   */
  it('reads the rail width it sets', () => {
    expect(SURFACES).toMatch(/--rail-width:\s*\d+px/);
    expect(SURFACES).toContain('minmax(0, var(--rail-width))');
  });

  it('declares the three widths the building changes at', () => {
    for (const at of [1280, 1000, 760]) {
      expect(SURFACES, `no rule at ${at}px`)
        .toContain(`@media (max-width: ${at}px)`);
    }
  });
});

describe('an inline grid must need no help', () => {
  /*
   * A FIXED COLUMN PAIR INLINE IS A COLUMN PAIR NOTHING CAN RESTACK.
   * `auto-fit` and `auto-fill` reflow by themselves at any width, so
   * they are exempt — that is the whole distinction. So is a grid of
   * one column, which is already what a narrow screen wants.
   */
  it('has no inline grid that a media query would have to override', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      /*
       * A VARIABLE IS AN OFFENDER TOO, and this is why the pattern
       * matches the whole value rather than only a quoted one. The
       * room list computed `const columns = pictures ? … : …` and
       * passed it in — no string literal anywhere — so the first
       * version of this rule swept the building clean and left the
       * one grid that was actually still broken on a phone. A browser
       * run found it: five fixed columns left fifty pixels for the
       * title, and every row read "2 takes" with no name.
       */
      for (const found of code(file).matchAll(
        /gridTemplateColumns:\s*(?:`([^`]*)`|'([^']*)'|([A-Za-z_$][\w$.]*))/g)) {
        /*
         * EITHER QUOTE. The first version read group 1 only, so every
         * single-quoted grid in the product came back as an empty
         * string and was reported as an offender — twenty-three of
         * them, all false. A matcher with two alternatives has two
         * groups and exactly one of them is filled.
         */
        const said = found[1] ?? found[2] ?? found[3] ?? '';
        if (/auto-fit|auto-fill/.test(said)) continue;
        /* One column is already the narrow answer. */
        if (/^\s*(?:minmax\(0,\s*1fr\)|1fr)\s*$/.test(said)) continue;
        offenders.push(`${file.slice(file.indexOf('app/'))}: ${said}`);
      }
    }
    expect(offenders,
      'an inline grid no breakpoint can restack — move it to surfaces.css')
      .toEqual([]);
  });

  /*
   * AND THE PATTERN IS TESTED, because an "assert no offenders" test
   * whose regex matches nothing passes for ever while catching nothing.
   * This one already has a live subject: the studio cards use
   * `auto-fit`, so the matcher must find that and forgive it.
   */
  it('finds the inline grids it is forgiving', () => {
    const all = components()
      .flatMap((file) => [...code(file).matchAll(/gridTemplateColumns:/g)]);
    expect(all.length, 'no inline grids found at all — the matcher is broken')
      .toBeGreaterThan(0);
  });
});
