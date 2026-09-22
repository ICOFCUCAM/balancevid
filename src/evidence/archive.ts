/**
 * Evidence archiving.  [Doctrine U-33 §1, D-06]
 *
 * "Evidence is archived at attach time. A snapshot is captured and stored with
 *  URL, retrieval timestamp, content hash, and title. The citation remains
 *  verifiable after the source changes."
 *
 * A linked page that has changed or disappeared is worse than no citation: it
 * damages the credibility of the person who cited it, which is the opposite of
 * what the feature exists for.
 *
 * Worker-only. It opens sockets and spawns a browser, neither of which the web
 * tier is allowed to do.
 */

import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceKind } from '../domain/document.js';
import { sha256 } from '../domain/ids.js';
import { ffmpeg } from '../render/ffmpeg.js';
import { assertPublicUrl } from './ssrf.js';

/** The installed browser. Overridable, because builds move. */
const CHROMIUM = process.env['BALANCEVID_CHROMIUM']
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const CAPTURE_WIDTH = 1280;
const CAPTURE_TIMEOUT_MS = 25_000;

export interface ArchiveResult {
  /** A PNG the renderer can show and zoom into. Absent when none is possible. */
  capturePath?: string;
  /** The bytes as retrieved, when we hold them. */
  originalPath?: string;
  contentHash: string;
  title: string;
  retrievedAt: string;
  /** Stated limits, so nothing pretends to have archived more than it did. */
  note?: string;
}

/**
 * Archive a web page: a full-page screenshot, the HTML as retrieved, a hash,
 * and the title as the page gave it.
 */
export async function archiveWeb(url: string, outDir: string, assetId: string): Promise<ArchiveResult> {
  const safe = await assertPublicUrl(url);
  await mkdir(outDir, { recursive: true });

  const { chromium } = await import('playwright');
  const executablePath = (await exists(CHROMIUM)) ? CHROMIUM : undefined;
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: CAPTURE_WIDTH, height: 1400 },
      // Identify honestly. A crawler that lies about what it is has no place
      // in a product whose subject is accountability.
      userAgent: 'BalanceVid/0.1 (evidence archiver; +https://github.com/ICOFCUCAM/balancevid)',
    });
    const page = await context.newPage();
    await page.goto(safe.toString(), { waitUntil: 'load', timeout: CAPTURE_TIMEOUT_MS });
    // Let late layout settle without waiting on analytics that never idle.
    await page.waitForTimeout(1200);

    const title = (await page.title())?.trim() || safe.hostname;
    const capturePath = join(outDir, `${assetId}.png`);
    await page.screenshot({ path: capturePath, fullPage: true });

    const html = await page.content();
    const originalPath = join(outDir, `${assetId}.html`);
    await writeFile(originalPath, html, 'utf8');

    return {
      capturePath,
      originalPath,
      // The hash covers the page's text as retrieved, which is what a reader
      // would want to verify -- not the pixels, which vary with the renderer.
      contentHash: sha256(html),
      title,
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

/**
 * Archive an uploaded file.
 *
 * Images are normalised to PNG so the compositor has one thing to handle.
 * Paged documents are kept and hashed, but this build has no rasteriser, so
 * they carry no visual capture — the citation is complete, the render simply
 * has nothing to show. That limit is recorded rather than hidden.
 */
export async function archiveUpload(
  sourcePath: string, kind: EvidenceKind, outDir: string, assetId: string, title: string,
): Promise<ArchiveResult> {
  await mkdir(outDir, { recursive: true });
  const bytes = await readFile(sourcePath);
  const contentHash = sha256(bytes);
  const retrievedAt = new Date().toISOString();

  const originalPath = join(outDir, `${assetId}.original`);
  await copyFile(sourcePath, originalPath);

  if (kind !== 'image') {
    return {
      originalPath, contentHash, title, retrievedAt,
      note: 'stored and hashed; this build cannot render a page of this format',
    };
  }

  const capturePath = join(outDir, `${assetId}.png`);
  await mkdir(dirname(capturePath), { recursive: true });
  await ffmpeg([
    '-i', sourcePath,
    // Bound the size: a 40-megapixel photo is a memory problem in the
    // compositor and adds nothing a viewer can see.
    '-vf', `scale='min(2000,iw)':-2:flags=lanczos`,
    '-frames:v', '1',
    capturePath,
  ]);

  return { capturePath, originalPath, contentHash, title, retrievedAt };
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
