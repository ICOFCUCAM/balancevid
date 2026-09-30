/**
 * Every link goes somewhere.  [U-19; CHANNEL §16, MASTER-EDIT §11]
 *
 * THE FRONT DOORS ADDED FIVE FRAGMENT LINKS AND FOUR TARGETS FOR THEM.
 * `GO LIVE` and `SCHEDULE` on the control-room landing page, *"Manage
 * distribution →"*, *"View schedule →"* and the rail's own Channels and
 * Distribution all carried a `#fragment`, and only `#library` had an
 * element with that id. The other four did nothing at all: the page
 * loaded, the browser ignored the fragment, and somebody who pressed GO
 * LIVE arrived at the top of a control room where nothing had happened.
 *
 * NOTHING CAUGHT IT because nothing was wrong. Every route returned 200,
 * every test passed, the build was clean, and the product was quietly
 * teaching people that four of its buttons are broken. A link that goes
 * nowhere is the cheapest possible fault to introduce and one of the more
 * expensive to notice, so it is worth a rule.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', 'app');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/**
 * Code only. A fragment in a comment is a comment, and the line-comment
 * stripper is ANCHORED — unanchored it eats `https://` and takes the rest
 * of the line with it, which is how a test comes to pass on an empty
 * string. [design-system.test.ts learned this one]
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/[^\n]*/gm, '');
}

const files = sources(ROOT);
const all = files.map((path) => ({ path, text: code(path) }));

/**
 * Fragments this product navigates to, wherever they are written.
 *
 * Three shapes, because the codebase uses three: a plain `href="#x"`, a
 * template `href={`…#x`}`, and the rail's own `at('#x')` helper, which
 * builds `/#x` when it is not already at home.
 */
function fragmentsIn(text: string): string[] {
  const found = new Set<string>();
  for (const [, name] of text.matchAll(/href=["']#([a-z][a-z0-9-]*)["']/gi)) {
    found.add(name!);
  }
  for (const [, name] of text.matchAll(/href=\{`[^`]*#([a-z][a-z0-9-]*)`\}/gi)) {
    found.add(name!);
  }
  for (const [, name] of text.matchAll(/\bat\(\s*['"]#([a-z][a-z0-9-]*)['"]\s*\)/gi)) {
    found.add(name!);
  }
  return [...found];
}

const wanted = new Map<string, string[]>();
for (const { path, text } of all) {
  for (const name of fragmentsIn(text)) {
    wanted.set(name, [...(wanted.get(name) ?? []), path.slice(path.indexOf('app/'))]);
  }
}

const offered = new Set<string>();
for (const { text } of all) {
  for (const [, name] of text.matchAll(/\bid="([a-z][a-z0-9-]*)"/g)) offered.add(name!);
}

describe('fragment links', () => {
  it('finds the ones this product uses', () => {
    /* A guard on the guard: a regex that matched nothing would make
       every assertion below pass on an empty set. */
    expect(wanted.size).toBeGreaterThanOrEqual(5);
    expect([...wanted.keys()]).toContain('library');
    expect([...wanted.keys()]).toContain('schedules');
  });

  it('all point at an element that exists', () => {
    const dead = [...wanted]
      .filter(([name]) => !offered.has(name))
      .map(([name, where]) => `#${name} (from ${where.join(', ')})`);
    expect(dead, 'these links go nowhere').toEqual([]);
  });
});

describe('the building rail', () => {
  const rail = all.find((one) => one.path.endsWith('app/Rail.tsx'));

  it('is there', () => { expect(rail).toBeDefined(); });

  it('links the rooms by their own table rather than by hand', () => {
    /* Three rooms written out here is three places for a fourth studio
       to be forgotten. [D-19] */
    expect(rail!.text).toMatch(/ROOMS\s*\n?\s*\.?\s*filter|ROOMS\.filter|ROOMS\s*$/m);
    expect(rail!.text).not.toMatch(/href="\/c"/);
    expect(rail!.text).not.toMatch(/href="\/p"/);
    expect(rail!.text).not.toMatch(/href="\/t"/);
  });
});
