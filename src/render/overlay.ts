/**
 * The marks, rasterised.  [CHANNEL §13, D-16, U-23, C-24, C-26, C-40]
 *
 * A transparent PNG of the channel's own graphics, drawn by the
 * browser the slides already use, composited over the programme by
 * `overlay` — a filter every ffmpeg has, unlike `drawtext`, which
 * the one this product ships does not.
 *
 * CACHED ON WHAT THE MARKS SAY, which is what makes this affordable.
 * The engine produces a segment every four seconds; the marks change
 * when the programme changes, when somebody is cited, or when the
 * lower third's eight seconds run out. So the same overlay is used
 * for a hundred segments and drawn once, and the key is the marks
 * themselves rather than a clock.
 *
 * AND IT IS NEVER WAITED FOR. The first segment that wants a new
 * overlay asks for it and goes out without it; the next one has it.
 * That is the same shape as the loudness queue (C-33) and for the
 * same reason: a channel that paused for a browser to start would be
 * a channel that stuttered every time its caption changed. Four
 * seconds of a correct picture with last moment's caption beats four
 * seconds of nothing.
 */

import { mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { Mark } from '../domain/identity.js';
import { type Frame, marksHtml } from './markDesign.js';

const CHROMIUM = process.env['BALANCEVID_CHROMIUM']
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * What makes two sets of marks the same set.
 *
 * THE TEXT AND THE PLACE, which is everything the page draws from.
 * A key over the whole object would be the same thing more
 * expensively; a key over the text alone would reuse a bug's overlay
 * for a lower third.
 */
export function overlayKey(marks: readonly Mark[], frame: Frame): string {
  const said = JSON.stringify([frame.width, frame.height, marks]);
  return createHash('sha1').update(said).digest('hex').slice(0, 20);
}

/** Drawn and on disk. */
const drawn = new Map<string, string>();
/** Being drawn. One browser at a time, however many segments ask. */
const drawing = new Set<string>();

/**
 * Draw the marks, or say there is nothing to draw yet.
 *
 * Returns a path only when the overlay already exists. Anything else
 * — not drawn, being drawn, or a build with no browser — returns
 * nothing, and the segment goes out clean. A channel without its bug
 * for four seconds is a channel; a channel that stalls is not.
 */
export function overlayNow(
  marks: readonly Mark[], frame: Frame, into: string,
): string | undefined {
  if (marks.length === 0) return undefined;
  const key = overlayKey(marks, frame);
  const have = drawn.get(key);
  if (have) return have;
  if (!drawing.has(key)) {
    drawing.add(key);
    void draw(marks, frame, join(into, `${key}.png`))
      .then((path) => { if (path) drawn.set(key, path); })
      .catch(() => undefined)
      .finally(() => drawing.delete(key));
  }
  return undefined;
}

/**
 * Actually draw one.
 *
 * Worker-side, like everything here that opens a browser (U-23). The
 * page is given no network and no disk: what it renders is a
 * channel's own title and a presenter's name, which is text somebody
 * typed. [D-06]
 */
export async function draw(
  marks: readonly Mark[], frame: Frame, outPath: string,
): Promise<string | undefined> {
  await mkdir(join(outPath, '..'), { recursive: true });
  let browser;
  try {
    const { chromium } = await import('playwright');
    const { access } = await import('node:fs/promises');
    const there = await access(CHROMIUM).then(() => true).catch(() => false);
    browser = await chromium.launch({
      ...(there ? { executablePath: CHROMIUM } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({
      viewport: { width: frame.width, height: frame.height },
      deviceScaleFactor: 1,
    });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(marksHtml(marks, frame), { waitUntil: 'load' });
    /*
     * `omitBackground` IS THE WHOLE THING. Without it the screenshot
     * carries an opaque white page and the overlay covers the
     * programme instead of sitting on it.
     */
    await page.screenshot({ path: outPath, type: 'png', omitBackground: true });
    return outPath;
  } catch {
    /*
     * A BUILD WITH NO BROWSER DRAWS NOTHING, and says so by returning
     * nothing rather than by throwing into the segment that asked.
     * The channel keeps transmitting; it transmits without its
     * identity, which is the same trade C-24 made and no worse.
     */
    return undefined;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/** Forget everything drawn, for a test and for a channel being torn down. */
export async function forgetOverlays(into?: string): Promise<void> {
  drawn.clear();
  drawing.clear();
  if (into) await rm(into, { recursive: true, force: true }).catch(() => undefined);
}

/** For a test and for the control room: how many are cached. */
export function overlaysDrawn(): number { return drawn.size; }
