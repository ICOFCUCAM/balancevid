'use client';

import { useEffect, useState } from 'react';

/**
 * "Open in Take App" / "Continue in browser".  [TAKE-APP T2c, T13a]
 *
 * THE ROW THAT WAS WAITING ON SOMETHING TO OPEN. T2c was recorded as a
 * gap with a good reason — "there is no app to open, so a chooser
 * would offer one real door and one that leads nowhere" — and the
 * reason stopped being true the moment the Take App became
 * installable. This is the chooser, and both doors lead somewhere.
 *
 * IT IS NOT A NATIVE BINARY AND IT DOES NOT PRETEND TO BE. What
 * installing gives is a home-screen icon that opens THIS assignment
 * with no browser chrome, a shell that loads with no network, and an
 * upload that finishes after the phone is locked. What it does not
 * give is a listing in either store. The button says "Install", which
 * is what happens.
 *
 * NEVER SHOWN TO SOMEBODY WHO HAS ALREADY INSTALLED IT, and never on
 * a browser that cannot: an offer that does nothing is worse than no
 * offer. A control that cannot act looks like a fault. [U-19]
 */

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallBar() {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  /** iOS has no prompt to catch: it is told how instead. */
  const [teach, setTeach] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    /*
     * ALREADY INSTALLED IS THE FIRST THING CHECKED. A performer who
     * opened the icon on their home screen is running in the app;
     * offering to install it is the product not knowing where it is.
     */
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return undefined;

    /*
     * CHROMIUM FIRES THIS WHEN THE PAGE QUALIFIES — manifest, icons,
     * a service worker — so catching it is also the honest test of
     * whether there is anything to offer. Prevented, because the
     * browser's own bar appears at the bottom of the screen over the
     * Record button.
     */
    const caught = (event: Event) => {
      event.preventDefault();
      setOffer(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', caught);

    /*
     * SAFARI FIRES NOTHING AND HAS NO API FOR THIS. It does support
     * Add to Home Screen, and it is the single most likely phone a
     * performer is holding, so it is told rather than left out —
     * with the words the iOS share sheet actually uses.
     */
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const webkit = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
    if (iOS && webkit) setTeach(true);

    window.addEventListener('appinstalled', () => setGone(true));
    return () => { window.removeEventListener('beforeinstallprompt', caught); };
  }, []);

  if (gone || (!offer && !teach)) return null;

  const install = async () => {
    if (!offer) return;
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    /* Either way the offer is spent: the event cannot be reused. */
    setOffer(null);
    if (outcome === 'accepted') setGone(true);
  };

  return (
    <div data-testid="take-install" style={{
      display: 'flex', flexDirection: 'column', gap: 6, width: '100%',
      padding: '9px 11px', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--line)', background: 'var(--console-control)',
    }}>
      <span className="small" style={{ lineHeight: 1.35 }}>
        {teach && !offer
          ? 'Add this to your home screen: tap Share, then “Add to Home Screen”.'
          : 'Install this and it opens straight to your part — no browser bar, '
            + 'and it finishes uploading after you lock your phone.'}
      </span>
      {/*
        * TWO DOORS, AND THE SECOND ONE IS NOT A DISMISSAL DRESSED UP.
        * "Continue in browser" is what the brief calls it and what it
        * does: the page they are already on, working, with nothing
        * installed. It is a quiet button because it is the thing that
        * happens if they ignore this entirely.
        */}
      <div className="row" style={{ gap: 'var(--space-3)' }}>
        {offer && (
          <button className="ctl sm" data-testid="take-install-go"
                  onClick={() => void install()}>
            Open in Take App
          </button>
        )}
        <button className="quiet sm" data-testid="take-install-no"
                onClick={() => setGone(true)}>
          Continue in browser
        </button>
      </div>
    </div>
  );
}
