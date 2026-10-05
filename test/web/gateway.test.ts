/**
 * The public product gateway, held to what it claims.
 *   [TV-NETWORK N-1; Doctrine D-19, D-21, D-24, U-19]
 *
 * > *"keep `balancevid.com` → public BalanceVid/product gateway
 * > and `balancevid.com/app/...` → authenticated production
 * > environment."*
 *
 * FOUR THINGS CAN GO WRONG HERE AND ALL FOUR ARE SILENT.
 *
 *   1  The page is served and its stylesheet is not, because the
 *      sheet sits outside `app/styles/` by design and nothing
 *      made the route import it. The result is the whole brief
 *      as unstyled text, which looks like a build failure and is
 *      not one.
 *   2  A selector escapes `.bv-site` and reaches the control
 *      room, or the console's own `h2` reaches the headline.
 *      Both are invisible from this page.
 *   3  A background names a photograph that is not there. A
 *      full-bleed `background-image` that 404s is a black
 *      rectangle with no broken-image glyph to give it away —
 *      exactly how `/rooms/*.webp` were found, in a screenshot.
 *   4  A link points at a route this installation does not
 *      serve. [D-21]
 *
 * EVERY ASSERTION BELOW READS CODE WITH THE COMMENTS REMOVED.
 * This file is full of prose and so are the files it reads; a
 * test that matched a sentence in a comment would pass on the
 * explanation of the thing rather than the thing. [T-1]
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GATEWAY_PATH, isAssetPath, mayBePublic } from '../../src/auth/policy.js';

const ROOT = join(import.meta.dirname, '..', '..');
const GATEWAY = join(ROOT, 'app', 'gateway');

/** A file with its commentary taken out. */
function code(...where: string[]): string {
  return readFileSync(join(...where), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

const page = code(GATEWAY, 'page.tsx');
const atlas = code(GATEWAY, 'ProductAtlas.tsx');
const nav = code(GATEWAY, 'SiteNav.tsx');
const css = code(GATEWAY, 'gateway.css');
const everything = [page, atlas, nav].join('\n');

describe('the gateway answers at the root', () => {
  it('is reachable without a session, and only for reading', () => {
    expect(mayBePublic('/', 'GET')).toBe(true);
    expect(mayBePublic(GATEWAY_PATH, 'GET')).toBe(true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(mayBePublic('/', method), method).toBe(false);
      expect(mayBePublic(GATEWAY_PATH, method), method).toBe(false);
    }
  });

  /*
   * THE REWRITE AND THE PERMISSION ARE THE SAME STRING, and the
   * failure if they drift is the one nobody sees from inside: the
   * gate opens `/gateway` while middleware rewrites to somewhere
   * else, so every anonymous visitor is bounced to the sign-in
   * page and the owner, who has a session, never reproduces it.
   */
  it('is rewritten to by the one gate that knows about sessions', () => {
    const middleware = code(ROOT, 'middleware.ts');
    expect(middleware).toMatch(/pathname === '\/'/);
    /*
     * THE REWRITE IS NAMED WITH ITS TARGET, not looked for
     * loose. `NextResponse.rewrite` is already in this file for
     * the custom-host station, so asking only whether the word
     * appears is a test that passes on somebody else's line —
     * which is exactly what it did when the gateway branch was
     * mutated into a redirect.
     */
    expect(middleware).toMatch(/rewrite\(new URL\(GATEWAY_PATH/);
    /* A redirect would move the public address off `/`. */
    expect(middleware).not.toMatch(/redirect\([^)]*GATEWAY_PATH/);
  });

  it('is spelled once', () => {
    const written = [code(ROOT, 'middleware.ts'), code(ROOT, 'src', 'auth', 'policy.ts')]
      .join('\n')
      .split(GATEWAY_PATH).length - 1;
    /* The declaration itself, and nothing else literal. */
    expect(written, `'${GATEWAY_PATH}' written out ${written} times`).toBe(1);
  });
});

describe('the stylesheet', () => {
  /*
   * IT IS NOT IN `app/styles/`, AND THAT IS THE POINT. Every file
   * in that directory must be imported by `globals.css` — which
   * `design-system.test.ts` enforces — and this one must not be,
   * because `:root` here redeclares `--line` and `--muted`.
   */
  it('stays out of the directory that loads everywhere', () => {
    const shared = readdirSync(join(ROOT, 'app', 'styles'));
    expect(shared).not.toContain('gateway.css');
    expect(readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8'))
      .not.toContain('gateway.css');
  });

  it('is imported by the one route that owns it', () => {
    expect(page).toContain("import './gateway.css'");
  });

  /*
   * NOTHING ESCAPES `.bv-site`. Read as a list of selectors: each
   * one is either inside the page's root, or it is the document
   * rule that smooth scrolling has to be on, which names the root
   * through `:has()` so it cannot apply to any other page.
   */
  it('scopes every rule to the page it belongs to', () => {
    const loose: string[] = [];
    /*
     * THE `@media` PRELUDES COME OUT FIRST and the blocks they
     * opened are read as if they had never been nested, so the
     * rules inside a breakpoint are held to the same rule as the
     * rules outside one. The first version of this check left
     * them in, and read `}` as a selector.
     */
    const flat = css.replace(/@media[^{]*\{/g, '');
    for (const [, selector] of flat.matchAll(/([^{}]+)\{/g)) {
      for (const one of (selector ?? '').split(',')) {
        const trimmed = one.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('.bv-site')) continue;
        if (trimmed.startsWith('html:has(.bv-site)')) continue;
        loose.push(trimmed);
      }
    }
    expect(loose, `a rule that reaches the rest of the product: `
      + loose.join(' | ')).toEqual([]);
  });

  /* The brief answered this in a script, after first paint. [D-04] */
  it('answers a request for less motion in CSS', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('the photographs', () => {
  /** Every image this page asks a browser for. */
  function wanted(): string[] {
    const found = new Set<string>();
    for (const [, path] of css.matchAll(/url\(["']?(\/images\/[^"')]+)["']?\)/g)) {
      found.add(path!);
    }
    for (const [, path] of everything.matchAll(/url\('(\/images\/[^']+)'\)/g)) {
      found.add(path!);
    }
    for (const [, path] of everything.matchAll(/'(\/images\/[^']+)'/g)) {
      found.add(path!);
    }
    return [...found].sort();
  }

  it('are all on disk, under the names the page asks for', () => {
    const asked = wanted();
    /* Nine backgrounds and the card a shared link shows. */
    expect(asked.length).toBeGreaterThanOrEqual(10);
    const missing = asked.filter(
      (path) => !existsSync(join(ROOT, 'public', path)));
    expect(missing, `named but not shipped: ${missing.join(', ')}`).toEqual([]);
  });

  /*
   * AND A STRANGER MAY SEE THEM. The page is public, so a session
   * wall in front of its backgrounds is a product gateway made of
   * black rectangles — which is what `/tv` was, for the same
   * reason, until a screenshot showed it.
   */
  it('are reachable without a session', () => {
    for (const path of wanted()) {
      expect(isAssetPath(path), path).toBe(true);
    }
    /*
     * AND THE RULE DID NOT OPEN THE WHOLE OF `public/`. It is a
     * pattern over one directory and one list of picture
     * extensions, so a text file dropped in beside the
     * photographs is not served to strangers, and a page is not
     * an asset however it is spelled.
     */
    expect(isAssetPath('/images/notes.txt')).toBe(false);
    expect(isAssetPath('/images/')).toBe(false);
    expect(isAssetPath('/take/library')).toBe(false);
  });
});

describe('every link goes somewhere', () => {
  /** `href="…"` and `href: '…'`, both spellings the page uses. */
  function links(): string[] {
    const found = new Set<string>();
    for (const [, href] of everything.matchAll(/href=["']([^"'{]+)["']/g)) {
      found.add(href!);
    }
    for (const [, href] of everything.matchAll(/href:\s*'([^']+)'/g)) {
      found.add(href!);
    }
    return [...found];
  }

  /*
   * AN IN-PAGE LINK LANDS ON AN ELEMENT THAT EXISTS. Seven
   * navigation items, and a headline that moved section would
   * take one of them with it silently — the browser's answer to
   * an anchor with no target is to do nothing at all.
   */
  it('lands on a section that is on the page', () => {
    const ids = new Set(
      [...everything.matchAll(/id="([^"]+)"/g)].map(([, id]) => id!));
    const broken = links()
      .filter((href) => href.startsWith('#') && href !== '#')
      .filter((href) => !ids.has(href.slice(1)));
    expect(broken, `an anchor with no section: ${broken.join(', ')}`)
      .toEqual([]);
  });

  /*
   * AND A LINK OUT OF THE PAGE NAMES A ROUTE THIS INSTALLATION
   * SERVES. The gateway's whole job is to be the way in to the
   * four products; a front door onto a 404 is the one failure a
   * visitor reads as *this product is broken*. [D-21]
   */
  it('names a route this application actually has', () => {
    const missing = links()
      .filter((href) => href.startsWith('/'))
      .filter((href) => !existsSync(
        join(ROOT, 'app', href.replace(/^\//, ''), 'page.tsx')));
    expect(missing, `a link to a route that does not exist: `
      + missing.join(', ')).toEqual([]);
  });

  /*
   * THE FOUR PUBLIC WAYS IN ARE ALL OFFERED. A gateway that
   * reached only the sign-in page would be a splash screen.
   */
  it('offers the television network, Take, the campaigns and the door', () => {
    for (const route of ['/tv', '/take', '/go', '/signin']) {
      expect(links(), route).toContain(route);
    }
  });
});

describe('the brief, kept whole', () => {
  /*
   * NOTHING WAS SUMMARISED TO FIT. Each of the four products
   * lists eight capabilities, and a list silently cut to four
   * would still look deliberate on the page — which is why the
   * count is asserted rather than eyeballed.
   */
  it('lists all eight capabilities of all four products', () => {
    const lists = [...atlas.matchAll(/does:\s*\[([^\]]+)\]/g)]
      .map(([, items]) => items!.split(',').filter((one) => one.trim()).length);
    expect(lists.length, 'four products').toBe(4);
    for (const count of lists) expect(count).toBe(8);
  });

  it('compares cloud and self-hosted on all ten rows', () => {
    const rows = [...page.matchAll(/\{ of: '/g)].length;
    expect(rows).toBe(10);
  });

  /*
   * AND IT STILL REFUSES TO INVENT A NUMBER. This sentence is the
   * brief telling on itself, and it is the one piece of copy on
   * the page that must survive every future edit: four plan cards
   * with no limits on them is a decision, and without the
   * sentence it reads as an unfinished page somebody will helpfully
   * fill in. [D-21]
   */
  it('says why the plans carry no limits', () => {
    expect(page).toContain('does not');
    expect(page).toMatch(/invent storage, processing or\s+infrastructure limits/);
    expect(page).not.toMatch(/\d+\s?(GB|TB|hours per month)/);
  });

  /* The four steps, in the hero's spine and again in the strip. */
  it('names the four parts of the system twice, consistently', () => {
    for (const part of ['Studio One', 'Studio Two', 'Online TV', 'Take']) {
      expect(page, part).toContain(part);
    }
    expect(page).toContain('Create');
    expect(page).toContain('Produce');
    expect(page).toContain('Broadcast');
    expect(page).toContain('Participate');
  });
});
