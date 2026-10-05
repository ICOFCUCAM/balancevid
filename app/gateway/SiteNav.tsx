'use client';

import { useState } from 'react';

import Icon from '../Icon.js';

/**
 * The bar across the top of the public site.
 *   [TV-NETWORK N-1; Doctrine D-04, U-19]
 *
 * THE DRAWER IS STATE, NOT NINE INLINE STYLES. The brief opened
 * it by reading `navLinks.style.display`, writing `"flex"`, and
 * then setting position, top, left, right, padding, background,
 * flex-direction and align-items one property at a time — on an
 * element the 900px breakpoint had already set to `display:none`.
 * The first tap worked and nothing afterwards did, because the
 * rule and the script were arguing about the same property from
 * opposite ends.
 *
 * So the open state is an attribute the stylesheet matches, and
 * the button says `aria-expanded` — which is the thing a screen
 * reader needs and the version with nine inline styles could not
 * have said, because nothing in the DOM knew the drawer was a
 * drawer. [D-19]
 */

/** The seven places, in the order the brief lists them. */
const LINKS: { href: string; says: string }[] = [
  { href: '#products', says: 'Products' },
  { href: '#platform', says: 'Platform' },
  { href: '#tv', says: 'Online TV' },
  { href: '#campaigns', says: 'Go Viral' },
  { href: '#pricing', says: 'Pricing' },
  { href: '#downloads', says: 'Downloads' },
  { href: '#developers', says: 'Developers' },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-nav">
      <div className="nav-inner">

        <a className="logo" href="#start">
          <span className="logo-mark"></span>
          BALANCEVID
        </a>

        <nav className="nav-links" id="site-nav-links"
             data-open={open ? 'yes' : 'no'}>
          {LINKS.map((one) => (
            <a key={one.href} href={one.href} onClick={() => setOpen(false)}>
              {one.says}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <a className="nav-btn" href="#developers">Documentation</a>
          {/*
            * GET STARTED IS THE DOOR, and the door is `/signin`.
            * The brief points it at `#start`, which is the hero
            * this button is already sitting on top of — a primary
            * action that scrolls to where you are. This
            * installation has exactly one way in and it is the
            * one named here. [D-21]
            */}
          <a className="nav-btn primary" href="/signin">Get Started</a>
        </div>

        <button className="menu" aria-label="Open navigation"
                aria-expanded={open} aria-controls="site-nav-links"
                onClick={() => setOpen((was) => !was)}>
          {/*
            * DRAWN, NOT TYPED. ☰ is whatever the reader's font
            * has — a different weight on every platform, and a
            * full-colour emoji on some. The product has had one
            * answer to this since the glyph sweep, and the rule
            * that found this one is `console.test.ts`'s. [D-14]
            */}
          <Icon name="list" size={22} />
        </button>
      </div>
    </header>
  );
}
