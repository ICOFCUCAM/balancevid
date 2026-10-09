/**
 * Getting the Take App, from a phone that was sent a link.
 *   [TAKE-APP T13a; TAKE-PLATFORM P6; Doctrine U-19, D-21, D-19]
 *
 * THE GAP THESE ANSWER:
 *
 * > *"when a take link is sent, to the person phone, the person
 * > open through the browser. can you attached a small icon to
 * > download the take app from google and or internet."*
 *
 * `InstallBar` has offered a real installation since T13a, and it
 * offers nothing when the browser has nothing to offer back:
 * Chromium fires `beforeinstallprompt`, iOS Safari is taught the
 * Share menu, and everything else gets an empty row. That is
 * correct — *"a control that cannot act looks like a fault"* — and
 * it leaves the commonest case in the product with no door at all,
 * because an invitation is usually opened inside WhatsApp,
 * Messenger or Instagram, whose browsers fire no install event and
 * are not iOS Safari.
 *
 * SO THE SMALL ROW IS ALWAYS THERE AND LEADS SOMEWHERE REAL.
 * `/downloads` is public by policy — *"nobody downloading the Take
 * App has an account, that is the whole premise"* — and honest by
 * construction, because it reads `var/downloads/` rather than a
 * list somebody wrote.
 *
 * AND NO STORE BADGE IS DRAWN BEFORE THERE IS A STORE. The gateway
 * once offered six download cards of which four went to `#`;
 * `downloads.ts` exists because of it. A Play badge on an app with
 * no Play listing is that lie with better artwork, and these fail
 * if one ever appears from an empty constant.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  APP_STORE_LISTING, DOWNLOADS_PATH, PLAY_LISTING, TAKE_APP_PATH,
  installWay, storeWays, takeAppAddress, wayTo,
} from '../../src/domain/getTheApp.js';
import { mayBePublic } from '../../src/auth/policy.js';

const SOURCE = readFileSync('app/take/GetTheApp.tsx', 'utf8');

/**
 * The component with its prose taken out.
 *
 * ASSERTED AGAINST THE CODE AND NOT THE COMMENTS, which two of
 * these had to learn: the file EXPLAINS that it does not sniff a
 * user agent and that it draws its mark rather than loading an
 * `<img>`, so a search of the whole text found both words in the
 * paragraph promising not to do them. A test that a file discusses
 * a mistake is not a test that it avoids one. [U-02]
 */
const COMPONENT = SOURCE
  /*
   * BLOCK COMMENTS FIRST, and that order is the whole of it. A
   * JSX-comment pattern (`{` whitespace `/*`) run first matches
   * the brace of a TYPE LITERAL whose first line is a doc comment,
   * and then runs to the next `*\/}` anywhere below — which ate
   * this component's entire body and left two assertions passing
   * against nothing. Stripping `/* … *\/` on its own cannot
   * overrun, and the `{}` a JSX comment leaves behind is inert.
   */
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the way to the app, when no store has it', () => {
  /*
   * THE WHOLE POINT OF THE ROW: it leads to a page a stranger can
   * actually open. A "Get the app" link that redirects to sign-in
   * is worse than no link, because it looks like the product is
   * refusing to be downloaded. [D-21]
   */
  it('points somewhere a signed-out stranger can reach', () => {
    expect(DOWNLOADS_PATH).toBe('/downloads');
    expect(mayBePublic(DOWNLOADS_PATH, 'GET')).toBe(true);
  });

  /*
   * AND IT DOES NOT TAKE THE INVITATION OFF THE SCREEN. They are
   * mid-assignment with a recording they may already have made;
   * navigating the tab to a download list loses the thing they
   * came for.
   */
  it('opens in a new tab, so the assignment keeps its place', () => {
    /*
     * COUNTED, NOT FOUND. `toMatch` was satisfied by the store
     * badge's copy of these attributes, so stripping them off the
     * main link — the one every phone sees and the badges are not
     * — left the assertion passing. Every anchor in this file
     * carries both or this fails. [U-02]
     */
    const anchors = (COMPONENT.match(/<a\b/g) ?? []).length;
    expect(anchors).toBeGreaterThanOrEqual(2);
    expect((COMPONENT.match(/target="_blank"/g) ?? []).length).toBe(anchors);
    /* `noopener` with it, or the new tab can reach back into this
       one through `window.opener`. */
    expect((COMPONENT.match(/rel="noopener noreferrer"/g) ?? []).length)
      .toBe(anchors);
  });

  /*
   * NO USER-AGENT SNIFF. The download centre reads what the
   * installation HAS; a row here deciding "you look like an
   * Android, here is an apk" would promise a platform this build
   * may have no artefact for — the gateway's four dead cards,
   * rebuilt. [U-02]
   */
  it('does not guess which phone it is talking to', () => {
    expect(COMPONENT).not.toMatch(/userAgent|navigator\.platform|Android|iPhone/);
  });

  /* Drawn, not fetched: a broken image icon beside "Get the Take
     App" would say the opposite of what the row is for. */
  it('draws its own mark rather than loading one', () => {
    expect(COMPONENT).toMatch(/<svg/);
    expect(COMPONENT).not.toMatch(/<img/);
  });
});

