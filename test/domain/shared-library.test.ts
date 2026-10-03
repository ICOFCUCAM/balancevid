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
/*
 * WITHOUT THE PROSE, and this file needed it twice before it
 * passed. `\bwindow\b` caught `align.ts`'s own CORRELATION SEARCH
 * WINDOW; `48000` and `/app/` caught the comments in the desktop
 * shell that EXPLAIN why neither should be there. A source-text
 * test that reads comments is a test of the prose, and prose that
 * must not name the thing it is about is prose nobody can write.
 */
const code = (file: string) => read(file)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '')
  .replace(/^[ \t]*<!--[\s\S]*?-->/gm, '');

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
      const imports = [...code(file).matchAll(/from '([^']+)'/g)]
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
      const body = code(file);
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
      /* Comments are the point of these files; code is not. */
      const body = code(door).trim();
      expect(body, door).toBe(`export * from '${behind}';`);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  The boundary T-1 is judged on.
 * ------------------------------------------------------------------ */

const DESKTOP = [...under('desktop/src', '.ts'), ...under('desktop/app', '.html'),
  ...under('desktop/app', '.css')];

describe('the desktop application reaches nowhere into the web tier (T-1)', () => {
  /*
   * > *"No BalanceVid web-tier code in the desktop application."*
   *
   * They are two programs. One is a Next server with a filesystem
   * full of somebody's media; the other is a capture station that
   * runs on a laptop in a room. The only code they share is in
   * `shared/`, and the way that stops being true is one import
   * that looked convenient.
   */
  it('imports only itself, the shared library and its own runtime', () => {
    const allowed = /^(\.\/|\.\.\/(?!\.\.\/(src|app)\/)|electron$|node:)/;
    for (const file of DESKTOP.filter((name) => name.endsWith('.ts'))) {
      const imports = [...code(file).matchAll(/from '([^']+)'/g)]
        .map((hit) => hit[1]!);
      for (const where of imports) {
        expect(allowed.test(where), `${file} imports ${where}`).toBe(true);
        expect(where.includes('/src/domain/'), `${file} imports ${where}`)
          .toBe(false);
        expect(where.includes('/app/'), `${file} imports ${where}`).toBe(false);
      }
    }
  });

  /* And it reaches the shared library by the real path, so the
     bundler resolves one file rather than two. */
  it('reaches the shared library, and that is how it knows the rates', () => {
    const shell = code('desktop/src/shell.ts');
    expect(shell).toMatch(/from '\.\.\/\.\.\/shared\/src\/time\.js'/);
    /* Typed here, the window would still read 48000 with the door
       filled in, and the test would be the only thing that knew. */
    expect(shell).not.toMatch(/48[_ ]?000|\b48000\b/);
    expect(shell).not.toMatch(/\bHOUSE_FPS\s*=/);
  });

  /*
   * NOR THE INSTALLATION'S STYLESHEET. `globals.css` and
   * `tokens.css` are the web tier too, and a capture station that
   * `@import`ed them would be a capture station that breaks when
   * somebody renames a token in a Next application.
   */
  it('brings its own ground rather than the installation\'s', () => {
    for (const file of DESKTOP.filter((name) => !name.endsWith('.ts'))) {
      expect(code(file), file).not.toMatch(/globals\.css|tokens\.css|\/app\//);
    }
  });

  /*
   * AND THE RENDERER IS A WEB PAGE. Node off, isolation on,
   * sandbox on — the three settings that decide whether an
   * Electron window is a browser tab or a shell with a filesystem
   * in it. T-4 will want the disk and will open one named
   * function for it; this is the assertion that notices if
   * something opens it earlier and wider.
   */
  it('gives the window no Node and no way out', () => {
    const main = code('desktop/src/main.ts');
    for (const [setting, value] of [
      ['nodeIntegration', 'false'], ['contextIsolation', 'true'],
      ['sandbox', 'true'], ['webSecurity', 'true'],
    ] as const) {
      expect(main, setting).toMatch(new RegExp(`${setting}:\\s*${value}`));
    }
    expect(main).toMatch(/setWindowOpenHandler/);
    expect(main).toMatch(/will-navigate/);
  });

  /*
   * THE FLOW IS FROZEN AND THE BUILD SAYS WHERE IT IS. A release
   * that lights a step it has not built is a release that lies to
   * the person who installed it, so `BUILT_TO` is one constant and
   * the stage that earns a step moves it.
   */
  it('names the six steps and claims only what is built', () => {
    const shell = code('desktop/src/shell.ts');
    for (const step of ['CONNECT', 'CAMERAS', 'PREPARE', 'RECORD',
      'REVIEW', 'SUBMIT']) {
      expect(shell, step).toContain(`'${step}'`);
    }
    expect(shell).toMatch(/BUILT_TO: Step = 'CONNECT'/);
  });

  /* Nothing in T-1 opens a socket: everything through T-4 records
     to this machine's own disk. [brief] */
  it('opens no socket, because nothing before T-5 needs one', () => {
    for (const file of DESKTOP.filter((name) => name.endsWith('.ts'))) {
      const body = code(file);
      for (const network of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/,
        /node:http/, /node:net/]) {
        expect(network.test(body), `${file} uses ${network}`).toBe(false);
      }
    }
  });
});
