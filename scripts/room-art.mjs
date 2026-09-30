/**
 * The three rooms, as photographs.  [D-24, U-19; DESIGN "the doors"]
 *
 * WHAT THE AUTHOR UPLOADED IS THE MASTER, AND IT IS NOT WHAT SHIPS.
 * `Conversational Studio.png` is 1892 kB of 1671x941 PNG for a band of
 * a card that is never taller than about 130 CSS pixels. Three of them
 * is six megabytes, and they arrived in `public/`, which means every
 * deploy carried them and anybody could fetch two megabytes of PNG to
 * look at a thumbnail.
 *
 * SO THE MASTERS MOVED TO `art/`, WHICH IS NOT SERVED. They are still
 * in the repository — a derivative whose master is gone is a
 * derivative nobody can re-cut at a different size — but `public/`
 * now holds only the 250 kB that the page actually asks for.
 *
 * SO THE MASTERS STAY AND THE DERIVATIVES SHIP. This script is the
 * only thing that turns one into the other, the way `take-icons.mjs`
 * is the only thing that draws the Take App's icons: a derivative
 * nobody can reproduce is a binary somebody will eventually edit by
 * hand and then not be able to explain.
 *
 *   node scripts/room-art.mjs
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'rooms');

/*
 * WIDE ENOUGH FOR THE WIDEST CARD ON THE SHARPEST SCREEN, AND NO WIDER.
 * A studio card is at most about 460 CSS pixels across when an account
 * owns one studio and the column is wide; 1400 covers that at 3x. The
 * band crops with `object-fit: cover`, so the height only has to be
 * enough that a 2.2:1 crop of it is still oversampled.
 */
const WIDTH = 1400;

const ROOMS = [
  { from: 'Conversational Studio.png', to: 'conversation.webp' },
  { from: 'Performance Studio.png', to: 'performance.webp' },
  { from: 'OnlineTV.png', to: 'online-tv.webp' },
];

mkdirSync(OUT, { recursive: true });

for (const room of ROOMS) {
  const file = join(OUT, room.to);
  const info = await sharp(join(ROOT, 'art', room.from))
    .resize({ width: WIDTH, withoutEnlargement: true })
    /*
     * QUALITY 74 ON A PHOTOGRAPH THAT IS NEVER LOOKED AT CLOSELY. It
     * sits behind a colour veil at a tenth of its master's area; the
     * artefacts WebP leaves at 74 are smaller than one card pixel.
     */
    .webp({ quality: 74 })
    .toFile(file);
  console.log(
    `${room.to}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} kB`);
}
