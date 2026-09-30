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
