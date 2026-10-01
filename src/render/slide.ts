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

const CHROMIUM = process.env['BALANCEVID_CHROMIUM']
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** 16:9 at the house height, so a slide fills the frame without scaling. */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

/**
 * What a slide can be.
 *
 * Four, and no more, because a slide editor with thirty controls is a slide
 * editor somebody uses to make an ugly slide. Each is a layout that is hard
 * to make look bad: a title card, words, a picture with a caption, and a
 * quotation. "Diverse presentation building" is served by the four being
 * different from each other, not by each being adjustable.
 */
export type SlideLayout = 'title' | 'text' | 'picture' | 'quote';

export interface SlideSpec {
  layout: SlideLayout;
  heading?: string;
  /** Body text. Blank lines separate paragraphs; `- ` starts a bullet. */
  body?: string;
  /** A small line under everything: an attribution, a source, a date. */
  footnote?: string;
  /** A library image, read from disk and inlined. Never fetched. */
  picturePath?: string;
  /**
   * FILL THE FRAME, rather than fit inside it.  [CHANNEL §20, C-25]
   *
   * The two honest things to do with somebody else's photograph on a
   * 16:9 slide, and a broadcast wants both: a chart or a screenshot
   * must be WHOLE, and a landscape behind a caption should reach the
   * edges. Fitting is the default because losing the edge of a chart
   * is worse than a letterboxed photograph.
   *
   * These two and no crop handle. A crop rectangle is a picture editor,
   * and this panel is a thing an operator uses between two cues.
   */
  fill?: boolean;
  /** The channel's ink, so an authored slide looks like the channel. */
  ink?: string;
}

/**
 * Text becomes paragraphs, bullets and numbered points.
 *
 * AND NOTHING ELSE IS INTERPRETED, which is a decision and not an
 * omission. The four layouts exist so that a slide is hard to make
 * ugly; bold, italics, alignment and line spacing are the controls
 * that make it easy. A numbered list is the one addition that is
 * STRUCTURE rather than decoration — the same kind of thing a bullet
 * is — so it is here and the rest is not. [C-25]
 */
function bodyHtml(body: string): string {
  const blocks = body.split(/\n\s*\n/).filter((block) => block.trim());
  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.every((line) => line.startsWith('- '))) {
      return `<ul>${lines.map(
        (line) => `<li>${escape(line.slice(2))}</li>`).join('')}</ul>`;
    }
    /* `1. `, `2. ` — and the numbers are the AUTHOR'S, started from
       whatever they typed, because a list continuing from six in a
       previous slide is a real thing a presenter does. */
    if (lines.every((line) => /^\d+[.)]\s/.test(line))) {
      const first = Number(/^(\d+)/.exec(lines[0] ?? '')?.[1] ?? 1);
      return `<ol start="${first}">${lines.map(
        (line) => `<li>${escape(line.replace(/^\d+[.)]\s+/, ''))}</li>`,
      ).join('')}</ol>`;
    }
    return `<p>${escape(lines.join(' '))}</p>`;
  }).join('');
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The page a slide is.
 *
 * Exported so a test can read it without launching a browser — the layout
 * rules are worth asserting on, and asserting on them through a screenshot
 * would be asserting on a font.
 */
export function slideHtml(spec: SlideSpec, pictureDataUrl?: string): string {
  const ink = spec.ink && /^#[0-9a-f]{3,8}$/i.test(spec.ink) ? spec.ink : '#ffffff';
  const heading = spec.heading ? escape(spec.heading) : '';
  const body = spec.body ? bodyHtml(spec.body) : '';
  const footnote = spec.footnote ? escape(spec.footnote) : '';

  const inner = spec.layout === 'title'
    ? `<div class="mid"><h1 class="big">${heading}</h1>
       ${body ? `<div class="sub">${body}</div>` : ''}</div>`
    : spec.layout === 'quote'
      ? `<div class="mid"><blockquote>${body || heading}</blockquote>
         ${footnote ? `<div class="by">— ${footnote}</div>` : ''}</div>`
      : spec.layout === 'picture'
        ? `${heading ? `<h1>${heading}</h1>` : ''}
           <div class="shot${spec.fill ? ' bleed' : ''}">${pictureDataUrl
             ? `<img src="${pictureDataUrl}" alt="">`
             : '<div class="hole">no picture</div>'}</div>
           ${body ? `<div class="cap">${body}</div>` : ''}`
        : `${heading ? `<h1>${heading}</h1>` : ''}<div class="words">${body}</div>`;

  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;overflow:hidden}
  body{background:#0b0d10;color:${ink};
    font:400 40px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    padding:96px 120px;display:flex;flex-direction:column;gap:36px}
  .mid{margin:auto;text-align:center;display:flex;flex-direction:column;gap:32px}
  h1{font-size:76px;line-height:1.1;font-weight:700;letter-spacing:-0.5px}
  .big{font-size:108px}
  .sub{font-size:44px;opacity:0.72}
  .words{font-size:46px;display:flex;flex-direction:column;gap:28px;
    overflow:hidden}
  p{margin:0}
  ul,ol{margin:0;padding-left:1.1em;display:flex;flex-direction:column;gap:20px}
  blockquote{font-size:64px;line-height:1.3;font-style:italic;max-width:24ch;
    margin:0 auto}
  .by{font-size:34px;opacity:0.7}
  .shot{flex:1;min-height:0;display:grid;place-items:center}
  .shot img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}
  .shot.bleed{width:100%}
  .shot.bleed img{width:100%;height:100%;max-width:none;max-height:none;
    object-fit:cover}
  .hole{opacity:0.4;font-size:32px}
  .cap{font-size:32px;opacity:0.75}
  </style><body>${inner}</body>`;
}

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
): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true });

  let pictureDataUrl: string | undefined;
  if (spec.picturePath && await exists(spec.picturePath)) {
    /*
     * Inlined as bytes rather than linked as a path. The page has no network
     * and no file access; handing it a `file://` would be handing it the
     * disk.
     */
    const bytes = await readFile(spec.picturePath);
    const type = spec.picturePath.toLowerCase().endsWith('.png')
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
