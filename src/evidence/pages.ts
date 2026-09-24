/**
 * Paged documents, one page at a time.  [Doctrine U-33 §2]
 *
 * A lecture is taught from a deck, not from a single image, and the doctrine's
 * evidence locator has carried `page?: number` — "1-based, for paged
 * documents" — since it was written. This is the part that makes the number
 * mean something: a PDF arrives, and every page of it becomes a picture the
 * compositor can show and zoom into.
 *
 * WHY pdf.js AND NOT A NATIVE TOOL. Rasterising a PDF is normally poppler or
 * ghostscript, and neither is in the image. Chromium is — it archives web
 * evidence already — and pdf.js draws a PDF page onto an ordinary canvas.
 * Running it inside the browser we already ship costs no new binary, no
 * native compilation, and no second answer to "what does this page look
 * like": the same engine that shows a page in the editor draws the one that
 * goes into the video.
 *
 * Worker-only. It spawns a browser, which the web tier is not allowed to do.
 */

import { execFile } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const CHROMIUM = process.env['BALANCEVID_CHROMIUM']
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * Wide enough to read a dense slide at 1080p, and no wider.
 *
 * The compositor zooms into a region of this, so it needs headroom above the
 * panel it lands in — but a 4K page of a 60-page deck is a quarter of a
 * gigabyte of PNG for something nobody will look at that closely.
 */
export const PAGE_WIDTH = 1600;

/**
 * More than this and something has gone wrong, or the author has attached a
 * book. Either way it is not a citation, and rasterising it would take the
 * worker out of service for the conversation it belongs to.
 */
export const MAX_PAGES = 120;

export interface PagedResult {
  /** One PNG per page, in order. */
  pagePaths: string[];
  pageCount: number;
  /** Stated when the document had more pages than were rendered. */
  note?: string;
}

/**
 * Rasterise every page of a PDF.
 *
 * Returns paths in page order, so index 0 is page 1 — the locator is 1-based
 * because that is how people number pages, and the conversion happens once,
 * here and at the point of use, rather than being carried around.
 */
export async function rasterisePdf(
  pdfPath: string, outDir: string, assetId: string,
): Promise<PagedResult> {
  await mkdir(outDir, { recursive: true });
  const bytes = await readFile(pdfPath);

  const require = createRequire(import.meta.url);
  const pdfJsPath: string = require.resolve('pdfjs-dist/build/pdf.mjs');
  const workerPath: string = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
  const [pdfJs, pdfWorker] = await Promise.all([
    readFile(pdfJsPath, 'utf8'), readFile(workerPath, 'utf8'),
  ]);

  const { chromium } = await import('playwright');
  const executablePath = (await exists(CHROMIUM)) ? CHROMIUM : undefined;
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    /*
     * A blank page with no network of its own. The PDF never leaves this
     * machine, and the renderer cannot be made to fetch anything on its
     * behalf — an attached document is untrusted input (D-06).
     */
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');

    await page.addScriptTag({ content: pdfJs, type: 'module' });
    await page.waitForFunction(() => Boolean((window as any).pdfjsLib), null, { timeout: 20_000 });

    const count = await page.evaluate(async ({ data, worker }) => {
      const lib = (window as any).pdfjsLib;
      // The worker as a blob URL: pdf.js will not run its parser on the main
      // thread by default, and there is no server here to serve it from.
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
        new Blob([worker], { type: 'text/javascript' }));
      const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const doc = await lib.getDocument({ data: raw }).promise;
      (window as any).__doc = doc;
      return doc.numPages as number;
    }, { data: bytes.toString('base64'), worker: pdfWorker });

    const rendered = Math.min(count, MAX_PAGES);
    const pagePaths: string[] = [];
    for (let n = 1; n <= rendered; n++) {
      const dataUrl = await page.evaluate(async ({ index, width }) => {
        const doc = (window as any).__doc;
        const pdfPage = await doc.getPage(index);
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d')!;
        // White behind it: a PDF page is paper, and a transparent PNG
        // composited over a dark stage is unreadable.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
      }, { index: n, width: PAGE_WIDTH });

      const outPath = join(outDir, `${assetId}p${n}.png`);
      await writeFile(outPath, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
      pagePaths.push(outPath);
    }

    return {
      pagePaths,
      pageCount: rendered,
      ...(count > rendered
        ? { note: `${count} pages; the first ${rendered} were prepared` }
        : {}),
    };
  } finally {
    await browser.close();
  }
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

/* --- office documents ---------------------------------------------------- */

/**
 * The formats LibreOffice can turn into pages, when it is installed.
 *
 * Deliberately a list and not "anything soffice accepts": an unknown
 * extension handed to a converter is a way to spend two minutes of a worker
 * discovering it cannot be done.
 */
const OFFICE_EXTENSIONS = new Set([
  '.pptx', '.ppt', '.odp', '.docx', '.doc', '.odt', '.rtf', '.xlsx', '.ods',
]);

export function isOfficeDocument(path: string): boolean {
  return OFFICE_EXTENSIONS.has(extname(path).toLowerCase());
}

const SOFFICE = process.env['BALANCEVID_SOFFICE'] ?? 'soffice';
const CONVERT_TIMEOUT_MS = 180_000;

/**
 * Is a converter available in this deployment?
 *
 * LibreOffice is a large install and the image is kept small on purpose, so
 * it is optional — and the answer has to be discovered rather than assumed.
 * A build that ships without it must say "export it as a PDF" rather than
 * accept a deck and quietly produce nothing.
 */
export async function officeConverterAvailable(): Promise<boolean> {
  try {
    await run(SOFFICE, ['--version'], { timeout: 20_000 });
    return true;
  } catch { return false; }
}

/**
 * A deck or a document, by way of PDF.  [Doctrine U-33 §2]
 *
 * LibreOffice renders it to PDF and pdf.js takes it from there, so a deck and
 * a PDF reach the compositor by the same path and look the same when they get
 * there. Rendering PowerPoint directly would be a second renderer for slides,
 * with its own idea of where the text sits.
 */
export async function rasteriseOffice(
  docPath: string, outDir: string, assetId: string,
): Promise<PagedResult> {
  await mkdir(outDir, { recursive: true });
  const pdfDir = join(outDir, `${assetId}.pdfwork`);
  await mkdir(pdfDir, { recursive: true });

  await run(SOFFICE, [
    '--headless', '--norestore',
    // Its own profile directory: two conversions sharing one profile is how
    // a second job silently does nothing.
    `-env:UserInstallation=file://${join(pdfDir, 'profile')}`,
    '--convert-to', 'pdf', '--outdir', pdfDir, docPath,
  ], { timeout: CONVERT_TIMEOUT_MS });

  const produced = (await readdir(pdfDir)).find((f) => f.toLowerCase().endsWith('.pdf'));
  if (!produced) {
    throw new Error(`could not turn ${basename(docPath)} into pages`);
  }
  return rasterisePdf(join(pdfDir, produced), outDir, assetId);
}
