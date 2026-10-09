/**
 * How somebody gets the Take App onto their phone.
 *   [TAKE-APP T13a; TAKE-PLATFORM P6; Doctrine D-19, D-21, U-19]
 *
 * THE PERSON THIS EXISTS FOR IS HOLDING AN INVITATION. A link was
 * sent to their phone, they tapped it, and it opened in whatever
 * browser the message was in. That is the whole audience: somebody
 * who has never heard of this product, on a device nobody chose,
 * one tap from recording.
 *
 * AND FOR MOST OF THEM THERE WAS NO WAY IN. `InstallBar` offers a
 * real installation, but only where the browser offers one back:
 * Chromium fires `beforeinstallprompt` and iOS Safari is taught the
 * Share menu. An invitation opened inside WhatsApp, Messenger,
 * Instagram or Android Firefox gets neither — the bar renders
 * nothing at all, correctly, because it has nothing to offer. The
 * fault is not the bar. It is that nothing stood beside it.
 *
 * SO THIS IS THE DOOR THAT IS ALWAYS THERE, and `/downloads` is
 * where it leads: public by policy, because *"nobody downloading
 * the Take App has an account — that is the whole premise"*, and
 * honest by construction, because it reads `var/downloads/` rather
 * than a list somebody wrote. It shows the web install and any
 * signed `.apk` an operator has actually put there.
 *
 * NOTHING HERE RENDERS A STORE BADGE THAT LEADS NOWHERE. The
 * gateway once offered six download cards of which four went to
 * `#`; `downloads.ts` exists because of it. A Play Store badge on
 * an app with no Play listing is that same lie with better
 * artwork, and the person it fools is the one furthest from being
 * able to tell. [U-19, D-21]
 */

/**
 * The Google Play listing, when there is one.
 *
 * THE ONE LINE TO CHANGE ON THE DAY IT IS PUBLISHED. Paste the
 * listing URL between the quotes and the badge appears wherever
 * the app is offered — the invitation page, the Take App's own
 * home, the download centre — because they all ask here. Leave it
 * empty and none of them shows anything, which is today's truth:
 * a signed binary in either store needs accounts, certificates and
 * a release pipeline, and `TAKE-APP.md` records it as the one part
 * of T13a this repository cannot reach.
 *
 * IT IS A CONSTANT AND NOT AN ENVIRONMENT VARIABLE, deliberately.
 * There is one Play listing for one product; a per-installation
 * setting would let a deployment point the badge anywhere, which
 * for a store link is the whole attack. `downloads.ts` makes the
 * same argument about manifests: a second place to be wrong.
 */
export const PLAY_LISTING = '';

/** The App Store listing, when there is one. Same rule as above. */
export const APP_STORE_LISTING = '';

export interface StoreWay {
  /** Which store, so a caller can pick the right mark. */
  store: 'play' | 'app-store';
  /** What the link says, in the store's own convention. */
  says: string;
  url: string;
}

/**
 * Only the stores this app is actually in.
 *
 * AN EMPTY ARRAY IS THE CORRECT ANSWER TODAY and the reason this
 * is a function rather than two exported strings a component picks
 * over: a surface that reads the constants itself is a surface
 * that can forget to check whether they are empty, and the way
 * that fails is a badge linking to nothing.
 *
 * `https://` is required rather than assumed. A listing pasted in
 * as `play.google.com/...` would otherwise resolve against this
 * origin and 404 on the product's own server — the failure looking
 * exactly like a broken deployment rather than a typo in a
 * constant.
 */
export function storeWays(): StoreWay[] {
  return [
    wayTo('play', PLAY_LISTING),
    wayTo('app-store', APP_STORE_LISTING),
  ].filter((one): one is StoreWay => one !== null);
}

/** What each store's link says, in that store's own convention. */
const SAYS: Record<StoreWay['store'], string> = {
  play: 'Get it on Google Play',
  'app-store': 'Download on the App Store',
};

/**
 * One listing, checked.
 *
 * SEPARATE AND EXPORTED BECAUSE THE GUARD WAS OTHERWISE
 * UNREACHABLE. Folded into `storeWays` it read the two constants
 * directly, and both are empty — so no test could reach the
 * `https://` check at all, and a mutation replacing it with
 * `!== undefined` (a badge for every empty listing) passed the
 * whole suite. The only assertion left standing was one that
 * called `String.startsWith` on a literal and proved nothing about
 * this file. [U-02]
 *
 * A guard that cannot be observed is a guard that is not there,
 * and the way this product deals with one is to make it reachable
 * rather than to defend it in a comment.
 */
export function wayTo(
  store: StoreWay['store'], listing: string,
): StoreWay | null {
  /*
   * `https://` AND NOT "looks like a URL". A listing pasted as
   * `play.google.com/...` resolves against this product's own
   * origin and 404s on its own server — a failure that reads like
   * a broken deployment rather than a typo in one constant. `http`
   * is refused too: a store link is the one place a downgrade
   * matters, because what is on the other end is a binary.
   */
  if (!listing.startsWith('https://')) return null;
  return { store, says: SAYS[store], url: listing };
}

