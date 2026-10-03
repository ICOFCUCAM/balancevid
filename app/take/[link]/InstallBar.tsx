'use client';

import { useInstallOffer } from '../../useInstallOffer.js';

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
 *
 * THE MACHINERY IS `useInstallOffer` AND NOT THIS FILE'S ANY MORE.
 * The television network installs too, and what the two surfaces
 * share is every subtle line of it — the standalone check, the
 * Chromium event, the Safari exception, the spent prompt — while
 * sharing not one word of the wording. This is the wording. [D-19, N-9]
 */

export default function InstallBar() {
  const { offered, teach, gone, install, dismiss } = useInstallOffer();
  if (gone || (!offered && !teach)) return null;

  return (
    <div data-testid="take-install" style={{
      display: 'flex', flexDirection: 'column', gap: 6, width: '100%',
      padding: '9px 11px', borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--line)', background: 'var(--console-control)',
    }}>
      <span className="small" style={{ lineHeight: 1.35 }}>
        {teach && !offered
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
        {offered && (
          <button className="ctl sm" data-testid="take-install-go"
                  onClick={() => void install()}>
            Open in Take App
          </button>
        )}
        <button className="quiet sm" data-testid="take-install-no"
                onClick={dismiss}>
          Continue in browser
        </button>
      </div>
    </div>
  );
}
