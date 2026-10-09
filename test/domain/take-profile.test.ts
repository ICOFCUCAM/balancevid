/**
 * Profile and connections.
 *   [TAKE-PLATFORM P13, P22, P23, P25; D-03, D-04, D-19, U-19, U-02]
 *
 * > *"Take is designed to work without forcing an account for
 * > every participation link. Your device keeps your own saved
 * > participation links."*
 *
 * BOTH UPLOADED DESIGNS END THE BAR WITH A PROFILE and fill it
 * with the same four things — the installations this device takes
 * part in, which one is serving the page, the embed tools, and
 * what the app is allowed to use. All four existed here; three of
 * them were on the home screen, where a first-time visitor met
 * them before finding anything to sing.
 *
 * RENDERED, NOT SEARCHED, for the reason the install tests give:
 * a page that holds the right markup and never reaches it is the
 * failure this suite could not see until it started rendering.
 */

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { mayBePublic } from '../../src/auth/policy.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const draw = async () => {
  const { default: Profile } = await import('../../app/take/profile/Profile.js');
  return renderToStaticMarkup(createElement(Profile));
};

describe('the profile of somebody with no account', () => {
  /*
   * IT SAYS SO, FIRST. A page headed Profile on a product with no
   * sign-in has to explain itself in its opening sentence, or a
   * person spends the rest of it looking for the login they
   * assume they are missing. [U-19]
   */
  it('says there is no account, rather than implying one', async () => {
    const html = await draw();
    expect(html).toContain('No account, by design');
    expect(html).toMatch(/without asking who you are/i);
    /* And nothing that would need one. */
    expect(html).not.toMatch(/sign in|sign out|log in/i);
  });

  /*
   * NO AVATAR AND NO NAME. The uploaded homepage draws a
   * photograph in the top right; a product with no accounts
   * drawing a face would be drawing somebody else's.
   */
  it('draws nobody’s face', async () => {
    const html = await draw();
    expect(html).not.toContain('<img');
  });

  /* The four things both designs put here. */
  it('carries the installations, the embed tools and the work', async () => {
    const html = await draw();
    expect(html).toContain('data-testid="section-instances"');
    expect(html).toContain('data-testid="profile-embed"');
    expect(html).toContain('data-testid="profile-permissions"');
    expect(html).toContain('data-testid="profile-work"');
    expect(html).toMatch(/href="\/take\/embed"/);
    expect(html).toMatch(/href="\/take\/library"/);
  });

  /*
   * AND THE LIST IS DRAWN BY THE ONE COMPONENT THAT KNOWS IT.
   * Asking an installation who it is, refusing an address that is
   * not one, and keeping a studio that is merely asleep are three
   * behaviours and none of them is obvious; the second copy is
   * the one that would quietly lose somebody's studio. [D-19]
   */
  it('draws the field that adds another installation', async () => {
    const html = await draw();
    expect(html).toContain('Add another BalanceVid');
    expect(html).toContain('data-testid="instance-here"');
    /*
     * AND IT IS ON THE SCREEN, not merely in the markup. A
     * mutation that put `hidden` on this container passed a test
     * looking for the input's testid — the field was in the page
     * and invisible, which is the exact shape of fault that let
     * a studio tab ship inert. The whole opening tag is asserted
     * so an added attribute cannot slip through. [U-02]
     */
    expect(html).toContain(
      '<div class="tk-field" data-testid="instance-field">');
    expect(html).toContain('data-testid="instance-add"');
  });

  /*
   * A PERMISSION SWITCH THAT CANNOT SWITCH ANYTHING IS NOT DRAWN.
   * A web app cannot revoke a camera permission the browser
   * granted — only the browser can — so a toggle here would be a
   * control that does nothing, which is worse than none. It names
   * where the real one is. [U-19, D-21]
   */
  it('points at the browser for permissions instead of faking a switch', async () => {
    const html = await draw();
    expect(html).toMatch(/site settings/i);
    expect(html).not.toMatch(/<input[^>]+type="checkbox"/);
    expect(html).not.toMatch(/role="switch"/);
  });
});

describe('who may open it', () => {
  /*
   * PUBLIC FOR THE REASON THE LIBRARY IS: there is no sign-in on
   * this app by construction, so a profile behind one would be a
   * profile for the only person who does not need it. The server
   * has nothing to hand over either way — every fact on the page
   * is in that browser's own storage. [D-03, D-25]
   */
  it('is open, and carries nothing the server knows', async () => {
    expect(mayBePublic('/take/profile', 'GET')).toBe(true);
    expect(mayBePublic('/take/profile/', 'GET')).toBe(true);
    expect(mayBePublic('/take/profile', 'POST')).toBe(false);
    /* And it opens the page and nothing under it. */
    expect(mayBePublic('/take/profile/secret', 'GET')).toBe(false);
  });
});

describe('the home screen it was lifted out of', () => {
  it('no longer draws the list, and points at the page that does', async () => {
    const { default: TakeHome } = await import('../../app/take/TakeHome.js');
    const html = renderToStaticMarkup(createElement(TakeHome));
    expect(html).not.toContain('data-testid="section-instances"');
    /* The bar is one component now, and it is on the page. */
    expect(html).toContain('data-testid="take-bottom"');
    expect(html).toMatch(/href="\/take\/profile"/);
  });
});
