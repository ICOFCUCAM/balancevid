'use client';

import { useCallback, useEffect, useState } from 'react';

import { type InstallWay, installWay } from '../src/domain/getTheApp.js';

/**
 * Whether there is anything to offer, and the offering of it.
 *   [TAKE-APP T2c, T13a; TV-NETWORK N-9]
 *
 * LIFTED OUT OF `InstallBar` BECAUSE A SECOND SURFACE INSTALLS.
 * The Take App has been installable since T13a and the television
 * network is now; what the two share is every line of the
 * machinery — the already-installed check, the Chromium event,
 * the Safari exception, the spent prompt — and what they do not
 * share is a single word of the wording or any of the chrome.
 * Copying it would have been copying the half that is subtle.
 * [D-19]
 *
 * THE BEHAVIOUR IS UNCHANGED FOR THE TAKE APP, with one fix taken
 * in passing: `appinstalled` was added and never removed, so a
 * bar that unmounted left a listener holding a dead `setState`.
 *
 * IT IS ALSO THE HONEST TEST OF WHETHER THERE IS ANYTHING TO
 * OFFER. Chromium fires `beforeinstallprompt` only when the page
 * actually qualifies — manifest, icons, a service worker — so a
 * surface that is not installable simply never offers, rather
 * than showing a button that does nothing. A control that cannot
 * act looks like a fault. [U-19]
 */

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallOffer {
  /** True when a browser has offered a real prompt to pass on. */
  offered: boolean;
  /** True on an iOS browser, which has Add to Home Screen and no API. */
  teach: boolean;
  /** Already installed, just installed, or dismissed. Show nothing. */
  gone: boolean;
  /**
   * Running from the home-screen icon, so the app is already here.
   *
   * SEPARATE FROM `gone`, which three different things set. A
   * surface that offers another WAY IN — a store, a download page
   * — must disappear when the app is installed and stay when the
   * person merely waved the install bar away: dismissing a banner
   * is not saying they never want the app, and it is the one case
   * where the small link is the only thing left. [U-19]
   *
   * False until the effect runs, which is one frame of a link that
   * is about to vanish and never the reverse. Asking during render
   * would be a `window` read on the server.
   */
  installed: boolean;
  /**
   * The taps, where this browser will never offer a prompt.
   *   [getTheApp.ts, U-19, U-02]
   *
   * THE STATE THAT WAS MISSING, and the one most people are
   * actually in. `offered` is Chromium with the event; `teach` is
   * iOS Safari; everything else — Android Firefox, and every
   * invitation opened inside WhatsApp, Messenger or Instagram —
   * got NEITHER, so three surfaces rendered nothing at all and
   * the only door left was a quiet link to a download centre
   * whose first card pointed back at the page they were already
   * on. That circle was walked in a real browser before this was
   * written.
   *
   * NULL UNTIL THE BROWSER HAS HAD ITS CHANCE. `beforeinstallprompt`
   * can arrive a beat after load, and instructions that appear and
   * are then replaced by an Install button read as a page that
   * does not know what it is doing. Nothing is said until the
   * browser has stayed silent for `PATIENCE`.
   *
   * AND NULL ON A DESKTOP, where there is no home screen to add
   * to and a paragraph of telephone instructions is noise.
   */
  way: InstallWay | null;
  install: () => Promise<void>;
  dismiss: () => void;
}

/**
 * How long a browser gets to offer before the page explains the
 * manual way.
 *
 * Chromium fires `beforeinstallprompt` once the manifest, the
 * icons and the worker have all been checked, which is after
 * load and not at it. Long enough that the event wins where
 * there is one; short enough that somebody holding a phone has
 * not already given up.
 */
export const PATIENCE = 1500;

export function useInstallOffer(): InstallOffer {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [teach, setTeach] = useState(false);
  const [gone, setGone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [manual, setManual] = useState<InstallWay | null>(null);

  useEffect(() => {
    /*
     * ALREADY INSTALLED IS THE FIRST THING CHECKED. Somebody who
     * opened the icon on their home screen is running in the app;
     * offering to install it is the product not knowing where it
     * is.
     */
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return undefined; }

    /*
     * Prevented, because the browser's own bar appears at the
     * bottom of the screen over whatever is there.
     */
    const caught = (event: Event) => {
      event.preventDefault();
      setOffer(event as InstallEvent);
    };
    const onInstalled = () => setGone(true);
    window.addEventListener('beforeinstallprompt', caught);
    window.addEventListener('appinstalled', onInstalled);

    /*
     * SAFARI FIRES NOTHING AND HAS NO API FOR THIS. It does
     * support Add to Home Screen, and on a phone it is the most
     * likely browser there is, so it is told rather than left out.
     */
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const webkit = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
    if (iOS && webkit) setTeach(true);

    /*
     * AND THE MANUAL WAY, AFTER WAITING TO BE WRONG ABOUT IT.
     * The timer is cancelled by nothing — an event that arrives
     * late still sets `offered`, and `way` below prefers it. What
     * the timer buys is that a browser which WILL prompt is never
     * seen giving instructions first. [getTheApp.ts]
     */
    const later = window.setTimeout(
      () => setManual(installWay(ua)), PATIENCE,
    );

    return () => {
      window.clearTimeout(later);
      window.removeEventListener('beforeinstallprompt', caught);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!offer) return;
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    /* Either way the offer is spent: the event cannot be reused. */
    setOffer(null);
    if (outcome === 'accepted') setGone(true);
  }, [offer]);

  const dismiss = useCallback(() => setGone(true), []);

  /*
   * A REAL PROMPT BEATS INSTRUCTIONS, and an app already
   * installed beats both with silence. Those two the hook
   * decides, because a surface that worked them out for itself
   * would be a fourth place to get them wrong. [D-19]
   *
   * `teach` IS NOT IN THAT LIST, and that was found by driving an
   * iPhone through the built pages rather than by reading this
   * file. Suppressing `way` wherever `teach` is true assumes
   * every surface has iOS wording of its own — two do, and the
   * download centre does not, so an iPhone arriving there was
   * shown nothing at all while an Android was given three steps.
   * A surface with its own words checks `teach` first; one
   * without draws `way` and is right on every phone. [U-02]
   */
  const way = Boolean(offer) || gone || installed ? null : manual;

  return { offered: Boolean(offer), teach, gone, installed, way, install, dismiss };
}
