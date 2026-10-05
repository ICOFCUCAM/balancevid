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

import { OPENS_ON, STEPS } from '../../desktop/src/shell.js';

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
  /*
   * NAMED, RATHER THAN COUNTED. The list grows — T-1 moved the
   * clocks and the alignment, T-2 added the connection model —
   * and a test that only counted would let the fourth file in
   * without anybody deciding it belonged. Adding a name here is
   * the decision.
   */
  it('is what two programs actually have to agree about', () => {
    expect(SHARED.sort()).toEqual([
      join('shared/src', 'align.ts'),
      join('shared/src', 'capture.ts'),
      join('shared/src', 'connections.ts'),
      /*
       * THE SHORT CREDENTIAL, ADDED FOR THE CAPTURE STATION'S
       * CONNECT. The installation mints ten letters and prints
       * them; the station recognises one in its box and spends
       * it. Two opinions about the alphabet, the length or
       * where the dash goes is a code a producer reads out and
       * an operator cannot type. [T-2, D-19]
       */
      join('shared/src', 'pairing.ts'),
      join('shared/src', 'prepare.ts'),
      join('shared/src', 'sourceGrid.ts'),
      /*
       * THE PROTOCOL ITSELF, ADDED AT T-5. Two programs now post
       * a capture to the same route — the browser Take App and
       * the desktop capture station — and a URL spelled out at
       * each end is a URL that disagrees with itself the first
       * time either changes. [D-19]
       */
      join('shared/src', 'submit.ts'),
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
      ['src/domain/pairing.ts', '../../shared/src/pairing.js'],
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
    for (const step of ['CAMERAS', 'PREPARE', 'RECORD', 'REVIEW', 'CONNECT',
      'SUBMIT']) {
      expect(shell, step).toContain(`'${step}'`);
    }
    /*
     * AND CONNECT IS NOT FIRST, WHICH IS A CLAIM WORTH PINNING.
     *
     * > *"only connect when decided. putting connect into the
     * > door to the software is problematic"*
     *
     * Every step was always pressable and none was ever gated —
     * but a strip that reads left to right and opens on CONNECT
     * tells an operator they must find a studio before they may
     * point a camera at anything, which in a hall twenty
     * minutes before a service is the application refusing to
     * do the one thing it is for. A capture station records to
     * its own disk and sends afterwards; the step that needs a
     * studio is SUBMIT, and CONNECT sits immediately before it.
     */
    expect(STEPS[0]).toBe('CAMERAS');
    expect(STEPS.indexOf('CONNECT')).toBe(STEPS.indexOf('SUBMIT') - 1);
    expect(OPENS_ON).toBe('CAMERAS');
    /*
     * T-1 shipped with CONNECT named next; T-2 built CONNECT,
     * T-3 built CAMERAS and PREPARE together, T-4 built RECORD,
     * and T-5 built the last two. One constant, and the stage
     * that earns a step moves it.
     *
     * `null` IS THE SIXTH VALUE AND NOT THE ABSENCE OF ONE. The
     * flow is frozen at six steps and this build has all six;
     * the constant stays because T-6 adds sources rather than
     * steps, and the next stage to leave one unbuilt needs it
     * back.
     */
    expect(shell).toMatch(/BUILT_TO: Step \| null = null/);
    /* And nothing is greyed out by a strip that has nothing left
       to grey: every step answers for a screen. */
    const renderer = code('desktop/src/renderer.ts');
    for (const screen of ['connectScreen', 'camerasScreen', 'reviewScreen']) {
      expect(renderer, screen).toContain(screen);
    }
  });

  /*
   * THE WEB TIER'S TYPECHECK NEVER REACHES ELECTRON.  [T-5]
   *
   * FOUND BY CI, WHICH IS THE ONLY PLACE IT COULD BE. The root
   * `tsconfig.json` includes `test/**`, the repository root
   * installs no Electron — it is `desktop/`'s dependency — and a
   * developer's machine has `desktop/node_modules` sitting right
   * there for Node to resolve. So the one import that crossed
   * typechecked locally and failed the moment a clean checkout
   * tried it:
   *
   *     desktop/src/recordings.ts(33,21): error TS2307:
   *     Cannot find module 'electron'
   *
   * A TEST MAY IMPORT A DESKTOP FILE — `check.ts` and `submit.ts`
   * are pure and two suites depend on them, which is the point of
   * their being pure. What it may not import is a file that
   * reaches the machine. The rule is not "do not import from
   * `desktop/`"; it is that the half of the desktop application
   * which touches Electron is the main process's, and the main
   * process is not something the web tier compiles.
   */
  it('keeps Electron out of what the web tier compiles', () => {
    const bound = DESKTOP
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /from 'electron'/.test(code(file)))
      .map((file) => file.replace(/\\/g, '/'));
    /* The main process, the preload and the two stores. */
    expect(bound.sort()).toEqual([
      'desktop/src/main.ts',
      'desktop/src/preload.ts',
      'desktop/src/recordings.ts',
      'desktop/src/store.ts',
    ]);

    /*
     * Nothing the root tsconfig compiles may reach one, directly
     * or through a desktop file it does import.
     */
    const reaches = new Map<string, string[]>();
    for (const file of DESKTOP.filter((one) => one.endsWith('.ts'))) {
      reaches.set(file.replace(/\\/g, '/'),
        [...code(file).matchAll(/from '(\.\/[^']+)'/g)]
          .map((hit) => `desktop/src/${hit[1]!.slice(2).replace(/\.js$/, '.ts')}`));
    }
    const taints = (file: string, seen = new Set<string>()): boolean => {
      if (seen.has(file)) return false;
      seen.add(file);
      if (bound.includes(file)) return true;
      return (reaches.get(file) ?? []).some((next) => taints(next, seen));
    };

    const compiled = [...under('test', '.ts'), ...under('src', '.ts')];
    const crossings: string[] = [];
    for (const file of compiled) {
      for (const hit of code(file).matchAll(/from '[^']*desktop\/src\/([^']+)'/g)) {
        const target = `desktop/src/${hit[1]!.replace(/\.js$/, '.ts')}`;
        if (taints(target)) crossings.push(`${file} → ${target}`);
      }
    }
    expect(crossings,
      `the web tier compiles a file that needs Electron: ${crossings.join(', ')}`)
      .toEqual([]);
  });

  /*
   * THE CREDENTIAL NEVER CROSSES THE BRIDGE.  [T-5, D-21]
   *
   * A capture station holds a participation link — an origin
   * plus a secret — because it has to submit without a person
   * present. The renderer is a web page with four cameras
   * pointed at a room, and the one thing it must never be able
   * to read is the thing that authorises sending what they saw.
   *
   * SO IT GOES OUT AND DOES NOT COME BACK. `chooseCall` takes
   * what somebody typed; `call()` answers a name and an origin.
   * The sender reads the link in the main process, and the one
   * function that strips it is named and used everywhere a
   * record crosses.
   */
  it('hands the window a call by name and never by credential', () => {
    const preload = code('desktop/src/preload.ts');
    /* What comes back is the stripped shape, not the stored one. */
    expect(preload).toMatch(/call\(\): Promise<Seen \| null>/);
    expect(preload).toMatch(/export interface Seen \{ origin: string; name: string \}/);
    expect(preload).not.toMatch(/link: string[\s\S]{0,40}\}\s*\| null>/);

    const main = code('desktop/src/main.ts');
    /* Every answer about a call goes through the stripper. */
    expect(main).toMatch(/'take:call'[\s\S]{0,120}callSeen\(/);
    expect(main).toMatch(/'take:choose-call'[\s\S]{0,120}callSeen\(/);
    expect(main).toMatch(/'take:sending'[\s\S]{0,400}callSeen\(/);

    const store = code('desktop/src/store.ts');
    expect(store).toMatch(/export function callSeen\(/);
    expect(store).toMatch(/return call \? \{ origin: call\.origin, name: call\.name \} : null;/);
  });

  /*
   * AND THE WINDOW IS NOT ASKED FOR IT EITHER. A capture learns
   * where it is going when it BEGINS, from the main process,
   * which is also what stops an operator who re-points the
   * station on Tuesday from sending Monday's work to Tuesday's
   * studio. [T-5]
   */
  it('stamps a capture with its destination in the main process', () => {
    const main = code('desktop/src/main.ts');
    expect(main).toMatch(
      /'take:begin-capture'[\s\S]{0,900}readCall\(\)[\s\S]{0,120}writeSendingOf\(/);
    /* The renderer declares a capture by id and nothing else. */
    expect(code('desktop/src/record.ts'))
      .toMatch(/bridge\.beginCapture\(id, label, beganAt\)/);
  });

  /*
   * REVIEW PLAYS WHAT IS ON THIS MACHINE WITHOUT THE WINDOW
   * GAINING A FILESYSTEM. The scheme is answered by the main
   * process, out of the capture directory, and `connect-src`
   * stays 'none' — a `<video>` may play it, `fetch` may not
   * reach it. [T-5]
   */
  it('serves a capture to the window over a scheme, not a path', () => {
    const page = read('desktop/app/index.html');
    expect(page).toMatch(/media-src [^;]*take-capture:/);
    expect(page).toMatch(/connect-src 'none'/);
    /* And the scheme carries no path the renderer composed. */
    const review = code('desktop/src/reviewScreen.ts');
    expect(review).toMatch(/take-capture:\/\/capture\//);
    expect(review).not.toMatch(/file:\/\//);
    /* The id is in the PATH: a URL host is case-folded, and a
       capture id carries ISO 8601's uppercase T. */
    expect(review).toMatch(
      /take-capture:\/\/capture\/\$\{encodeURIComponent\(captureId\)\}/);
  });

  /*
   * THE WINDOW HAS NO NETWORK, AND T-2 DID NOT GIVE IT ONE.
   *
   * T-1 asserted that nothing anywhere in the application opened
   * a socket, which was true and is no longer: CONNECT has to
   * ask an installation what it offers. What replaced it is the
   * assertion that actually matters — the RENDERER still cannot
   * reach the network, and the main process can, to one address
   * that `asOrigin` approved.
   *
   * A capture station that could be made to fetch from anywhere
   * is a capture station in a room with cameras in it.
   */
  it('keeps the network in the main process and out of the window', () => {
    /*
     * EVERY FILE THE WINDOW LOADS, named rather than globbed:
     * adding one to this list is the moment somebody decides it
     * belongs in the renderer, and a glob would let the next one
     * in without that.
     */
    const renderers = ['desktop/src/renderer.ts', 'desktop/src/shell.ts',
      'desktop/src/connect.ts', 'desktop/src/connectScreen.ts',
      'desktop/src/cameras.ts', 'desktop/src/camerasScreen.ts',
      'desktop/src/levels.ts', 'desktop/src/record.ts',
      'desktop/src/check.ts'];
    for (const file of renderers) {
      const body = code(file);
      for (const network of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/,
        /node:/, /\brequire\(/]) {
        expect(network.test(body), `${file} uses ${network}`).toBe(false);
      }
    }
    /* And the page says so for itself. */
    expect(code('desktop/app/index.html')).toMatch(/connect-src 'none'/);
  });

  /*
   * AND THE ONE PLACE THAT DOES FETCH PARSES FIRST. Nothing a
   * person types reaches `fetch` as typed: it becomes an origin
   * by the same parser the browser Take App uses, and a string
   * that is not one never becomes a request.
   */
  it('fetches only an origin the shared parser approved', () => {
    const ask = code('desktop/src/ask.ts');
    expect(ask).toMatch(/const origin = asOrigin\(typed\);/);
    expect(ask).toMatch(/if \(!origin\) return null;/);
    /* The template is built from the parsed origin, never the
       string that came in. */
    expect(ask).toMatch(/fetch\(`\$\{origin\}\/api\/participate`/);
    expect(ask).not.toMatch(/fetch\(`?\$?\{?typed/);
    expect(ask).toMatch(/credentials: 'omit'/);
    /* An application that hangs on a fetch is broken; a page that
       does is merely closed. A self-hosted studio is often
       asleep. */
    expect(ask).toMatch(/AbortController/);
  });

  /*
   * THE BRIDGE IS FOUR NAMED QUESTIONS, which is what T-1 said
   * the stage needing the machine would open. A preload exposing
   * `ipcRenderer.invoke` would expose every channel the main
   * process will ever have, including the ones T-4 adds for
   * writing video to disk.
   */
  it('opens named questions rather than a channel', () => {
    const preload = code('desktop/src/preload.ts');
    for (const named of ['connections', 'remember', 'ask', 'openExternal',
      'machine', 'beginCapture', 'writeChunk', 'endCapture', 'captures']) {
      expect(preload, named).toMatch(new RegExp(`${named}:`));
    }
    expect(preload).toMatch(/contextBridge\.exposeInMainWorld\('take', bridge\)/);
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer\s*\)/);
  });

  /*
   * AND A LINK OPENS ONLY SOMEWHERE THIS APPLICATION WOULD HAVE
   * GONE ANYWAY. `shell.openExternal` hands a string to the
   * operating system, which will happily open `file:///` or a
   * registered application's own scheme.
   */
  it('refuses to open a link that is not http', () => {
    expect(code('desktop/src/main.ts'))
      .toMatch(/if \(typeof url !== 'string' \|\| !asOrigin\(url\)\) return false;/);
  });
});
