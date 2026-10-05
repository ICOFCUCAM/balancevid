/*
 * The build.  [TAKE-DESKTOP T-1]
 *
 * esbuild and nothing else. Two entry points — the main process
 * and the renderer — plus the files that are already what they
 * will be. A bundler with a configuration file would be a
 * decision taken before anything needs it; T-3 draws a live
 * multiview and is the stage with an opinion about tooling.
 *
 * THE SHARED LIBRARY IS BUNDLED IN, not copied beside. esbuild
 * follows `../../shared/src/time.js` and inlines what it finds,
 * which is what "depended on, not pasted" looks like at build
 * time: one source of the arithmetic, resolved afresh on every
 * build.
 */

import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const OUT = 'out';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

/* The main process runs in Node inside Electron: ESM, and
   `electron` itself stays external because the runtime provides
   it. */
await build({
  entryPoints: ['src/main.ts'],
  outfile: `${OUT}/main.js`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
});

/*
 * THE PRELOAD IS COMMONJS AND THAT IS NOT A STYLE CHOICE. A
 * sandboxed renderer's preload is loaded by Electron outside the
 * module system — `import` does not exist there — so an ESM
 * preload silently fails to run and the window comes up with no
 * bridge and no error worth reading. `.cjs` so the extension says
 * so to anybody who opens `out/`.
 */
await build({
  entryPoints: ['src/preload.ts'],
  outfile: `${OUT}/preload.cjs`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
});

/* The renderer is a web page in a sandboxed window: no Node, and
   nothing external to leave out. */
await build({
  entryPoints: ['src/renderer.ts'],
  outfile: `${OUT}/renderer.js`,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
});

await cp('app', OUT, { recursive: true });

/*
 * THE ICON, WHICH THE INSTALLER WANTED AND NOBODY HAD GIVEN IT.
 *   [T-1; Doctrine D-19, D-21]
 *
 * Packaging the application printed one line and it was easy to
 * read past:
 *
 *   • default Electron icon is used  reason=application icon is not set
 *
 * So every build so far would have installed under Electron's own
 * logo — in the launcher, in the dock, in the window list and in
 * the `.deb`'s desktop entry. A capture station that looks like a
 * sample application is one somebody is not sure they installed.
 *
 * COPIED FROM THE ONE THE PRODUCT ALREADY HAS, not drawn again.
 * `public/take-app/icon-512.png` is the Take mark at the size
 * electron-builder asks for, and Take Desktop is the same product
 * on a different machine. A second PNG in this directory would be
 * the mark in two places, and the one nobody looks at is the one
 * that goes stale. [D-19]
 *
 * It is NOT a step towards sharing the web application's code with
 * this one: T-1 is about `app/styles` and the engines behind it,
 * and a picture is a picture.
 */
await mkdir('build', { recursive: true });
await cp('../public/take-app/icon-512.png', 'build/icon.png');

console.log('built');
