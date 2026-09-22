/**
 * HTTP helpers shared by the route handlers.
 *
 * Deliberately small: the web tier's job is to read and write the document and
 * enqueue work. It never renders (U-23), and it never decides anything the
 * domain can decide.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ReadableOptions } from 'node:stream';

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, { status });
}

/**
 * Serve a file with byte-range support.
 *
 * Range is not optional for this product: without it the player cannot seek,
 * and a user who cannot scrub cannot find the moment they want to interrupt.
 */
export async function serveFile(request: Request, path: string, contentType: string): Promise<Response> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return fail(404, 'not found');
  }

  const range = request.headers.get('range');
  const common = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0, must-revalidate',
  };

  if (!range) {
    return new Response(toWebStream(path), {
      status: 200,
      headers: { ...common, 'content-length': String(size) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return fail(416, 'malformed range');
  const startRaw = match[1] ?? '';
  const endRaw = match[2] ?? '';
  let start = startRaw ? Number(startRaw) : 0;
  let end = endRaw ? Number(endRaw) : size - 1;
  if (!startRaw && endRaw) { start = Math.max(0, size - Number(endRaw)); end = size - 1; }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);

  return new Response(toWebStream(path, { start, end }), {
    status: 206,
    headers: {
      ...common,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${size}`,
    },
  });
}

function toWebStream(path: string, options?: ReadableOptions & { start?: number; end?: number }): ReadableStream {
  const node = createReadStream(path, options);
  return new ReadableStream({
    start(controller) {
      node.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      node.on('end', () => controller.close());
      node.on('error', (error) => controller.error(error));
    },
    cancel() { node.destroy(); },
  });
}
