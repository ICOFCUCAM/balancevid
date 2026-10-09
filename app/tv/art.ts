/**
 * THE ONE PLACE THE NETWORK'S PICTURES ARE NAMED.
 *   [TV-NETWORK N-4]
 *
 * Every image on the public television pages is listed here and
 * nowhere else, so swapping the artwork is editing this file
 * rather than hunting through markup. Drop a file into
 * `public/network/`, change the string, and nothing else moves.
 *
 * ITS OWN MODULE, AND THAT IS NOT TIDINESS. It lived in `Tv.tsx`,
 * which is `'use client'` — and a SERVER component importing a
 * plain constant from a client module gets `undefined`. The front
 * page survived it because its hero is a client component and so
 * resolved the value in the browser; the directory's band is
 * rendered on the server, and shipped `src="$undefined"` and a
 * black rectangle. Found by probing a screenshot that looked
 * merely dark.
 *
 * SO IT IS A MODULE WITH NO DIRECTIVE, importable from both sides,
 * which is what a shared constant has to be.
 *
 * THE DEFAULTS ARE PICTURES THIS PRODUCT ALREADY OWNS, rather than
 * stock photography bought for one page: `online-tv.webp` is how
 * the studio introduces the Online TV room, so the network's front
 * door and the room behind it are recognisably the same place
 * until something better arrives. [D-19]
 */

import type { CSSProperties } from 'react';
export const NETWORK_ART = {
  /** The tall band under the header on the front page. */
  hero: '/rooms/online-tv.webp',
  /** Where in the frame to hold when that band is cropped. */
  heroFocus: '72% 42%',
  /** The shorter band over the directory. */
  directory: '/rooms/online-tv.webp',
  directoryFocus: '76% 38%',
  /** The panel beside the search results. */
  search: '/rooms/online-tv.webp',
  searchFocus: '58% 40%',
  /** The band over the open calls. [GO-VIRAL V-4] */
  calls: '/rooms/performance.webp',
  callsFocus: '50% 42%',
  /**
   * THE TAKE APP'S OWN BAND, AND IT IS A PERFORMER.
   *   [TAKE-APP; D-04]
   *
   * Every other picture here is a ROOM, because the television
   * network's subject is a network of studios. The Take App's
   * subject is the person holding the phone, and it had been
   * borrowing the Online TV control room — a wall of monitors
   * and two presenters at a desk, which is the thing this
   * audience is NOT. The uploaded design leads on somebody
   * singing into a microphone, and it is right to.
   *
   * 1200px WIDE AND 72KB, converted from the 2.1MB upload. The
   * page it opens is reached from a message, on a phone, often
   * on a hall's wifi; two megabytes of hero is the picture
   * arriving after the person has given up.
   */
  take: '/rooms/take-hero.webp',
  takeFocus: '62% 35%',
} as const;

/**
 * A station with no logo gets an identity rather than a gap.
 *
 * TWO GREY LETTERS IN A DARK WELL IS WHAT *MISSING* LOOKS LIKE,
 * and on a shelf of six it is what the whole network looks like.
 * An independent broadcaster who has not uploaded a logo yet is
 * the ordinary case on a new network, not the edge one — so the
 * absence has to be designed rather than merely handled. [U-19]
 *
 * DETERMINISTIC, FROM THE SLUG. The same station is the same
 * colour on every page, every load and every device, because a
 * channel whose tile changed colour between the directory and the
 * guide would read as two channels. A hash over the address, not a
 * random — and the address is the one thing a listing is
 * guaranteed to have.
 *
 * AND IT IS A GROUND, NOT A BRAND. Deep, low-saturation, two stops
 * apart: it has to sit in a row beside real logos without
 * competing with them, because the day the broadcaster uploads one
 * this disappears and nothing else on the card should move.
 */
export function identityFor(slug: string): CSSProperties {
  const hash = hueOf(slug);
  return {
    background: `radial-gradient(120% 120% at 24% 18%,`
      + ` hsl(${hash} 42% 26%) 0%, hsl(${(hash + 28) % 360} 46% 13%) 62%,`
      + ` hsl(${(hash + 40) % 360} 48% 9%) 100%)`,
  };
}

/** The same hue for the same word, wherever it is drawn. */
function hueOf(word: string): number {
  let hash = 0;
  for (let i = 0; i < word.length; i += 1) {
    hash = (hash * 31 + word.charCodeAt(i)) % 360;
  }
  return hash;
}

/**
 * The ground behind a CATEGORY tile.
 *
 * THE SAME HUE AS `identityFor` AND TWICE THE LIFE, which is the
 * whole difference between the two: a logo ground sits behind
 * somebody else's mark and must not compete with it, and a
 * category tile has nothing in front of it but its own name. The
 * muted ramp borrowed straight across made a page of twelve
 * tiles look like twelve switched-off screens.
 *
 * SAME `hueOf`, SO A CATEGORY KEEPS ITS COLOUR. Music is the same
 * hue on the tile as anywhere else it is ever drawn, for the
 * reason a station is: a thing that changes colour between two
 * pages reads as two things.
 *
 * NOT A PHOTOGRAPH, and that is a decision rather than a gap. The
 * design this was built against gives every tile its own picture;
 * this product has three photographs and none of them is *news*.
 * Twelve tiles carrying one stock image is worse than twelve
 * carrying none, and a photograph per category is a commission,
 * not a line of code. When the pictures exist they go in
 * `NETWORK_ART` above and this becomes the fallback. [U-19, D-21]
 */
export function shelfFor(kind: string): CSSProperties {
  const hue = hueOf(kind);
  return {
    background: `radial-gradient(135% 135% at 18% 12%,`
      + ` hsl(${hue} 64% 44%) 0%, hsl(${(hue + 26) % 360} 62% 26%) 52%,`
      + ` hsl(${(hue + 44) % 360} 58% 14%) 100%)`,
  };
}
