'use client';

import { useCallback, useEffect, useState } from 'react';

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
  install: () => Promise<void>;
  dismiss: () => void;
}

export function useInstallOffer(): InstallOffer {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [teach, setTeach] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    /*
     * ALREADY INSTALLED IS THE FIRST THING CHECKED. Somebody who
     * opened the icon on their home screen is running in the app;
     * offering to install it is the product not knowing where it
     * is.
     */
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return undefined;

    /*
     * Prevented, because the browser's own bar appears at the
     * bottom of the screen over whatever is there.
     */
    const caught = (event: Event) => {
      event.preventDefault();
      setOffer(event as InstallEvent);
    };
    const installed = () => setGone(true);
    window.addEventListener('beforeinstallprompt', caught);
    window.addEventListener('appinstalled', installed);

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

    return () => {
      window.removeEventListener('beforeinstallprompt', caught);
      window.removeEventListener('appinstalled', installed);
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

  return { offered: Boolean(offer), teach, gone, install, dismiss };
}
