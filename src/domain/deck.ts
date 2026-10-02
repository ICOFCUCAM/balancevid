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
import type { SlideProblem, SlideSpec } from './graphic.js';
import { sameColour, slideProblems } from './graphic.js';

export type DeckId = Id<'deck'>;

export interface Slide {
  /** A library image. The same kind of reference a caption card is. */
  assetId: string;
  /** Which page it came from, 1-based, for a label nobody has to type. */
  page: number;
  /**
   * WHAT THE SLIDE SAYS, for the ones somebody wrote.  [§21, C-26]
   *
   * The image is what goes on air and it is enough to transmit; it is
   * not enough to EDIT. Without the definition, changing a typo means
   * retyping the slide, and duplicating one means retyping it twice —
   * which is why the deck now keeps it beside the picture.
   *
   * ABSENT ON AN UPLOADED SLIDE, and that absence is information
   * rather than a gap: a page of somebody's PowerPoint was never
   * composed here and this product cannot honestly offer to edit it.
   * The panel offers Edit and Duplicate exactly where a definition
   * exists, so the control says what is true.
   */
  spec?: SlideSpec;
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

/**
 * Where a new slide goes in a deck.
 *
 * At the end, unless a position is given. A slide appended while a talk is
 * being given must not renumber the ones behind it — the presenter is
 * looking at "4 / 9" and somebody adding a slide should not make that mean
 * a different page.
 */
export function withSlide(deck: Deck, slide: Slide, at?: number): Deck {
  const slides = [...deck.slides];
  const where = at === undefined || at < 0 || at > slides.length
    ? slides.length : at;
  slides.splice(where, 0, slide);
  return { ...deck, slides: slides.map((each, index) => ({ ...each, page: index + 1 })) };
}

/** Take one out, and renumber what is left. */
export function withoutSlide(deck: Deck, assetId: string): Deck {
  const slides = deck.slides.filter((slide) => slide.assetId !== assetId);
  return { ...deck, slides: slides.map((each, index) => ({ ...each, page: index + 1 })) };
}

/**
 * Move one. The order IS the deck, so this is the only edit that matters
 * after the slides exist.
 */
/**
 * Draw a corrected slide where the old one stood.  [§20, §21, C-26]
 *
 * EDITING A SLIDE IS DRAWING A NEW ONE, because a slide on air is a
 * library PNG and a PNG is not editable — so "edit" means render
 * again and put the result in the same position. That position is
 * what this function is for, and it is the part worth testing: a
 * corrected slide that lands at the end of the deck is a presenter
 * pressing NEXT into a typo they just fixed.
 *
 * AND IF THE OLD SLIDE WENT WHILE THE NEW ONE WAS DRAWING — somebody
 * deleted it, or reordered the deck out from under the job — the new
 * one is appended rather than lost. A render that succeeded is work
 * somebody did, and throwing it away because the target moved would
 * be the deck punishing them for a race they could not see.
 */
export function replaceSlide(
  deck: Deck, oldAssetId: string, made: Slide,
): Deck {
  const at = deck.slides.findIndex((one) => one.assetId === oldAssetId);
  if (at < 0) return withSlide(deck, made);
  return withoutSlide(withSlide(deck, made, at), oldAssetId);
}

export function moveSlide(deck: Deck, assetId: string, to: number): Deck {
  const from = deck.slides.findIndex((slide) => slide.assetId === assetId);
  if (from < 0) return deck;
  const slides = [...deck.slides];
  const [moved] = slides.splice(from, 1);
  const where = Math.max(0, Math.min(slides.length, to));
  slides.splice(where, 0, moved!);
  return { ...deck, slides: slides.map((each, index) => ({ ...each, page: index + 1 })) };
}

export function canMakeDeckFrom(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 && DECK_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}

/* ------------------------------------------------------------------------ *
 *  What standing is each slide in?  [§21, §5, D-04, C-26, C-36]
 * ------------------------------------------------------------------------ */

/**
 * WHY THIS EXISTS, WHEN `slideProblems` ALREADY DID THE CHECKING.
 *
 * It ran on the slide being TYPED and on nothing else. The moment the
 * author pressed Add, the judgement stopped: the deck held nine
 * slides and the product had no opinion about any of them. A check
 * that only runs while you type stops being true the moment you stop
 * typing, and `slideReady` — written for exactly this, with the
 * comment *"the line between DRAFT and READY"* — was never called by
 * anything but its own test.
 *
 * AND TWO FAULTS CANNOT BE SEEN FROM A SLIDE AT ALL. Both need the
 * deck's surroundings, which is why they live here and not in
 * `graphic.ts`:
 *
 *   * **The channel changed colour underneath it.** A slide is drawn
 *     once, into a PNG, with the accent the channel had at the time.
 *     Change `identity.ink` and every slide composed before the
 *     change keeps the old one — so a deck composed either side of a
 *     rebrand transmits two different stations, in order, and
 *     nothing anywhere said so.
 *   * **Its picture was deleted from the library.** The slide still
 *     transmits, because the PNG is its own asset. But the stored
 *     definition names a picture that is gone, so Correct reopens a
 *     slide that cannot be redrawn and Copy fails at the route with
 *     *"that picture is not in the library"* — the first anybody
 *     hears of it being the press that fails.
 */

/**
 * The channel as it is NOW, which is what a stored slide is measured
 * against. Each part is optional because each is separately unknown:
 * a caller with no library list asks about identity only, and gets no
 * opinion about pictures rather than a wrong one.
 */
export interface House {
  /** The channel's colour now. */
  accent?: string;
  /** The channel's name now. */
  channel?: string;
  /** The library images that still exist. */
  pictures?: ReadonlySet<string>;
}

/**
 * Where a slide stands.
 *
 * `as-is` IS NOT A FAULT AND NOT A GRADE. It is a slide this product
 * holds no definition for, and there are two ways to be one:
 *
 *   * a page of somebody's PowerPoint, which was never composed here;
 *   * a slide this product DID compose, before C-26 made the
 *     definition travel with the picture. The author's own deck is
 *     two of those.
 *
 * Both have the same consequence and deserve the same word: there is
 * nothing to check, nothing to correct and nothing to copy. Saying
 * "draft" about either would be inventing a judgement with no basis
 * — the panel already refuses to offer Correct and Copy there for
 * exactly that reason, and the control says what is true (§21).
 */
export type Standing = 'ready' | 'draft' | 'broken' | 'as-is';

export interface SlideStanding {
  assetId: string;
  standing: Standing;
  /** Everything wrong with it, in the author's words. */
  faults: SlideProblem[];
}

/**
 * Everything wrong with one slide of a deck, including the two things
 * only the deck can see.
 */
export function slideFaults(slide: Slide, house: House = {}): SlideProblem[] {
  const spec = slide.spec;
  if (!spec) return [];
  const out = [...slideProblems(spec)];

  /*
   * THE PICTURE FIRST, because it is the one that stops work rather
   * than merely looking wrong, and `pictures` being absent means the
   * caller did not ask — not that the library is empty. A check that
   * treated "I do not know" as "it is gone" would mark every picture
   * slide on every surface that has no library list to hand.
   */
  if (spec.picture && house.pictures && !house.pictures.has(spec.picture)) {
    out.push({
      code: 'lost-picture',
      says: 'The picture this slide was made from is no longer in the '
        + 'library. It still transmits, but it cannot be corrected or '
        + 'copied until a picture is chosen again.',
      /*
       * NOT BLOCKING, and the sentence says why in its second clause.
       * The slide on air is a PNG that was drawn when the picture
       * existed and is exactly as good as it ever was. Marking it
       * broken would be the product calling a correct graphic broken,
       * which is the lie D-21 is about pointed the other way.
       */
      blocking: false,
    });
  }

  /*
   * AND THE IDENTITY, which is only a question where there is an
   * identity to differ from. A channel that has never set a colour
   * cannot have drifted from one.
   */
  const drifted = (house.accent !== undefined
      && !sameColour(spec.accent, house.accent))
    || (house.channel !== undefined && (spec.channel ?? '') !== house.channel);
  if (drifted) {
    out.push({
      code: 'off-identity',
      says: 'This slide was drawn before the channel’s look changed, so '
        + 'it carries the old one. Correct it to redraw it.',
      blocking: false,
    });
  }
  return out;
}

/** Ready, draft, broken — or not ours to judge. */
export function standingOf(slide: Slide, house: House = {}): Standing {
  if (!slide.spec) return 'as-is';
  const faults = slideFaults(slide, house);
  if (faults.some((one) => one.blocking)) return 'broken';
  return faults.length === 0 ? 'ready' : 'draft';
}

/** Every slide of a deck, in deck order. */
export function deckStanding(deck: Deck, house: House = {}): SlideStanding[] {
  return deck.slides.map((slide) => ({
    assetId: slide.assetId,
    standing: standingOf(slide, house),
    faults: slideFaults(slide, house),
  }));
}

/**
 * How many slides want looking at.
 *
 * `as-is` IS NOT COUNTED, and that is the decision this function
 * exists to hold: a deck of forty uploaded PowerPoint pages must read
 * "40 slides", not "40 to check". A count that is always alarming is
 * a count nobody reads.
 */
export function toCheck(standings: readonly SlideStanding[]): number {
  return standings.filter(
    (one) => one.standing === 'draft' || one.standing === 'broken').length;
}

/* ------------------------------------------------------------------------ *
 *  What is lost, said before it is lost.  [§20, §5, D-04, C-26, C-37]
 * ------------------------------------------------------------------------ */

/**
 * What to call a slide, in one line.
 *
 * ITS OWN WORDS WHERE IT HAS ANY. A rundown row and a confirmation
 * about the same slide must name it the same way, or the person
 * checking which one they are about to destroy is comparing two
 * different labels. One expression, in the domain, used by both.
 */
export function slideSays(slide: Slide): string {
  return slide.spec?.heading?.trim()
    || slide.spec?.body?.trim().split('\n')[0]
    || `Page ${slide.page}`;
}

/** A question and the verb that answers it. Shaped for `Confirm`. */
export interface Loss {
  question: string;
  verb: string;
}

/**
 * Removing a slide, in the sentence that should precede it.
 *
 * THE PANEL HAD NO CONFIRMATION AT ALL, and it is the panel used
 * BETWEEN TWO CUES. One press of Remove took the slide out of the
 * deck and the route deleted its PNG from the library — no dialog,
 * no undo, no trash. Every other destructive control in this product
 * goes through `Confirm` (nine surfaces do); the one on the live desk
 * did not.
 *
 * AND THE ON-AIR CASE IS A DIFFERENT DECISION, not a louder version
 * of the same one. `bookingsFor` refuses a slide that is in the
 * schedule, the filler, the backup or the emergency cut — and knows
 * nothing about `channel.live.segment`, which is what is on the wire
 * RIGHT NOW. Deleting that file does not fail politely: the next
 * segment cannot read it, the encode falls back, and the channel goes
 * to black until somebody takes something else. That belongs in the
 * first sentence, not in a footnote.
 */
export function losingSlide(
  deck: Deck, assetId: string, onAir = false,
): Loss {
  const at = deck.slides.findIndex((one) => one.assetId === assetId);
  /*
   * NO `at >= 0` GUARD, AND THAT IS NOT AN OVERSIGHT. One was written
   * here and survived every mutation, because `slides[-1]` in
   * JavaScript is `undefined` rather than the last element — the
   * guard was a habit from a language with negative indices, and
   * `noUncheckedIndexedAccess` already types this `Slide | undefined`
   * so it narrowed nothing either. The sentence below handles the
   * absent slide, and the test that proves it is the one that makes
   * deleting the guard safe. [C-34's caveat, checked and not met]
   */
  const slide = deck.slides[at];
  const named = slide
    ? `slide ${at + 1}, “${slideSays(slide)}”` : 'this slide';
  return {
    question: onAir
      ? `${capital(named)} is on air now. Removing it deletes its picture, `
        + 'so the channel falls back to black until you take something '
        + 'else. There is no way to bring it back.'
      : `Remove ${named}? Its picture is deleted from the library with `
        + 'it, and there is no way to bring it back.',
    verb: onAir ? 'Remove it anyway' : 'Remove the slide',
  };
}

/**
 * Throwing a whole deck away.
 *
 * THE ROUTE HAS EXISTED SINCE THE DECK STORE WAS WRITTEN AND NOTHING
 * EVER CALLED IT — the same shape of gap as the two predicates C-36
 * deleted, with the opposite remedy: this one is worth reaching. A
 * deck is the only deletion in this product that really does remove
 * media, because its slides exist as its pages and belong nowhere
 * else, so the count goes in the sentence.
 */
export function losingDeck(deck: Deck): Loss {
  const pages = deck.slides.length;
  return {
    question: `Throw away “${deck.title}”? Its ${pages} `
      + `slide${pages === 1 ? '' : 's'} ${pages === 1 ? 'is' : 'are'} `
      + 'deleted with it — they are the deck’s own pages and are not '
      + 'kept anywhere else.',
    verb: 'Throw the deck away',
  };
}

/**
 * Loading a slide into the writer over words somebody typed.
 *
 * CORRECT IS NOT A DESTRUCTIVE BUTTON AND IT DESTROYS SOMETHING. It
 * fills every field from the stored definition, so a half-written
 * slide in the boxes is gone with no press that said so. Asked only
 * when there is something to lose: a writer that is empty, or already
 * holding this same slide, loses nothing and must not be interrupted.
 */
export function losingWriting(slide: Slide): Loss {
  return {
    question: `Load “${slideSays(slide)}” into the writer? What you have `
      + 'typed there is replaced, and it is not saved anywhere.',
    verb: 'Replace what I wrote',
  };
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
