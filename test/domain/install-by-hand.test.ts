/**
 * What a surface SHOWS somebody who cannot be offered an install.
 *   [TAKE-APP T13a; TAKE-PLATFORM P6; TV-NETWORK N-9; D-19, U-02, U-19]
 *
 * THESE RENDER THE COMPONENTS AND READ WHAT CAME OUT, which is the
 * whole reason the file exists. The first version of this work was
 * tested by searching the component sources for the right strings,
 * and nine mutations later two of them were still passing with the
 * feature switched off at its call site — `{false && <HowToKeepIt
 * />}` leaves every string in the file. This product has been
 * bitten by exactly that twice before: a studio tab whose fix was
 * inert because the renderer returned before reaching it, and a
 * route test that matched the 404 branch's content type. A test
 * that a file CONTAINS something is not a test that a person SEES
 * it. [U-02]
 *
 * THE FAULT BEING DEFENDED was measured in a browser before a line
 * was written. An Android phone with an invitation open inside a
 * chat app was driven through the built product: `/take` offered
 * no install control — correctly, because `beforeinstallprompt`
 * never fires there and a control that cannot act looks like a
 * fault — its one remaining door was the quiet "Get the Take App"
 * line, that door led to `/downloads`, and the download centre's
 * first card led back to `/take` saying the app "installs to your
 * home screen from the app itself". Three screens, no instruction,
 * and nobody installs anything.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { InstallWay } from '../../src/domain/getTheApp.js';

/* The one place the surfaces ask, so the one thing to stand in for. */
const ANDROID: InstallWay = {
  on: 'android',
  says: 'THE ONE LINE',
  steps: ['THE FIRST TAP', 'THE SECOND TAP', 'THE THIRD TAP'],
};

interface State {
  offered: boolean; teach: boolean; gone: boolean; installed: boolean;
  way: InstallWay | null;
}

const NOTHING_DOING: State = {
  offered: false, teach: false, gone: false, installed: false, way: null,
};

let state: State = { ...NOTHING_DOING };

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('../../app/useInstallOffer.js', () => ({
  PATIENCE: 1500,
  useInstallOffer: () => ({ ...state, install: async () => {}, dismiss: () => {} }),
}));

afterEach(() => { state = { ...NOTHING_DOING }; });

/**
 * Every surface that offers the app, rendered the same way.
 *
 * NAMED BY WHAT A PERSON IS LOOKING AT and not by the file,
 * because the claim is about four screens rather than four
 * modules — and because the television network turned out to
 * have the identical hole in it, which is the sort of thing a
 * list like this is for. [D-19]
 */
const SURFACES: {
  screen: string;
  /** What the browser's own prompt looks like here, where there is one. */
  prompt?: string;
  /**
   * The line or the steps.
   *
   * DECLARED RATHER THAN ACCEPTED EITHER WAY, which a mutation
   * taught: a test happy with `says` OR the steps passed with
   * `steps.slice(0, 1)` in the download centre — one tap of
   * three, which on a chat browser is the tap that does nothing
   * on its own. A header has room for a line and a card has room
   * for three; which is which is each surface's business, and
   * having none of it is nobody's. [U-02]
   */
  shows: ('line' | 'steps')[];
  /**
   * The sentence this surface already had for an iPhone, where it
   * has one.
   *
   * TWO SURFACES CARRY THEIR OWN AND TWO DO NOT, and that
   * difference is the whole reason the hook stopped withholding
   * `way` from iOS. A surface with its own words shows them; one
   * without shows the steps; neither shows both.
   */
  iosWords?: string;
  draw: () => Promise<string>;
}[] = [
  {
    screen: 'the Take App’s own home',
    shows: ['line'],
    prompt: 'take-home-install',
    iosWords: 'Share → Add to Home Screen',
    draw: async () => {
      const { default: TakeHome } = await import('../../app/take/TakeHome.js');
      return renderToStaticMarkup(createElement(TakeHome));
    },
  },
  {
    screen: 'an invitation opened on a phone',
    shows: ['steps'],
    prompt: 'take-install-go',
    draw: async () => {
      const { default: InstallBar } = await import('../../app/take/[link]/InstallBar.js');
      return renderToStaticMarkup(createElement(InstallBar));
    },
  },
  {
    screen: 'the download centre',
    /* The card names what the steps achieve and then gives them:
       "Open this page in your browser first" is the half a person
       inside a chat app most needs. */
    shows: ['line', 'steps'],
    draw: async () => {
      const { default: DownloadCentre } = await import('../../app/downloads/DownloadCentre.js');
      return renderToStaticMarkup(
        createElement(DownloadCentre, { releases: [], gate: 'open' as const }),
      );
    },
  },
  {
    screen: 'the television network',
    shows: ['line'],
    prompt: 'tv-install',
    iosWords: 'Share → Add to Home Screen',
    draw: async () => {
      const { TvFrame } = await import('../../app/tv/Tv.js');
      return renderToStaticMarkup(
        createElement(TvFrame, { here: '/tv', children: null }),
      );
    },
  },
];

