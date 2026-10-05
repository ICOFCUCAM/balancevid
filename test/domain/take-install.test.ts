/**
 * The Take App, as something a person can install.
 *   [TAKE-PLATFORM P1, P6; TAKE-APP T2c, T13a; D-04, D-19, D-21]
 *
 * THE FAULT THESE ANSWER was an application that could be installed
 * halfway through an assignment and not from its own front door.
 * Every part was built — icons at three sizes, a service worker with
 * background upload and retry, a shared install offer the television
 * network already uses — and the one file that declares them an app
 * was only ever composed per invitation, at
 * `/api/take/<link>/manifest`. So a performer sent a link could keep
 * the app; somebody who arrived to look around could not.
 *
 * WHAT A BROWSER ACTUALLY REQUIRES is three things together — a
 * manifest, icons it can find, and a service worker with a fetch
 * handler — and any one of them missing fails silently: no error, no
 * warning, just no install button, on a phone belonging to somebody
 * who will never report it. So all three are asserted here, as is
 * every path any of them names.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

import { isAssetPath, mayBePublic } from '../../src/auth/policy.js';
import { GROUND, INSTALLS } from '../../app/take/installs.js';

const MANIFEST_PATH = 'public/take-app/manifest.json';
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  name: string; short_name: string; start_url: string; scope: string;
  display: string; icons: { src: string; sizes: string; purpose?: string }[];
  shortcuts: { name: string; url: string }[];
};

/**
 * A file with its prose taken out, because every rule below is
 * explained in a comment beside the line it governs — and a scan of
 * the raw file finds its own explanation and fails.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Where the Take App's bottom bar goes, which is the app's own shape. */
const THE_BOTTOM_BAR = ['/take', '/tv', '/go', '/tv/guide', '/take/library'];

describe('the manifest', () => {
  it('names the application and not one assignment', () => {
    /* `/api/take/<link>/manifest` is "BalanceVid — <the ask>", for a
       reason it gives. This one is the app. */
    expect(manifest.name).toBe('BalanceVid Take');
    /* A launcher truncates at about twelve characters. */
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
  });

  it('opens on the app home', () => {
    expect(manifest.start_url).toBe('/take');
    expect(existsSync('app/take/page.tsx')).toBe(true);
  });

  /*
   * THE SCOPE IS THE WHOLE INSTALLATION AND THAT IS NOT CARELESSNESS.
   *
   * An installed app leaves its own window for anything outside its
   * scope — so with `scope: "/take"`, three of the five things in
   * the app's own bottom bar would kick the person out to a browser
   * tab: Watch, Take Part and Guide. The bar is the app; the scope
   * has to hold it.
   */
  it('holds every door the app itself offers', () => {
    for (const way of THE_BOTTOM_BAR) {
      expect(way.startsWith(manifest.scope)).toBe(true);
    }
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.url.startsWith(manifest.scope)).toBe(true);
    }
  });

  it('offers shortcuts to pages that exist', () => {
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of manifest.shortcuts) {
      const page = `app${shortcut.url}/page.tsx`;
      expect(existsSync(page), `${shortcut.url} has no ${page}`).toBe(true);
    }
  });

  /*
   * EVERY ICON IS A FILE. A manifest naming an icon that is not
   * there is a manifest a browser rejects for install, and the way
   * it says so is by not offering.
   */
  it('names icons that are on disk', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      expect(existsSync(`public${icon.src}`), `${icon.src} is missing`).toBe(true);
    }
    /* Android crops to whatever shape the launcher uses. */
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
  });
});

