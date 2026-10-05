'use client';

/**
 * What this device remembers about its own work.
 *   [TAKE-APP T16, P5; Doctrine D-19, D-25, D-03]
 *
 * > *"Mobile take app should have the Library (which has my
 * > collection. My collection are already produced TAKE of the
 * > person that was produced by the balancevid studio and
 * > generated. The owner of take can download it or share it
 * > through their phones) where there is My Takes and other
 * > information"*
 *
 * THE DEVICE IS THE ACCOUNT, WHICH IS NOT A SHORTCUT. Nothing
 * here asks who you are — the Take App has never had a sign-in
 * and the installation writes nothing down about the phone
 * asking — so *mine* can only mean *the links this browser
 * kept*. That is a weaker claim than an account and an honest
 * one: a person who clears their storage has lost the list, and
 * the page says so rather than pretending to a recovery it
 * cannot do.
 *
 * ONE KEY, IN ONE FILE. The home screen read and wrote this
 * list and the library now reads it too; a second spelling of
 * `balancevid.take.mine` is a second list, and the one that
 * loses a person's work is whichever they did not look at.
 * [D-19]
 *
 * EVERY READ AND WRITE IS GUARDED. A private window, blocked
 * site data and a quota that is full all throw rather than
 * return, and a recorder that fell over on its own bookkeeping
 * would lose the recording as well as the note. [U-19]
 */

/** A request this device holds, which is the whole of "My Takes". */
export interface Mine {
  link: string;
  title: string;
  kind: string;
  at: string;
}

export const MINE = 'balancevid.take.mine';

/**
 * HOW MANY ARE KEPT. Fifty is a person who has taken part
 * weekly for a year, and the list is read into a phone's memory
 * whole.
 */
export const MOST_MINE = 50;

export function readMine(): Mine[] {
  try {
    const raw = window.localStorage.getItem(MINE);
    const held = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(held)) return [];
    /*
     * CHECKED ON THE WAY OUT, because this is a string a person
     * can edit in their own browser and the first thing done
     * with `link` is to put it in a URL. A row that is not a
     * row is dropped rather than drawn as `undefined`.
     */
    return held.filter((one): one is Mine =>
      typeof one === 'object' && one !== null
      && typeof (one as Mine).link === 'string'
      && (one as Mine).link !== '');
  } catch {
    /* Private browsing, or storage refused. The page still
       works; this person simply has no remembered list. [U-19] */
    return [];
  }
}

export function keepMine(one: Mine): Mine[] {
  const next = [one, ...readMine().filter((was) => was.link !== one.link)];
  const kept = next.slice(0, MOST_MINE);
  try {
    window.localStorage.setItem(MINE, JSON.stringify(kept));
  } catch { /* as above. */ }
  return kept;
}

/**
 * Forget one.
 *
 * BECAUSE A LIST YOU CANNOT REMOVE FROM IS A LIST THAT FILLS UP
 * WITH THINGS YOU DID NOT MEAN. Somebody who opened a link,
 * read it and never recorded has a row for it; somebody who
 * entered a call by mistake has one too. Forgetting is local
 * and tells the installation nothing, because the installation
 * was never told anything. [D-03]
 */
export function forgetMine(link: string): Mine[] {
  const next = readMine().filter((one) => one.link !== link);
  try {
    window.localStorage.setItem(MINE, JSON.stringify(next));
  } catch { /* as above. */ }
  return next;
}
