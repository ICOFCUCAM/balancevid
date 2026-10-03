/**
 * The arithmetic both pieces of software depend on.
 *   [Doctrine D-19, U-08; TAKE-DESKTOP T-1]
 *
 * > *"`align.ts` and `time.ts` are depended on, not pasted. Two
 * > copies of alignment arithmetic is two answers."*
 *
 * That rule is in the document's *what must not happen* list, and
 * a rule in a list is a rule nobody checks. This is the check.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const under = (dir: string, ext: string) =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(ext))
    .map((name) => join(dir, name));

const SHARED = under('shared/src', '.ts');

describe('what is in the shared library (T-1)', () => {
  it('is the pair the desktop application was promised', () => {
    expect(SHARED.sort()).toEqual([
      join('shared/src', 'align.ts'),
      join('shared/src', 'time.ts'),
    ]);
  });

  /*
   * IT REACHES NOWHERE. `time.ts` imports nothing at all and
   * `align.ts` imports `time.ts`; that is the whole dependency
   * graph. The moment a file here imports from `../../src/`, the
   * desktop application is depending on the web tier through the
   * back door — which is the thing T-1 is judged on.
   */
  it('imports nothing outside itself', () => {
    for (const file of SHARED) {
      const imports = [...read(file).matchAll(/from '([^']+)'/g)]
        .map((hit) => hit[1]!);
      for (const where of imports) {
        expect(where.startsWith('./'), `${file} imports ${where}`).toBe(true);
      }
    }
  });

  /*
   * AND TOUCHES NOTHING. Arithmetic over numbers: no filesystem,
   * no network, no clock of its own, no DOM, no React. A desktop
   * application and a Next server are two very different hosts,
   * and the only code that can live in both is code that assumes
   * neither.
   */
  it('assumes neither host', () => {
    for (const file of SHARED) {
      /*
       * COMMENTS STRIPPED, AND THE PATTERNS NAME A REFERENCE
       * RATHER THAN A WORD. This asserted `\bwindow\b` first and
       * caught `align.ts`'s own `const window` — the CORRELATION
       * SEARCH WINDOW, which is the domain's word for the span it
       * looks across and has nothing to do with a browser. A test
       * that cannot tell a variable from a global would have cost
       * this file its clearest name.
       */
      const body = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');
      for (const forbidden of [
        /\bnode:/, /\brequire\(/, /\bprocess\./, /\bglobalThis\b/,
        /\bwindow\s*\./, /\btypeof window\b/,
        /\bdocument\s*\./, /\bfetch\(/, /\bDate\.now\(/, /from 'react/,
      ]) {
        expect(forbidden.test(body), `${file} uses ${forbidden}`).toBe(false);
      }
    }
  });
});

describe('there is exactly one copy of it (T-1)', () => {
  /*
   * THE DOORS ARE DOORS AND NOT A SECOND IMPLEMENTATION. A
   * hundred and twenty-one files import `src/domain/time.js`, so
   * the path stays and what is behind it moved — and the risk of
   * that arrangement is precisely that somebody fills a door back
   * in. These two constants are the tell: they are declared in
   * the shared library, and anything under `src/` that declares
   * one again is a second answer.
   */
  it('declares the house rates in one place', () => {
    const declarations = (name: string) =>
      [...SHARED, ...under('src', '.ts'), ...under('app', '.ts'),
        ...under('app', '.tsx')]
        .filter((file) => new RegExp(`export const ${name}\\s*[:=]`)
          .test(read(file)));
    expect(declarations('HOUSE_SAMPLE_RATE'))
      .toEqual([join('shared/src', 'time.ts')]);
    expect(declarations('HOUSE_FPS'))
      .toEqual([join('shared/src', 'time.ts')]);
  });

  it('keeps the doors to one line of code each', () => {
    for (const [door, behind] of [
      ['src/domain/time.ts', '../../shared/src/time.js'],
      ['src/domain/align.ts', '../../shared/src/align.js'],
    ] as const) {
      const body = read(door)
        /* Comments are the point of these files; code is not. */
        .replace(/\/\*[\s\S]*?\*\//g, '').trim();
      expect(body, door).toBe(`export * from '${behind}';`);
    }
  });
});