/**
 * Where a phone goes to get the app when no store has it.
 *
 * ONE SPELLING, because the invitation page, the Take App's home
 * and anything built after them must not each decide. [D-19]
 */
export const DOWNLOADS_PATH = '/downloads';

/**
 * WHERE THE APP IS, SAID AS AN ADDRESS SOMEBODY CAN TYPE.
 *
 * `DOWNLOADS_PATH` is where a page SENDS a person; this is what
 * is written on a poster, read down a telephone, or printed on
 * the back of a flyer. One path, so the thing a person is told
 * to type and the thing the product links to cannot drift. [D-19]
 */
export const TAKE_APP_PATH = '/take';

/** `https://this-installation.example/take`, from whatever origin asked. */
export function takeAppAddress(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${TAKE_APP_PATH}`;
}

/**
 * HOW TO INSTALL IT BY HAND, ON A BROWSER THAT WILL NOT OFFER.
 *   [TAKE-APP T13a; TAKE-PLATFORM P6; Doctrine U-02, U-19, D-21]
 *
 * THE CIRCLE THIS ENDS WAS MEASURED, NOT GUESSED. An Android
 * phone opening an invitation inside a chat app was driven
 * through the whole product: `/take` offered no install control
 * (correctly — `beforeinstallprompt` never fires in a chat app's
 * own browser), its one remaining door was "Get the Take App",
 * that door led to `/downloads`, and the download centre's first
 * card led back to `/take` saying the app "installs to your home
 * screen from the app itself". Three screens, no instruction, and
 * the person is back where they started.
 *
 * SO THE PRODUCT SAYS THE TAPS. Nothing here downloads anything
 * and nothing here promises a store: these are the two or three
 * motions that put this page on a home screen, in the words the
 * phone's own menu uses.
 *
 * THIS IS A SNIFF AND IT IS DELIBERATE, which is the opposite of
 * the rule `GetTheApp` keeps — and the two are not in conflict.
 * That rule forbids guessing a person's phone in order to offer
 * them a FILE, because the installation may hold no such file and
 * the badge would be a lie. This guesses a phone in order to name
 * a MENU, where being wrong costs a sentence that does not match
 * and never a dead link. The honest answer where it cannot tell
 * is `null`, and `null` draws nothing. [U-19]
 */
export interface InstallWay {
  /** Which situation this is, so a surface can mark it. */
  on: 'ios' | 'in-app' | 'android';
  /** One line, for a place with room for one line. */
  says: string;
  /** The motions, in order, in the menu's own words. */
  steps: string[];
}

/**
 * The browsers that are somebody else's app.
 *
 * A CHAT APP'S OWN BROWSER CANNOT INSTALL ANYTHING, whatever the
 * page offers it — there is no menu with "Add to Home screen" in
 * it, because the menu belongs to the chat app. So the first
 * motion is not an installation at all; it is getting out. This
 * is the browser most invitations are actually opened in, which
 * is the whole reason this function exists.
 */
const IN_APP = /\b(FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|WhatsApp|Snapchat|TikTok|Twitter|GSA)\b/i;

export function installWay(agent: string): InstallWay | null {
  const ua = agent ?? '';

  /*
   * iOS FIRST, because an in-app browser on an iPhone is still a
   * WebKit view and the way out of it is the same share sheet.
   * Chrome and Firefox on iOS are WebKit too and have had Add to
   * Home Screen since iOS 16.4, so all of them get one answer.
   */
  const ios = /iPad|iPhone|iPod/.test(ua);
  if (ios) {
    return {
      on: 'ios',
      says: 'Share → Add to Home Screen',
      steps: [
        'Tap the Share button at the bottom of the screen.',
        'Scroll down and tap “Add to Home Screen”.',
        'Tap “Add”. The Take icon appears with your other apps.',
      ],
    };
  }

  if (IN_APP.test(ua)) {
    return {
      on: 'in-app',
      says: 'Open this page in your browser first',
      steps: [
        'Tap the ⋮ or ⋯ button in the corner of this chat window.',
        'Tap “Open in browser” (or “Open in Chrome”).',
        'In the browser, tap ⋮ and then “Add to Home screen”.',
      ],
    };
  }

  /*
   * ANDROID AND NOT "A PHONE". A desktop browser that will not
   * prompt is a desktop browser with nothing wrong with it —
   * there is no home screen to add to, and a paragraph of
   * telephone instructions on a laptop is noise. `null`.
   */
  if (/Android/.test(ua)) {
    return {
      on: 'android',
      says: 'Menu ⋮ → Add to Home screen',
      steps: [
        'Tap the ⋮ button at the top right of the browser.',
        'Tap “Add to Home screen”, or “Install app” if it says that.',
        'Confirm. The Take icon appears with your other apps.',
      ],
    };
  }

  return null;
}
