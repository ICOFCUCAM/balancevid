'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import Icon from './Icon.js';

/**
 * LIT OR DARK, for every room that is not a dark one.
 *   [Doctrine D-04, D-24]
 *
 * THE STUDIOS ARE DARK FOR A STATED REASON — a broadcast desk
 * beside a live monitor, where a white panel ruins both the
 * picture and your night vision — and that is not a preference
 * anybody should be offered. Everywhere else is a different
 * room: it is READ, in daylight, and whether a person wants it
 * lit is genuinely theirs to say. Somebody working at night on
 * the same laptop wants the lobby dark too.
 *
 * IT MOVED OUT OF `AccountMenu` BECAUSE A SECOND SURFACE WANTED
 * IT. The building had the only switch, which meant the
 * preference reached the lobby and stopped: BalanceVid Go and
 * the Take App's own pages are read by strangers on phones in
 * daylight, and they had no ground at all. A second copy of the
 * toggle beside them would be a second place the key is spelled
 * and a second chance to spell it differently. One component,
 * one key, every host. [D-19]
 *
 * EVERY HOST, AND THERE IS NORMALLY ONE. A page marks the
 * element it wants relit with `data-ground-host`; this sets
 * `data-ground` on all of them, because a layout that mounted
 * two would otherwise end up half lit.
 *
 * BOTH GROUNDS ARE MEASURED. `contrast.test.ts` now parses the
 * dark ramp out of `tokens.css` AND the light one out of
 * `building.css` and checks every text tone on both, so this is
 * a switch between two checked systems rather than a filter
 * over one.
 *
 * SET BEFORE PAINT. A preference read in an effect arrives after
 * the first frame, which is a white flash for somebody who chose
 * dark — the exact person most bothered by one.
 * `useLayoutEffect` runs before the browser paints.
 */
export const GROUND_KEY = 'balancevid.ground';

export function GroundToggle({ dark = false }: {
  /**
   * WHERE THE ROOM STARTS DARK, which is a property of the room
   * and not of the person.
   *
   * The building is lit by default because it is a lobby. A
   * surface whose subject is a moving picture is not, and
   * saying so here keeps the DEFAULT with the page while the
   * CHOICE stays with the person: whatever they last pressed
   * wins on every surface, and this only decides what they see
   * before they have pressed anything. [D-04]
   */
  dark?: boolean;
}) {
  const [lit, setLit] = useState(!dark);

  const apply = useCallback((next: boolean) => {
    for (const host of document.querySelectorAll('[data-ground-host]')) {
      if (host instanceof HTMLElement) {
        host.setAttribute('data-ground', next ? 'light' : 'dark');
      }
    }
  }, []);

  useLayoutEffect(() => {
    let stored: string | null = null;
    /* Private windows and blocked site data both throw rather
       than return. */
    try { stored = window.localStorage.getItem(GROUND_KEY); } catch { /* no memory */ }
    if (stored === 'dark' || stored === 'light') {
      const next = stored === 'light';
      setLit(next);
      apply(next);
    }
  }, [apply]);

  useEffect(() => { apply(lit); }, [lit, apply]);

  return (
    <button
      type="button"
      data-testid="ground-toggle"
      aria-pressed={!lit}
      title={lit ? 'Darken this page' : 'Light this page'}
      aria-label={lit ? 'Darken this page' : 'Light this page'}
      onClick={() => {
        const next = !lit;
        setLit(next);
        try {
          window.localStorage.setItem(GROUND_KEY, next ? 'light' : 'dark');
        } catch { /* it will simply not be remembered */ }
      }}
      style={{
        flex: '0 0 auto', padding: 7, borderRadius: 'var(--radius-md)',
        background: 'none', border: 0, boxShadow: 'none',
        color: 'var(--ink-300)', cursor: 'pointer',
      }}
    >
      <Icon name={lit ? 'moon' : 'sun'} size={17} />
    </button>
  );
}