describe('what the app needs to be reached at all', () => {
  /*
   * NOBODY INSTALLING THIS HAS AN ACCOUNT. The whole premise of the
   * Take App is a person who was sent a link, or who arrived to look
   * — so a manifest or an icon behind the sign-in gate is an app
   * that cannot be installed by the only people it is for. [D-25]
   */
  it('serves the manifest and its icons to somebody signed in to nothing', () => {
    /* WHAT A REQUEST ACTUALLY MEETS, in `middleware.ts`'s own order:
       an asset is waved through before any session is looked for, and
       everything else has to be named public. [middleware.ts:28, :90] */
    const reachable = (path: string) => isAssetPath(path) || mayBePublic(path, 'GET');

    expect(reachable('/take-app/manifest.json')).toBe(true);
    for (const icon of manifest.icons) {
      expect(reachable(icon.src), `${icon.src} is gated`).toBe(true);
    }
    expect(reachable('/take-app/apple-touch-icon.png')).toBe(true);
    expect(reachable('/take-sw.js')).toBe(true);

    /* And the app's own front door, which is a page and not an asset:
       somebody who was sent nothing is exactly who this is for. */
    expect(mayBePublic('/take', 'GET')).toBe(true);
  });

  /*
   * A WORKER WITH A FETCH HANDLER, which is the third install
   * criterion and the one that looks optional. A worker that only
   * uploads is not a worker a browser counts.
   */
  it('ships a service worker that answers fetches', () => {
    const worker = readFileSync('public/take-sw.js', 'utf8');
    expect(worker).toMatch(/addEventListener\(\s*'fetch'/);
  });

  it('registers that worker from the app home, not only from the recorder', () => {
    const home = readFileSync('app/take/TakeHome.tsx', 'utf8');
    expect(home).toMatch(/installWorker\(\)/);
    /* The recorder's own function, imported — not a second
       registration with its own idea of the scope. [D-19] */
    expect(home).toMatch(/import \{ installWorker \} from '\.\/\[link\]\/queue\.js'/);
  });
});

describe('the head of the app pages', () => {
  it('points at the app manifest', () => {
    expect(INSTALLS.manifest).toBe('/take-app/manifest.json');
  });

  it('carries the apple icon and the standalone title', () => {
    expect(INSTALLS.icons).toMatchObject({ apple: '/take-app/apple-touch-icon.png' });
    expect(INSTALLS.appleWebApp).toMatchObject({ capable: true, title: 'Take' });
  });

  /*
   * THE STATUS BAR IS A `viewport` EXPORT, AND THAT IS THE WHOLE
   * POINT OF THIS ONE.
   *
   * `themeColor` inside a `Metadata` object type-checks, builds
   * without a warning and emits NOTHING. The served head of `/take`
   * is how it was found — `<meta name="theme-color">` simply absent
   * while every other tag was there — and the recorder had carried
   * the same dead line for as long as it had been installable. A
   * field that is accepted and discarded is worse than one that is
   * rejected. [U-02, U-21]
   */
  it('puts the ground where Next will actually emit it', () => {
    expect(GROUND.themeColor).toBe('#0e0f11');
    expect(INSTALLS).not.toHaveProperty('themeColor');
  });

  it('exports it as a viewport from every page that installs', () => {
    for (const page of ['app/take/page.tsx', 'app/take/library/page.tsx',
      'app/take/[link]/page.tsx']) {
      expect(code(page), page).toMatch(/export const viewport = GROUND;/);
      /* And nowhere does the dead spelling come back. */
      expect(code(page), page).not.toMatch(/themeColor/);
    }
  });

  it('is the same object on the home and on the library', () => {
    for (const page of ['app/take/page.tsx', 'app/take/library/page.tsx']) {
      const source = readFileSync(page, 'utf8');
      expect(source, page).toMatch(/\.\.\.INSTALLS/);
      expect(source, page).toMatch(/from '\.\.?\/?(\.\.\/)?installs\.js'/);
    }
  });

  /*
   * AND NO LAYOUT, WHICH IS THE OPPOSITE OF `/tv` AND DELIBERATE.
   *
   * A layout at `app/take/` wraps `/take/<link>` too, and that page
   * carries its OWN manifest — the performer's assignment. Two
   * `<link rel="manifest">` in one document and the browser takes
   * one of them, so a performer would install the whole application
   * instead of their part, or the other way about, depending on head
   * order. A third app page belongs in a route group.
   */
  it('does not wrap the recorder in the application manifest', () => {
    expect(existsSync('app/take/layout.tsx')).toBe(false);
    const recorder = readFileSync('app/take/[link]/page.tsx', 'utf8');
    expect(recorder).toMatch(/rel="manifest"/);
    expect(recorder).toMatch(/\/api\/take\/\$\{encodeURIComponent\(link\)\}\/manifest/);
    /* The colour is shared; the manifest is not. */
    expect(recorder).not.toMatch(/\.\.\.INSTALLS/);
    expect(recorder).not.toMatch(/INSTALLS\b.*manifest|manifest.*INSTALLS\b/);
  });
});