describe('a browser that will never offer an install', () => {
  for (const { screen, prompt, shows, iosWords, draw } of SURFACES) {
    it(`is told what to do on ${screen}`, async () => {
      state = { ...NOTHING_DOING, way: ANDROID };
      const html = await draw();
      if (shows.includes('line')) {
        expect(html, `${screen} dropped the line`).toContain(ANDROID.says);
      }
      if (shows.includes('steps')) {
        /* ALL of them. One tap of three is the tap that does
           nothing on its own. */
        for (const step of ANDROID.steps) {
          expect(html, `${screen} dropped a step`).toContain(step);
        }
      }
    });

    /*
     * AND THE REAL PROMPT WHERE THERE IS ONE, which is the other
     * half of the same claim: on Chromium the button is the far
     * better door and the steps must not displace it.
     *
     * THE STATE IS `offered` WITH NO `way`, because that is the
     * only state the hook can produce — it answers `null` for
     * `way` the moment a prompt exists, so that two surfaces
     * cannot come to two conclusions about which wins. An earlier
     * version of this test set BOTH and failed, which was the
     * test inventing a situation rather than the code getting one
     * wrong. [D-19]
     */
    if (prompt) {
      it(`gives the browser’s own prompt instead, on ${screen}`, async () => {
        state = { ...NOTHING_DOING, offered: true, way: null };
        const html = await draw();
        expect(html).toContain(prompt);
        expect(html).not.toContain(ANDROID.steps[0]);
      });
    }

    /*
     * A PHONE THAT ALREADY HAS THE APP IS NOT TESTED HERE, which
     * is deliberate. Rendering with `installed: true` and a
     * `way` the hook would never have handed over tests the
     * stand-in rather than the product — and no mutation of any
     * surface could kill it. That promise is the hook's, and it
     * is asserted there. [U-02, get-the-app.test.ts]
     */
  }
});

/**
 * THE IPHONE THAT WAS SHOWN NOTHING.
 *
 * `teach` is iOS Safari, and two of these surfaces carry their
 * own wording for it — so the hook used to withhold `way`
 * wherever `teach` was true. That assumed every surface had iOS
 * words of its own. The download centre has none, so an iPhone
 * arriving there was given nothing while an Android was given
 * three steps, and the page that exists to end the circle only
 * ended it for half the phones in the world. Found by driving an
 * iPhone through the built pages. [U-02]
 */
describe('an iPhone, which has a share sheet and no install event', () => {
  const IOS: InstallWay = {
    on: 'ios',
    says: 'THE SHARE LINE',
    steps: ['OPEN THE SHARE SHEET', 'ADD IT TO THE HOME SCREEN', 'CONFIRM IT'],
  };

  for (const { screen, iosWords, draw } of SURFACES) {
    it(`is told how, on ${screen}`, async () => {
      state = { ...NOTHING_DOING, teach: true, way: IOS };
      const html = await draw();

      if (iosWords) {
        /*
         * ITS OWN SENTENCE, AND ONLY THAT. A header carrying both
         * its line and the three steps is a surface arguing with
         * itself about which it is.
         */
        expect(html, `${screen} lost its own iOS line`).toContain(iosWords);
        expect(html, `${screen} said it twice`).not.toContain(IOS.says);
        expect(html).not.toContain(IOS.steps[0]);
      } else {
        /*
         * AND THE STEPS WHERE THERE ARE NO OWN WORDS. The hook
         * used to withhold `way` from every iOS browser, which
         * assumed every surface had a sentence for them. The
         * download centre — the page that exists to end the
         * circle — had none, so an iPhone arriving there was
         * shown nothing while an Android was given three steps.
         * Found by driving an iPhone through the built pages.
         * [U-02]
         */
        expect(html, `${screen} showed an iPhone nothing`)
          .toContain(IOS.steps[0]);
      }
    });
  }
});