describe('a store badge is never drawn before there is a store', () => {
  it('offers no store at all today', () => {
    expect(PLAY_LISTING).toBe('');
    expect(APP_STORE_LISTING).toBe('');
    expect(storeWays()).toEqual([]);
  });

  /*
   * AND THE EMPTINESS IS CHECKED IN ONE PLACE. A component reading
   * the constants itself is a component that can forget to ask
   * whether they are set, and the way that fails is a badge
   * linking to nothing. [D-19]
   */
  it('makes the component ask rather than read the constants', () => {
    expect(COMPONENT).toMatch(/storeWays\(\)/);
    expect(COMPONENT).not.toMatch(/PLAY_LISTING|APP_STORE_LISTING/);
  });

  /*
   * A LISTING MUST BE ABSOLUTE. Pasted in as `play.google.com/...`
   * it would resolve against this product's own origin and 404 on
   * its own server — a failure that reads like a broken deployment
   * rather than a typo in one constant.
   */
  it('refuses a listing that is not an absolute https address', () => {
    /*
     * ASKED OF `wayTo` AND NOT OF `String.startsWith`. This stood
     * here calling `startsWith` on its own literals, which tests
     * JavaScript: the mutation that let an empty listing through
     * (`PLAY_LISTING !== undefined`) passed it without blinking.
     * The guard was unreachable because both constants are empty,
     * so it was lifted into a function a test can actually
     * call. [U-02]
     */
    for (const half of ['play.google.com/store/apps/details?id=x', '/downloads',
      'http://play.google.com/x', 'javascript:alert(1)', ' ', 'https:/typo', '']) {
      expect(wayTo('play', half), half).toBeNull();
    }
  });

  it('takes a real listing and says what that store says', () => {
    const url = 'https://play.google.com/store/apps/details?id=com.balancevid.take';
    expect(wayTo('play', url)).toEqual({
      store: 'play', says: 'Get it on Google Play', url,
    });
    expect(wayTo('app-store', 'https://apps.apple.com/app/id1')?.says)
      .toBe('Download on the App Store');
  });

  /* And `storeWays` is that guard applied to the constants, not a
     second opinion about them. */
  it('builds the list through the same check', () => {
    expect(storeWays())
      .toEqual([wayTo('play', PLAY_LISTING), wayTo('app-store', APP_STORE_LISTING)]
        .filter((one) => one !== null));
  });
});

