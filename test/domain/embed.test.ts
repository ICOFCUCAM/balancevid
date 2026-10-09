/**
 * Take, on somebody else's website.
 *   [TAKE-PLATFORM P6, P13; TAKE-APP T13a; D-03, D-19, D-21, U-02, U-19]
 *
 * > *"Bring participation to your website. Embed Take on a
 * > community, artist or publisher website. Share the public
 * > link or add the experience directly to your page."*
 *
 * THE BENCHMARK CARRIES THIS ON TWO OF ITS SEVEN SCREENS AND
 * THIS PRODUCT HAD NONE OF IT. What `embed` meant in this
 * codebase until now was the opposite direction — somebody
 * else's video played inside a conversation. Nothing anywhere
 * handed a studio a way to put Take on their own page.
 *
 * WHAT IS ASSERTED HERE IS WHAT A PUBLISHER PASTES. The snippets
 * are read as strings, because a string is what leaves this
 * product and lands in a page this product will never see. The
 * page that offers them is RENDERED rather than searched, for
 * the reason `install-by-hand.test.ts` gives: a file that
 * contains the right markup and never draws it is the failure
 * this suite could not see until it started rendering.
 *
 * AND IT WAS DRIVEN ACROSS AN ORIGIN BOUNDARY BEFORE IT WAS
 * WRITTEN DOWN. The two snippets this page serves were pasted
 * into a page on a different port — a record label's own site —
 * and loaded in a browser: the link pointed at the app and
 * opened in a new tab, and the frame loaded the real Take App,
 * `data-testid="take-home"` and all, with its `allow` attribute
 * intact. [U-02]
 */

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  EMBED_PATH, FRAME_COSTS, LINK_COSTS, TAKE_APP_PATH,
  embedWays, frameCode, hostOf, linkCode, takeAppAddress,
} from '../../src/domain/embed.js';
import { mayBePublic } from '../../src/auth/policy.js';

const HERE = 'https://studio.example';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

