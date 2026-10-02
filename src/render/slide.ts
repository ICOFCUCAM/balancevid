/**
 * Slides, written rather than uploaded.  [Doctrine CHANNEL §21, §20, D-19]
 *
 *     title + words + a picture  →  HTML  →  Chromium  →  slide.png
 *
 * THE OUTPUT IS THE SAME THING AN UPLOAD PRODUCES. A composed slide is a
 * library PNG at the house size, exactly like a page of somebody's
 * PowerPoint, so nothing downstream can tell the difference: the playout
 * engine broadcasts it, the monitor draws it, the schedule holds it and the
 * deck orders it by the same code. Authoring adds a way to MAKE a slide and
 * not a second kind of slide. [§20]
 *
 * WHY CHROMIUM AND NOT ffmpeg's SUBTITLE RENDERER. The share cards and claim
 * cards in `thumbnails.ts` are drawn with ASS, which is right for them: one
 * block of text at a known size, and no browser needed. A slide is a layout
 * — a heading, a body that wraps, bullets, and a picture that has to sit
 * beside them — and expressing that in ASS would be writing a layout engine
 * in subtitle syntax. Chromium is already required to turn a PDF into pages
 * (`pages.ts`), so a deck feature that uses it adds no dependency the deck
 * feature did not already have. A build with `WITH_BROWSER=0` loses both
 * together, and says so.
 *
 * IT FETCHES NOTHING. The page is given its content and its pictures as
 * bytes, and every request it might make is aborted — the same rule the PDF
 * rasteriser follows, for the same reason: what is being rendered is text
 * somebody typed, and a renderer that can be made to fetch a URL is a
 * renderer that can be made to leak. [D-06]
 */

import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { SLIDE_HEIGHT, SLIDE_WIDTH, slideHtml, type SlideSpec } from './slideDesign.js';

const CHROMIUM = process.env['BALANCEVID_CHROMIUM']
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/*
 * THE DESIGN SYSTEM AND THE COMPOSITIONS LIVE NEXT DOOR, in
 * `slideDesign.ts`, which imports nothing. [C-26]
 *
 * This module opens a browser, so it imports `node:fs`; a control room
 * that wants to show the operator what they are about to transmit
 * cannot. Splitting the pure half out is what makes the preview and
 * the transmission ONE layout calculation rather than two stylesheets
 * that agree today. Re-exported here so every existing caller — the
 * worker, the route, the tests — keeps the import it had.
 */
export {
  ACTION_SAFE, BACKGROUNDS, FACE, SLIDE_HEIGHT, SLIDE_WIDTH, STEP, TITLE_SAFE,
  TYPE, colourOr, contrast, presetFor, sameColour, slideHtml, slideProblems,
} from './slideDesign.js';
export type {
  Background, Focus, Preset, SlideLayout, SlideProblem, SlideSpec,
} from './slideDesign.js';

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}

/**
 * Draw one slide.
 *
 * Worker-only, like every other thing in this codebase that opens a browser
 * or shells out. [U-23]
 */
export async function renderSlide(
  spec: SlideSpec, outPath: string,
  /*
   * WHERE THE NAMED PICTURE ACTUALLY IS, resolved by the caller.
   *
   * The spec names a library asset rather than a path, because a
   * stored definition has to mean the same thing on another machine
   * (§3, D-18). Turning that name into a file is the worker's job —
   * it owns the library — and this module's job is to draw.
   */
  picturePath?: string,
): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true });

  let pictureDataUrl: string | undefined;
  if (picturePath && await exists(picturePath)) {
    /*
     * Inlined as bytes rather than linked as a path. The page has no network
     * and no file access; handing it a `file://` would be handing it the
     * disk.
     */
    const bytes = await readFile(picturePath);
    const type = picturePath.toLowerCase().endsWith('.png')
      ? 'image/png' : 'image/jpeg';
    pictureDataUrl = `data:${type};base64,${bytes.toString('base64')}`;
  }

  const { chromium } = await import('playwright');
  const executablePath = (await exists(CHROMIUM)) ? CHROMIUM : undefined;
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      deviceScaleFactor: 1,
    });
    /* Nothing is fetched. What is being rendered is untrusted text. [D-06] */
    await page.route('**/*', (route) => {
      if (route.request().url().startsWith('data:')) return route.continue();
      return route.abort();
    });
    await page.setContent(slideHtml(spec, pictureDataUrl),
      { waitUntil: 'load' });
    await page.screenshot({ path: outPath, type: 'png' });
    return outPath;
  } finally {
    await browser.close();
  }
}
