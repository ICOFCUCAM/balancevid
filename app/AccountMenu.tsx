'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { useConfirm } from './Confirm.js';
import Icon from './Icon.js';
import { useMenu, type MenuEntry } from './Menu.js';

/**
 * Who you are, and the two ways to stop being it.  [Doctrine D-06, D-19]
 *
 * WHAT THIS REPLACES. A bare "Sign out" button and, beside it, a second
 * button that armed a third — three controls in the corner of every
 * screen, two of which are for a laptop you have lost. It is the least
 * used thing in the product occupying the most prominent corner of it.
 *
 * It is the same menu primitive as everything else, which is the point:
 * the avatar is a `⋯` wearing a face, and "one menu, reached two ways"
 * has no exceptions in the corner of the screen either. [D-19]
 *
 * ENDING EVERY SESSION STILL ASKS, and the question names the cost —
 * every device, including the one you are on. It was a two-press arming
 * pattern before, which is a good instinct badly served: arming teaches
 * somebody to press twice, and then they press twice.
 */
export default function AccountMenu({
  name, role,
}: { name: string; role: string }) {
  const { menu, fromButton } = useMenu();
  const { confirm, dialog } = useConfirm();

  const leave = (everywhere: boolean) => {
    void fetch('/api/auth/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(everywhere ? { everywhere: true } : {}),
    }).finally(() => { window.location.href = '/signin'; });
  };

  const items = (): MenuEntry[] => [
    { label: 'Settings', href: '/settings', hint: 'Your name, and what this instance is' },
    { label: 'Sign out', onSelect: () => leave(false) },
    {
      label: 'Sign out everywhere…',
      danger: true,
      hint: 'For a device you no longer have',
      onSelect: () => confirm({
        question: 'End every session on every device, including this one? '
          + 'You will be signed out here immediately and will need the '
          + 'password again. Nothing you have made is touched.',
        verb: 'End every session',
        danger: true,
        go: () => leave(true),
      }),
    },
  ];

  return (
    <>
      {dialog}
      {menu}
      <button
        type="button"
        data-testid="account-menu"
        aria-haspopup="menu"
        aria-label={`Account: ${name}`}
        onClick={(event) => fromButton(name, items, event.currentTarget)}
        className="row"
        style={{
          gap: 'var(--space-3)', flexWrap: 'nowrap', flex: '0 0 auto',
          padding: '5px 9px 5px 5px', borderRadius: 'var(--radius-full)',
          background: 'none', border: 'var(--border) solid transparent',
          boxShadow: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span aria-hidden="true" style={{
          width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto',
          display: 'grid', placeItems: 'center',
          background: 'linear-gradient(140deg, var(--studio-one),'
            + ' var(--studio-two))',
          color: 'var(--text-on-accent)',
          fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
        }}>{initials(name)}</span>
        <span style={{ minWidth: 0, lineHeight: 1.2 }}>
          <span data-testid="account-name" style={{
            display: 'block', fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semi)', whiteSpace: 'nowrap',
          }}>{name}</span>
          {/*
            * NOT TWICE. The account is created called "Owner" before
            * anybody can be asked what to call them, and its role is also
            * Owner — so an instance nobody has named yet said "Owner"
            * over "Owner". [U-24]
            */}
          {role !== name && (
            <span data-testid="account-role" style={{
              display: 'block', fontSize: 'var(--text-2xs)',
              color: 'var(--ink-400)', whiteSpace: 'nowrap',
            }}>{role}</span>
          )}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--ink-400)' }}>
          <Icon name="chevron" size={12} />
        </span>
      </button>
    </>
  );
}

/**
 * LIT OR DARK, for the building only.  [Doctrine D-04, D-24]
 *
 * The studios are dark for a stated reason — a broadcast desk beside a
 * live monitor — and that is not a preference anybody should be offered.
 * The building is a different room: it is read, in daylight, and whether
 * a person wants it lit is genuinely theirs to say. Somebody working at
 * night on the same laptop wants the lobby dark too.
 *
 * BOTH GROUNDS ARE MEASURED. `contrast.test.ts` holds the dark ramp and
 * `building.css` states every light tone's ratio against #ffffff, so this
 * is a switch between two checked systems rather than a filter over one.
 *
 * SET BEFORE PAINT. A preference read in an effect arrives after the
 * first frame, which is a white flash for somebody who chose dark — the
 * exact person most bothered by one. `useLayoutEffect` runs before the
 * browser paints.
 */
export function GroundToggle() {
  const [lit, setLit] = useState(true);

  const apply = useCallback((next: boolean) => {
    const host = document.querySelector('[data-building]');
    if (host instanceof HTMLElement) {
      host.setAttribute('data-ground', next ? 'light' : 'dark');
    }
  }, []);

  useLayoutEffect(() => {
    let stored: string | null = null;
    /* Private windows and blocked site data both throw rather than return. */
    try { stored = window.localStorage.getItem('balancevid.ground'); } catch { /* no memory */ }
    if (stored === 'dark') { setLit(false); apply(false); }
  }, [apply]);

  useEffect(() => { apply(lit); }, [lit, apply]);

  return (
    <button
      type="button"
      data-testid="ground-toggle"
      aria-pressed={!lit}
      title={lit ? 'Darken the workspace' : 'Light the workspace'}
      aria-label={lit ? 'Darken the workspace' : 'Light the workspace'}
      onClick={() => {
        const next = !lit;
        setLit(next);
        try {
          window.localStorage.setItem('balancevid.ground', next ? 'light' : 'dark');
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