describe('the snippets a publisher pastes', () => {
  /*
   * THE ADDRESS IS THE ONE THIS INSTALLATION IS ON. A constant
   * would be right for one deployment and wrong for every other,
   * and this product is many installations that have never heard
   * of each other. [P13, D-19]
   */
  it('point at the installation that served them', () => {
    for (const code of [linkCode(HERE), frameCode(HERE)]) {
      expect(code).toContain('https://studio.example/take');
      expect(code).not.toContain('balancevid.com');
    }
    expect(linkCode('https://other.example'))
      .toContain('https://other.example/take');
  });

  /*
   * NOTHING EXECUTES. A publisher pasting a `<script>` from
   * another origin is handing that origin their page, and a
   * product that asks for it when markup would do has not
   * thought about who is pasting. It is also why the code can be
   * shown in full on the page rather than hidden behind a token.
   */
  it('are inert markup and never a script', () => {
    for (const code of [linkCode(HERE), frameCode(HERE)]) {
      expect(code).not.toMatch(/<script/i);
      expect(code).not.toMatch(/\son[a-z]+\s*=/i);
      expect(code).not.toMatch(/javascript:/i);
    }
  });

  /*
   * A NEW TAB THAT CANNOT REACH BACK. `target="_blank"` without
   * `rel="noopener"` hands the opened page a handle on the
   * publisher's own window.
   */
  it('open the app in a tab that cannot reach the page that opened it', () => {
    const code = linkCode(HERE);
    expect(code).toContain('target="_blank"');
    expect(code).toContain('rel="noopener"');
  });

  /*
   * `allow` IS THE WHOLE DIFFERENCE between a frame somebody can
   * record in and a frame where the record button silently does
   * nothing. A cross-origin frame gets no camera unless the page
   * holding it passes one. [U-19]
   */
  it('give a framed app the camera, or it can never ask for one', () => {
    const code = frameCode(HERE);
    expect(code).toMatch(/allow="[^"]*camera[^"]*"/);
    expect(code).toMatch(/allow="[^"]*microphone[^"]*"/);
    /* And a title, or a screen reader announces it as "frame". */
    expect(code).toMatch(/title="[^"]+"/);
  });

  /* The address a person types, reads aloud, or puts on a poster. */
  it('agree with the one path the product links to', () => {
    expect(TAKE_APP_PATH).toBe('/take');
    expect(takeAppAddress(HERE)).toBe('https://studio.example/take');
    expect(hostOf(takeAppAddress(HERE))).toBe('studio.example');
    /* An unparseable address is still printed, not apologised for. */
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('what each way costs, said before it is pasted', () => {
  /*
   * BOTH OF THE FRAME'S COSTS FAIL SILENTLY on somebody else's
   * site a week after they stopped looking: storage in a
   * third-party frame is not the app's storage, and a camera in
   * a frame is the embedding page's decision. A page that let a
   * publisher discover either one from a complaint would be this
   * product's own rule broken. [U-19]
   */
  it('names the frame’s two, and the link’s none', () => {
    expect(FRAME_COSTS.length).toBe(2);
    expect(FRAME_COSTS.join(' ')).toMatch(/My Takes|saved/i);
    expect(FRAME_COSTS.join(' ')).toMatch(/camera/i);
    /* The link has none worth a sentence, and says nothing. */
    expect(LINK_COSTS).toEqual([]);
  });

  /*
   * THE LINK IS OFFERED FIRST, because it is the one that works
   * in a locked-down CMS, an email, and a browser with scripts
   * off — and because it has no costs to read.
   */
  it('offers the one that always works first', () => {
    const ways = embedWays(HERE);
    expect(ways.map((one) => one.id)).toEqual(['link', 'frame']);
    expect(ways[0]?.costs).toEqual([]);
    expect(ways[1]?.costs.length).toBeGreaterThan(0);
    for (const way of ways) {
      expect(way.code).toContain('studio.example');
      expect(way.says.length).toBeGreaterThan(3);
      expect(way.what.length).toBeGreaterThan(30);
    }
  });
});

describe('who may read the page', () => {
  /*
   * PUBLIC, AND FOR LESS REASON TO HESITATE THAN ANY OTHER PAGE
   * IN THIS APP. It holds one fact — the address the reader
   * typed to get here — reads no store, and says nothing about
   * anybody's work. The people it is for (a community, an
   * artist, a publisher) have no account on this installation by
   * construction. [D-03, D-21]
   */
  it('is open to a stranger, because a stranger is who it is for', () => {
    expect(mayBePublic(EMBED_PATH, 'GET')).toBe(true);
    expect(mayBePublic(`${EMBED_PATH}/`, 'GET')).toBe(true);
  });

  /* A GET and nothing else: there is nothing here to send. */
  it('takes nothing from anybody', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      expect(mayBePublic(EMBED_PATH, method), method).toBe(false);
    }
  });

  /*
   * AND IT OPENS THE PAGE AND NOTHING UNDER IT. `embed` has no
   * dot in it so it cannot be read as the `<id>.<secret>` of an
   * invitation, but anchoring is what keeps that an accident
   * rather than a dependency.
   */
  it('does not open anything below itself', () => {
    expect(mayBePublic('/take/embed/secret', 'GET')).toBe(false);
  });
});

describe('the page a publisher works from', () => {
  const draw = async (address: string | null) => {
    const { default: Embed } = await import('../../app/take/embed/Embed.js');
    return renderToStaticMarkup(createElement(Embed, {
      address,
      ways: address ? embedWays(HERE) : [],
    }));
  };

  /*
   * THE CODE IS ON THE PAGE, IN FULL. Everything offered here is
   * inert markup, so there is nothing to hide — and somebody
   * deciding whether to paste something into their own site is
   * entitled to read it first. A copy button that is the only
   * way to see what you are copying is one nobody careful uses.
   */
  it('shows both snippets, whole, rather than behind a button', async () => {
    const html = await draw(HERE);
    expect(html).toContain('studio.example/take');
    /* The frame's own attribute, escaped into the page, is proof
       the block on screen is the block that gets copied. */
    expect(html).toMatch(/allow=&quot;camera; microphone; fullscreen&quot;/);
    expect(html).toMatch(/rel=&quot;noopener&quot;/);
  });

  /* And drawn, so a publisher sees what lands on their page. */
  it('renders each snippet as well as printing it', async () => {
    const html = await draw(HERE);
    /* The real frame, pointed at the real app. */
    expect(html).toMatch(/<iframe[^>]+src="https:\/\/studio\.example\/take"/);
    expect(html).toMatch(/<iframe[^>]+allow="camera; microphone; fullscreen"/);
  });

  /*
   * NO HOST, NO SNIPPET. An installation behind a proxy that
   * strips its forwarded headers cannot be told what it is
   * called, and a page that guessed would hand a publisher
   * markup pointing at the wrong address — a failure that
   * happens on THEIR site and reads like their mistake. [U-19]
   */
  it('refuses to invent an address it cannot read', async () => {
    const html = await draw(null);
    expect(html).toContain('no public address');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('Copy code');
  });

  /*
   * AND IT IS REACHED FROM THE APP'S OWN HOME, which is the
   * benchmark's decision and the right one: the person who runs
   * a choir, a station or a label is holding this app on their
   * phone when it occurs to them that their own site should
   * carry it. A page nobody can find is a page nobody uses.
   */
  it('is one tap from the Take App’s home screen', async () => {
    const { default: TakeHome } = await import('../../app/take/TakeHome.js');
    const html = renderToStaticMarkup(createElement(TakeHome));
    expect(html).toContain('data-testid="section-embed"');
    expect(html).toMatch(/href="\/take\/embed"/);
  });
});
