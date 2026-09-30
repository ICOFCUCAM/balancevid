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

/*
 * THE SECOND SET OF MASTERS, AND WHY EACH IS CUT.
 *
 * The author uploaded two banners to replace the first pair. They are
 * not the same kind of file, and neither ships as delivered:
 *
 *   `Studio One Source.png` is a FINISHED BANNER with the room's words
 *   already set into the pixels — "STUDIO ONE / SOURCE → RESPONSE" and
 *   the sentence under it. Shipping that as the hero would put those
 *   words on the page twice, once as type and once as a picture, and
 *   the picture's copy cannot be read by a screen reader, cannot
 *   reflow, and is about eight pixels tall on a phone. So the crop
 *   keeps the PHOTOGRAPH — the microphone and the session beyond it —
 *   and the room's own type is set over it, as it is in the other two.
 *
 *   `Midnight Music Studio Session.png` is a bare photograph in a
 *   letterbox: measured, its content runs from row 174 to row 629 of a
 *   724-row canvas, with white above and below. Left alone, `cover`
 *   would crop to the middle of the white.
 *
 * Online TV keeps its first master; no replacement was sent.
 */
const ROOMS = [
  {
    from: 'Studio One Source.png', to: 'conversation.webp',
    /*
     * THE PHOTOGRAPH, CLEAR OF THE BANNER'S OWN LETTERING, AND WIDE.
     *
     * A 1150x725 crop is 1.6:1 and the hero it feeds is nearer 8:1, so
     * `cover` threw away four fifths of its height and left a band
     * across the middle of the microphone. Cut the band here instead,
     * where the whole frame can be seen while choosing it.
     *
     * AND IT STARTS AT 1105 BECAUSE THE LETTERING REACHES 1050. A
     * first cut at 980 put a ghost of the banner's own "SE" — the tail
     * of RESPONSE — in the top-left corner of the hero, underneath the
     * live type saying the same word.
     */
    cut: { left: 1105, top: 96, width: 1065, height: 470 },
  },
  {
    from: 'Midnight Music Studio Session.png', to: 'performance.webp',
    /* Measured, not guessed: rows 174–629 are the picture. */
    cut: { left: 0, top: 174, width: 2172, height: 456 },
  },
  { from: 'OnlineTV.png', to: 'online-tv.webp' },
];

mkdirSync(OUT, { recursive: true });

for (const room of ROOMS) {
  const file = join(OUT, room.to);
  const cut = sharp(join(ROOT, 'art', room.from));
  const info = await (room.cut ? cut.extract(room.cut) : cut)
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
