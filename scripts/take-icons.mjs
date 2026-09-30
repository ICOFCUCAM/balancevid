/*
 * The Take App's home-screen icons.  [TAKE-APP T2c, T13a; D-14, D-19]
 *
 * A PWA that installs needs raster icons, and iOS needs them
 * specifically: `apple-touch-icon` does not take SVG, and neither
 * does a maskable icon on Android in any way worth relying on. So
 * they are PNGs, and they are GENERATED rather than drawn, for the
 * reason `Brand` gives about the mark existing four times: a logo
 * that is hand-exported diverges from the one in the product and the
 * first symptom is nobody noticing.
 *
 * THE MARK IS THE ONE IN `app/Brand.tsx` and the numbers are read
 * straight off it — the same gradient stops, the same white play
 * triangle, the same corner radius in proportion. Change it there and
 * run this; do not edit a PNG.
 *
 *     node scripts/take-icons.mjs
 *
 * THEY DO NOT LIVE UNDER `/take/`, and that is not tidiness. A take
 * link is `/take/<id>.<secret>`, and `public/take/icon-192.png` would
 * be served at a path the link route also matches — an icon that
 * works only because static files are checked first. `/take-app/` is
 * a namespace nothing else claims.
 *
 * PNG IS WRITTEN BY HAND because the alternative is a native image
 * dependency for six small squares. It is a signature, three chunks
 * and a CRC, and zlib is in the standard library.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'public', 'take-app');

/* The mark, exactly as `Brand` draws it. */
const TOP = [0x3f, 0x8e, 0xe8];
const BOTTOM = [0x2a, 0x6f, 0xcc];

/** Supersampling factor. Four is enough for a corner at this size. */
const SS = 4;

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;       // bit depth
  header[9] = 6;       // colour type: RGBA
  /* 10, 11, 12 stay zero: deflate, adaptive filtering, no interlace. */

  /* One filter byte per scanline; 0, because these images are tiny. */
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The mark, at a size, supersampled and boxed down.
 *
 * `inset` is the safe-area margin a MASKABLE icon needs: Android may
 * crop an installed icon to a circle, and a mark drawn to the edges
 * loses its corners. The maskable one is drawn at 60% so anything the
 * platform cuts is background.
 */
function mark(size, { inset = 0, square = false } = {}) {
  const big = size * SS;
  const pixels = Buffer.alloc(big * big * 4);

  const pad = Math.round(big * inset);
  const box = big - pad * 2;
  /* `Brand` uses --radius-md on a small square: about 22% of the side. */
  const radius = square ? 0 : box * 0.22;

  const inside = (x, y) => {
    const lx = x - pad;
    const ly = y - pad;
    if (lx < 0 || ly < 0 || lx >= box || ly >= box) return false;
    const cx = Math.min(Math.max(lx, radius), box - radius);
    const cy = Math.min(Math.max(ly, radius), box - radius);
    const dx = lx - cx;
    const dy = ly - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  /*
   * THE PLAY TRIANGLE, on the same 24-unit grid the icon set uses and
   * optically centred rather than geometrically: a triangle centred on
   * its bounding box reads as sitting too far left, which is the nudge
   * `Brand` removed by using the grid.
   */
  const tw = box * 0.30;
  const th = box * 0.34;
  const tx = pad + box / 2 - tw * 0.42;
  const ty = pad + box / 2 - th / 2;
  const inTriangle = (x, y) => {
    if (x < tx || x > tx + tw || y < ty || y > ty + th) return false;
    const t = (x - tx) / tw;          // 0 at the flat edge, 1 at the point
    const half = (th / 2) * (1 - t);
    return Math.abs(y - (ty + th / 2)) <= half;
  };

  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const at = (y * big + x) * 4;
      if (!inside(x, y)) continue;
      const t = (y - pad) / box;
      const r = Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t);
      const g = Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t);
      const b = Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t);
      const white = inTriangle(x, y);
      pixels[at] = white ? 255 : r;
      pixels[at + 1] = white ? 255 : g;
      pixels[at + 2] = white ? 255 : b;
      pixels[at + 3] = 255;
    }
  }

  /* Box-downsample: the anti-aliasing, and the reason for SS. */
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const at = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          const alpha = pixels[at + 3] / 255;
          r += pixels[at] * alpha;
          g += pixels[at + 1] * alpha;
          b += pixels[at + 2] * alpha;
          a += alpha;
        }
      }
      const at = (y * size + x) * 4;
      out[at] = a ? Math.round(r / a) : 0;
      out[at + 1] = a ? Math.round(g / a) : 0;
      out[at + 2] = a ? Math.round(b / a) : 0;
      out[at + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, size, out);
}

mkdirSync(OUT, { recursive: true });

const written = [];
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), mark(size));
  written.push(`icon-${size}.png`);
}
/* Maskable: drawn inside the safe area, square so the platform's own
   crop decides the shape rather than fighting ours. */
writeFileSync(join(OUT, 'icon-maskable-512.png'),
  mark(512, { inset: 0.16, square: true }));
written.push('icon-maskable-512.png');
/* iOS wants 180 and does not honour `purpose`, so it gets the plain one. */
writeFileSync(join(OUT, 'apple-touch-icon.png'), mark(180));
written.push('apple-touch-icon.png');

console.log(`wrote ${written.length} icons to public/take-app: ${written.join(', ')}`);
