/**
 * A deck is an order.  [Doctrine CHANNEL §20, §3, §5, U-33 §2, D-18, D-19]
 *
 *     deck.pptx  →  LibreOffice  →  PDF  →  pdf.js  →  slide-1.png …
 *                                                        │
 *                                            library media, one per page
 *                                                        │
 *                                        roll-in  →  over the live feed
 *
 * WHAT A DECK IS NOT. It is not a new media type, not a player, and not a
 * second thing the playout engine has to understand. A slide is a library
 * IMAGE — the kind the engine has been able to put on the wire since it was
 * written (`-loop 1 -framerate`, `segment.ts`), the kind the monitor already
 * draws and the kind the schedule can already hold. Advancing a slide is
 * `roll-in` of the next one, which is the action the Screens tab has had
 * from the beginning.
 *
 * So the only thing a deck adds to this product is the ORDER. Everything
 * else was already here, and finding that out is what D-19 is for.
 *
 * AND THERE IS NO CURSOR STORED ANYWHERE. Which slide is showing is
 * `channel.live.segment` — the thing that is actually on air — so the
 * question "where are we in the deck" is answered by looking at the
 * transmission rather than at a counter that could disagree with it. A
 * stored cursor is a second opinion about what a viewer can see. [D-22]
 */

import type { Id } from './ids.js';
import type { ProgrammeSource } from './channel.js';

export type DeckId = Id<'deck'>;

export interface Slide {
  /** A library image. The same kind of reference a caption card is. */
  assetId: string;
  /** Which page it came from, 1-based, for a label nobody has to type. */
  page: number;
}

export interface Deck {
  id: DeckId;
  title: string;
  /**
   * ORDERED, and the order is the data.
   *
   * Everything else in this codebase derives order from a clock or a
   * timestamp (U-08). A deck cannot: there is no instant at which slide
   * four happens, only the fact that it comes after slide three. The same
   * reason a channel's rotation stores its order.
   */
  slides: Slide[];
  /** What was uploaded, so a library row can say `talk.pptx` rather than an id. */
  origin: string;
  createdAt: string;
}

/** The reference that puts this slide on air. A library image, nothing new. */
export function sourceForSlide(slide: Slide): ProgrammeSource {
  return { kind: 'media', assetId: slide.assetId, form: 'image' };
}

/**
 * Where the deck is, read from what is on air.
 *
 * `-1` when this deck is not what is showing — which is the honest answer
 * while the room is on screen, or while somebody rolled in a film instead.
 */
export function slideOnAir(deck: Deck, showing?: ProgrammeSource): number {
  if (!showing || showing.kind !== 'media') return -1;
  return deck.slides.findIndex((slide) => slide.assetId === showing.assetId);
}

/**
 * The next slide in a direction, or undefined at the end.
 *
 * IT DOES NOT WRAP. A deck that looped from the last slide back to the
 * first would, at the end of a talk, put the title card up in front of an
 * audience waiting for the presenter to finish — and the operator pressing
 * NEXT would have no way to tell the difference from a deck that had one
 * more slide. Running out is information.
 *
 * From nowhere (`-1`), forward means the first slide: pressing NEXT when
 * nothing of the deck is up starts it, which is what the button looks like
 * it should do.
 */
export function step(deck: Deck, from: number, by: 1 | -1): Slide | undefined {
  if (deck.slides.length === 0) return undefined;
  if (from < 0) return by === 1 ? deck.slides[0] : undefined;
  const wanted = from + by;
  if (wanted < 0 || wanted >= deck.slides.length) return undefined;
  return deck.slides[wanted];
}

/** Every image a deck holds, for the invariant that counts what is on disk. */
export function deckAssetIds(deck: Deck): string[] {
  return deck.slides.map((slide) => slide.assetId);
}

/**
 * What a deck can be made from.
 *
 * The union of what the evidence pipeline can already rasterise (U-33 §2)
 * and the picture formats that are already library media. Named as a list
 * rather than "whatever soffice accepts", for the reason `pages.ts` gives:
 * an unknown extension handed to a converter is two minutes of a worker
 * discovering it cannot be done.
 */
export const DECK_EXTENSIONS = new Set([
  '.pdf',
  '.pptx', '.ppt', '.odp',
  '.docx', '.doc', '.odt', '.rtf',
  '.xlsx', '.ods',
]);

export function canMakeDeckFrom(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 && DECK_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}
