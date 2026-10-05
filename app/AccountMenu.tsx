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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