describe('the row stands where the install bar cannot', () => {
  /*
   * ON THE INVITATION PAGE, which is the surface the question was
   * about, and beside the bar rather than instead of it: where a
   * browser CAN install, that is the better door and goes first.
   */
  it('is on the page an invitation opens', () => {
    const page = readFileSync('app/take/[link]/TakeApp.tsx', 'utf8');
    expect(page).toMatch(/<InstallBar \/>/);
    expect(page).toMatch(/<GetTheApp \/>/);
    expect(page.indexOf('<InstallBar />'))
      .toBeLessThan(page.indexOf('<GetTheApp />'));
  });

  /* And on the app's own home, which has the same blind spot: the
     header's Install button needs an event a chat browser never
     fires. */
  it('is on the Take App’s own home', () => {
    expect(readFileSync('app/take/TakeHome.tsx', 'utf8'))
      .toMatch(/<GetTheApp \/>/);
  });

  /*
   * AND IT IS GONE ONCE THE APP IS INSTALLED. Somebody running
   * from their home-screen icon being offered a way to get the app
   * is the product not knowing where it is — and the check is the
   * hook's, not a second copy of the standalone test. [D-19]
   */
  it('asks the shared hook whether the app is already here', () => {
    expect(COMPONENT).toMatch(/useInstallOffer\(\)/);
    expect(COMPONENT).toMatch(/if \(installed\) return null;/);
    expect(COMPONENT).not.toMatch(/display-mode|standalone/);
  });

  /*
   * AND THE HOOK ACTUALLY REPORTS IT. The assertion above says the
   * row hides when `installed` is true and says nothing about
   * whether anything ever makes it true — deleting `setInstalled`
   * from the standalone branch left every test green while the
   * row showed inside the installed app.
   *
   * There is no DOM in this suite, so this is read from the
   * source, which is how `engine-pulse.test.ts` holds the playout
   * loop to its own pulse. The branch is pinned whole: the
   * standalone test, the report, and the early return.
   */
  it('reports standalone from the one place that detects it', () => {
    const hook = readFileSync('app/useInstallOffer.ts', 'utf8');
    expect(hook).toMatch(/if \(standalone\) \{ setInstalled\(true\); return undefined; \}/);
    /* Set nowhere else: two writers would be two answers. */
    expect((hook.match(/setInstalled\(/g) ?? []).length).toBe(1);
    /*
     * AND HANDED OUT AS THE STATE, not as a literal beside its
     * name. `\binstalled\b` matched `installed: false` just as
     * happily as the shorthand, so a hook that detected
     * standalone perfectly and then reported `false` passed. The
     * shorthand is the assertion.
     */
    expect(hook).toMatch(/return \{[^}]*\binstalled,[^}]*\};/);
  });

  /*
   * AND IT SURVIVES THE BAR BEING WAVED AWAY. `dismiss` sets
   * `gone`, which hides the bar; a row that read `gone` too would
   * leave the person who tapped "Continue in browser" with no way
   * to the app at all — which is the exact hole this was built to
   * fill, reintroduced one state later.
   */
  it('does not disappear when the install bar is dismissed', () => {
    expect(COMPONENT).not.toMatch(/\bgone\b/);
  });
});


/**
 * A browser that will never offer to install, and what it is told.
 *   [TAKE-APP T13a; TAKE-PLATFORM P6; Doctrine U-02, U-19, D-21]
 *
 * THE CIRCLE THESE CLOSE WAS WALKED, NOT IMAGINED. An Android
 * phone with a chat app's browser was driven through the built
 * product: `/take` offered no install control, its only remaining
 * door was "Get the Take App", that door led to `/downloads`, and
 * the download centre's first card led straight back to `/take`
 * saying the app "installs to your home screen from the app
 * itself". Three screens, no instruction, nobody installs
 * anything. [U-02]
 */

/* Real strings, taken from the browsers people actually hold. */
const CHAT = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 '
  + '[FB_IAB/FB4A;FBAV/447.0.0.0;]';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 13; Mobile; rv:120.0) '
  + 'Gecko/120.0 Firefox/120.0';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
const IPHONE_IN_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 '
  + '[FBAN/FBIOS;FBAV/440.0.0.0;]';
