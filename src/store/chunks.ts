/**
 * Streamed recording chunks -- the web-safe half of take handling.
 *
 * Deliberately imports nothing that can reach ffmpeg, so the web tier cannot
 * accidentally acquire the ability to run a render (U-23). Assembly lives in
 * store/takes.ts and is worker-only.
 *
 * "Recording streams to durable storage while it records. A crash costs at
 *  most one timeslice."  [Doctrine U-06]
 */

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from './paths.js';

export async function appendChunk(
  conversationId: string, takeId: string, index: number, data: Uint8Array,
): Promise<{ index: number; bytes: number }> {
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) {
    throw new Error(`bad chunk index ${index}`);
  }
  const dir = paths.chunks(conversationId, takeId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${String(index).padStart(6, '0')}.part`), data);
  return { index, bytes: data.byteLength };
}

/** Used on reopen to detect orphaned chunk sets and offer them back. [U-06 §3] */
export async function chunkStatus(
  conversationId: string, takeId: string,
): Promise<{ count: number; bytes: number }> {
  try {
    const dir = paths.chunks(conversationId, takeId);
    const names = (await readdir(dir)).filter((n) => n.endsWith('.part'));
    let bytes = 0;
    for (const name of names) bytes += (await stat(join(dir, name))).size;
    return { count: names.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}
