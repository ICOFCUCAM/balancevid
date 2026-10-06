/**
 * A directory is not a file to play, in BOTH places that list the library.
 * [Doctrine CHANNEL §3, §25; D-19]
 *
 * THE BUG THIS EXISTS FOR, twice. `var/library/decks/` is a folder of
 * slide images. It came back from the library listing as a 4 KB item
 * called "decks" with `form: 'video'` — schedulable onto a channel,
 * loadable into the Media Player, and black on every monitor it reached,
 * because there is no video at the end of a folder.
 *
 * It was found and fixed once in `broadcastLibrary.ts`. It was still
 * there in `app/api/library/route.ts`, which is the other listing, which
 * is why the operator's library still showed it. One question — *is this
 * a file I can play* — answered in two places, which is the exact shape
 * `libraryMedia.ts` was extracted to stop.
 *
 * READ AS SOURCE, which is a blunt instrument and the right one here:
 * the thing being protected is one guard in each of two loops, and the
 * alternative is standing up a Next route handler in a unit test to
 * discover whether somebody deleted an `if`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACCEPTS, accepted, acceptsAttribute,
} from '../../src/domain/libraryUpload.js';
import { CONTAINERS } from '../../src/store/libraryMedia.js';

const ROOT = join(import.meta.dirname, '..', '..');
const LISTINGS = {
  'the broadcast library': join(ROOT, 'src', 'store', 'broadcastLibrary.ts'),
  'the library API': join(ROOT, 'app', 'api', 'library', 'route.ts'),
};

describe('every listing of the library skips what it cannot play', () => {
  for (const [what, path] of Object.entries(LISTINGS)) {
    it(`${what} asks whether the entry is a file`, () => {
      expect(readFileSync(path, 'utf8')).toContain('isFile()');
    });
  }

  it('both of them decide what a still is the same way', () => {
    /* `isStill` is the one answer, and a listing that spelled the
       extensions out again would be a third list of containers. */
    for (const [what, path] of Object.entries(LISTINGS)) {
      expect(readFileSync(path, 'utf8'), what).toContain('isStill');
    }
  });
});

/* ------------------------------------------------------------------------ *
 *  And one table for what may come IN.  [§3, §25, D-19, C-14, C-48]
 * ------------------------------------------------------------------------ */

describe('an upload is stored under a name that tells the truth', () => {
  /*
   * THE FOURTH LIST. C-14 found three places each knowing their own
   * containers and made them one table. The question *may this file
   * become one* was a fourth, private to the upload route, where the
   * only other thing that needs it — a file picker's `accept` — could
   * not read it. There was no picker, because the route had never been
   * called by any surface in this product.
   *
   * AND IT RENAMED THINGS. Every still mapped to `jpg` because `jpg`
   * was the only still the table had, so a PNG went in as PNG bytes
   * under a name claiming JPEG. WebM and QuickTime went in as `.mp4`,
   * and nothing is transcoded here. *"A file whose name lies to every
   * reader of it"* — this file's own words, about the sound it had
   * just fixed.
   */
  it('never stores a file under another container’s extension', () => {
    for (const [type, accepted] of Object.entries(ACCEPTS)) {
      const named = CONTAINERS.find((one) => one.type === type);
      /* Where this product HAS a container for exactly what arrived,
         that is the container it must be stored as. */
      if (named) expect(accepted.ext, type).toBe(named.ext);
    }
  });

  /*
   * AND WHATEVER IT IS STORED AS, THE SERVING ROUTE MUST KNOW IT.
   *
   * Asked of `CONTAINERS` directly rather than through a helper.
   * A `storable()` stood here for one pass and had exactly one
   * caller — this assertion — so breaking it broke nothing a
   * person could see, and the mutation that made it always say
   * yes survived. A query whose only reader is its own test is a
   * question nobody is asking. [the seventeenth]
   */
  it('only ever stores something the library can serve back', () => {
    const serves = new Set(CONTAINERS.map((one) => one.ext));
    for (const [type, accepted] of Object.entries(ACCEPTS)) {
      expect(serves.has(accepted.ext), type).toBe(true);
    }
    /* Grounded outside the source: these are not media. */
    expect(serves.has('pdf')).toBe(false);
    expect(serves.has('docx')).toBe(false);
  });

  /* A picture must not land as a moving container, or the schedule
     would hold it for a duration it does not have. [§3's `stillMs`] */
  it('keeps pictures and moving things apart', () => {
    for (const [type, accepted] of Object.entries(ACCEPTS)) {
      const stored = CONTAINERS.find((one) => one.ext === accepted.ext)!;
      expect(stored.still, type).toBe(accepted.form === 'image');
    }
  });

  /*
   * THE PICKER OFFERS EXACTLY WHAT THE SERVER TAKES. An `accept`
   * typed by hand beside an allow-list is two lists again, and it
   * fails the worst way available: a person chooses a file the dialog
   * showed them, waits for it to go up, and is told 415.
   */
  it('offers the picker exactly the list the route enforces', () => {
    const offered = acceptsAttribute().split(',');
    /*
     * THE TYPES, AND THE EXTENSIONS BESIDE THEM. The attribute was
     * the MIME list alone, which is the right answer only for a
     * picker that knows what its own files are — and the pickers
     * that do not are exactly the ones this gate had to grow a
     * name fallback for. A phone that cannot name its `.3gp` hides
     * it from a types-only dialog, and the person concludes the
     * file is gone rather than unoffered.
     */
    expect(offered.filter((one) => !one.startsWith('.')).sort())
      .toEqual(Object.keys(ACCEPTS).sort());
    expect(offered.filter((one) => one.startsWith('.')).sort())
      .toEqual([...new Set(Object.values(ACCEPTS).map((one) => `.${one.ext}`))].sort());
    /* Nothing is listed twice: `.avi` has three MIME spellings and
       one extension, and a dialog does not need it three times. */
    expect(new Set(offered).size).toBe(offered.length);
  });

  /*
   * AND EVERY EXTENSION IT OFFERS IS ONE THE SERVER WILL TAKE on
   * the evidence of the name alone — which is the whole point of
   * listing extensions. Offering `.3gp` to a picker whose phone
   * then declares `application/octet-stream`, and refusing it on
   * arrival, is the 415-after-waiting this file exists to prevent,
   * reached by a longer road.
   */
  it('takes every extension it offered, from a picker that said nothing', () => {
    for (const one of acceptsAttribute().split(',').filter((x) => x.startsWith('.'))) {
      expect(accepted('application/octet-stream', `whatever${one}`), one)
        .toBeTruthy();
      expect(accepted('', `whatever${one}`), one).toBeTruthy();
    }
  });

  /* And the route reads the table rather than keeping its own. */
  it('leaves the upload route with no list of its own', () => {
    const source = readFileSync(LISTINGS['the library API'], 'utf8');
    expect(source).toContain('accepted(');
    expect(source).not.toContain('image/jpeg');
    expect(source).not.toContain('video/mp4');
  });
});