const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('how to install it by hand', () => {
  /*
   * THE ONE MOST INVITATIONS ARRIVE IN. A chat app's browser has
   * no Add to Home screen of its own, because the menu belongs to
   * the chat app — so the first motion is not installing at all,
   * it is getting out. A page that skipped that step would be
   * giving instructions for a menu that is not on the screen.
   */
  it('tells somebody inside a chat app to leave it first', () => {
    const way = installWay(CHAT);
    expect(way?.on).toBe('in-app');
    expect(way?.steps[0]).toMatch(/⋮|⋯/);
    expect(way?.steps[1]).toMatch(/Open in/i);
    /* And only then the thing every other Android is told. */
    expect(way?.steps.at(-1)).toMatch(/Add to Home screen/i);
  });

  it('names the Android menu for an ordinary Android browser', () => {
    for (const ua of [ANDROID_CHROME, ANDROID_FIREFOX]) {
      const way = installWay(ua);
      expect(way?.on).toBe('android');
      expect(way?.says).toMatch(/Add to Home screen/i);
      expect(way?.steps.length).toBeGreaterThan(1);
    }
  });

  /*
   * EVERY BROWSER ON AN IPHONE IS WEBKIT, including the one
   * inside Facebook, so the share sheet is the answer for all of
   * them and the in-app test above must not steal this one.
   */
  it('sends an iPhone to the share sheet, whichever app it is in', () => {
    for (const ua of [IPHONE, IPHONE_IN_APP]) {
      const way = installWay(ua);
      expect(way?.on).toBe('ios');
      expect(way?.says).toMatch(/Share/);
      expect(way?.steps.join(' ')).toMatch(/Add to Home Screen/);
    }
  });

  /*
   * A LAPTOP HAS NO HOME SCREEN. `null` is the honest answer and
   * the surfaces draw nothing for it — a desktop browser that can
   * install gets the browser's own prompt instead.
   */
  it('says nothing to a desktop browser', () => {
    expect(installWay(LAPTOP)).toBeNull();
    expect(installWay('')).toBeNull();
  });

  /* One line for a place with one line, not a paragraph. */
  it('gives a short line as well as the steps', () => {
    for (const ua of [CHAT, ANDROID_CHROME, IPHONE]) {
      const way = installWay(ua);
      expect(way).not.toBeNull();
      expect(way!.says.length).toBeLessThanOrEqual(44);
      expect(way!.steps.every((step) => step.length > 10)).toBe(true);
    }
  });
});

describe('the address somebody is told to type', () => {
  it('is the app’s own path and the path the product links to', () => {
    expect(TAKE_APP_PATH).toBe('/take');
    expect(mayBePublic(TAKE_APP_PATH, 'GET')).toBe(true);
  });

  it('joins an origin without doubling the slash', () => {
    expect(takeAppAddress('https://example.org')).toBe('https://example.org/take');
    expect(takeAppAddress('https://example.org/')).toBe('https://example.org/take');
  });
});

describe('the surfaces that had nothing to show', () => {
  const HOOK = readFileSync('app/useInstallOffer.ts', 'utf8');

  /*
   * ONE OFFER AT A TIME, IN ORDER OF HOW GOOD IT IS. A real
   * prompt beats the share sheet, the share sheet beats a list of
   * taps, and an installed app beats all three with silence. The
   * ordering lives in the hook so that three surfaces cannot come
   * to three different answers. [D-19]
   */
  it('prefers a real prompt over a list of taps', () => {
    expect(HOOK).toMatch(
      /const way = Boolean\(offer\) \|\| gone \|\| installed \? null : manual/,
    );
  });

  /*
   * AND `teach` IS NOT IN THAT LIST, which an iPhone found by
   * walking the built pages: hiding `way` wherever `teach` is
   * true left the download centre — the one surface with no iOS
   * wording of its own — showing an iPhone nothing while it gave
   * an Android three steps. [U-02]
   */
  it('still has something to say to an iPhone on a page with no iOS words', () => {
    expect(HOOK).not.toMatch(/const way = [^;]*teach/);
    const centre = readFileSync('app/downloads/DownloadCentre.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(centre).not.toMatch(/\bteach\b/);
    expect(installWay(IPHONE)).not.toBeNull();
  });

  /*
   * AND IT WAITS BEFORE SPEAKING. `beforeinstallprompt` arrives
   * after load, not at it; instructions that appear and are then
   * replaced by an Install button read as a page that does not
   * know what it is doing.
   */
  it('gives the browser its chance before explaining', () => {
    expect(HOOK).toMatch(/setTimeout\(\s*\(\) => setManual\(installWay\(ua\)\), PATIENCE/);
    expect(HOOK).toMatch(/clearTimeout\(later\)/);
  });

  /*
   * WHAT EACH SURFACE DRAWS IS NOT ASSERTED HERE ANY MORE, and
   * the reason is worth keeping. Three source-text claims used to
   * stand where this comment is — that four files mention `way`,
   * that the download centre carries the right `data-testid` —
   * and two of them survived a mutation that switched the feature
   * off at its call site (`{false && <HowToKeepIt />}` leaves
   * every string in the file). They are now renders, in
   * `install-by-hand.test.ts`, which read what a person would
   * actually see. [U-02]
   */
});
