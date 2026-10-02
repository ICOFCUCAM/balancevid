/**
 * What a slide IS.  [Doctrine CHANNEL §21, §20, §27, D-04, D-19]
 *
 *     slide definition  --+--> slideHtml()      ->  preview AND air
 *       (this file)       +--> slideProblems()  ->  DRAFT or READY
 *
 * THE DEFINITION IS DOMAIN AND THE DRAWING IS NOT, which is why they
 * are two files. A deck stores what a slide SAYS, so that it can be
 * edited, duplicated and drawn again; the HTML it becomes is a render
 * concern, and in this codebase `src/render` imports `src/domain` and
 * never the other way round. Putting the model here is what lets
 * `deck.ts` hold one without the domain learning about stylesheets.
 *
 * WHAT IT IS NOT. Not a presentation format. No free positioning, no
 * font, no bold, no animation, no second aspect ratio. The four
 * compositions are fixed and each is hard to make ugly: that is §21's
 * decision and this file keeps it. What C-26 changed is that the four
 * now LOOK like four things, and that a bad one can be caught before
 * it reaches the wire.
 *
 * Nothing here touches the filesystem, the network, or a clock.
 */

/** 16:9 at the house height, so a slide fills the frame unscaled. */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

/**
 * The two boxes every broadcast graphic is drawn against.
 *
 * ACTION SAFE is the inner 90 %: a picture may run to the edge of the
 * frame but nothing meaningful should happen outside this. TITLE SAFE
 * is the inner 80 %, and it is where TEXT goes — the margin exists
 * because a caption clipped by an overscanning set, a phone's rounded
 * corner or a platform's own furniture is a caption that was never
 * read.
 *
 * Content is positioned against title safe and `overflow:hidden`, so a
 * slide cannot put a word outside it. That is the whole of the
 * "content outside the safe area" check: it is prevented rather than
 * detected, and what IS detected is the text being too long to fit
 * inside it, which is the same fault one step earlier. [§27]
 */
export const ACTION_SAFE = 0.05;
export const TITLE_SAFE = 0.10;


export type Background = 'black' | 'white' | 'light' | 'studio' | 'image';

export interface Preset {
  id: Background;
  label: string;
  /**
   * A FLAT COLOUR, always, even where a wash is drawn on top of it.
   * Contrast is measured against this, so every preset has to have one
   * number that can be measured — a gradient cannot be checked, and a
   * check that quietly skips a case is worse than no check. [D-04]
   */
  base: string;
  /** What text is, on that. */
  ink: string;
  /** An optional second layer. One, and restrained. */
  wash?: string;
}

/**
 * Five, and they are design assets rather than decoration.
 *
 * BLACK STAYS THE DEFAULT because a control room is dark and a slide
 * that matches the programme's own black is the one that cuts cleanly.
 * The other four exist because every slide being black is the thing
 * that made this feature look unfinished: a white information card, a
 * light one, a studio field and a photograph are the four other things
 * television actually puts on screen.
 *
 * No gradients beyond the one in `studio`, no blobs, no illustration.
 */
export const BACKGROUNDS: Preset[] = [
  { id: 'black', label: 'Black', base: '#07090c', ink: '#ffffff' },
  { id: 'white', label: 'White', base: '#ffffff', ink: '#101418' },
  { id: 'light', label: 'Light', base: '#eceff3', ink: '#101418' },
  {
    id: 'studio',
    label: 'Studio',
    base: '#0d1724',
    ink: '#ffffff',
    /* ONE WASH, along the diagonal a key light would come from. It is
       the same idea as the room's own lamp (§24) at a tenth of the
       strength: enough that the frame is not flat, not enough that
       anybody notices it. */
    wash: 'linear-gradient(118deg,rgba(72,116,170,0.26) 0%,'
      + 'rgba(13,23,36,0) 58%)',
  },
  { id: 'image', label: 'Image', base: '#07090c', ink: '#ffffff' },
];

export function presetFor(id: Background | undefined): Preset {
  return BACKGROUNDS.find((one) => one.id === id) ?? BACKGROUNDS[0]!;
}

/** Where a filled picture is anchored when the crop has to take something. */
export type Focus = 'top' | 'centre' | 'bottom';

export type SlideLayout = 'title' | 'text' | 'picture' | 'quote';

/**
 * What a slide IS.  [§21, C-26]
 *
 * A composition, which is why the fields are the parts of one: what
 * kind, what it says, what it is drawn on, whose channel it is. The
 * aspect ratio and the safe area are not fields because they are not
 * choices — they are the master canvas, and a slide that could be
 * 4:3 would be a slide the playout engine has to think about. [§20]
 */
export interface SlideSpec {
  layout: SlideLayout;
  heading?: string;
  /** Body text. Blank lines separate paragraphs; `- ` and `1. ` start lists. */
  body?: string;
  /** A credit, a source, a date — or, on a quote, who said it. */
  footnote?: string;
  /**
   * A LIBRARY ASSET, NAMED. Not a path and not an upload: the same
   * reference a caption card is, so one photograph can be on two
   * slides without a second copy, and a stored definition means the
   * same thing on another machine. The worker turns it into bytes;
   * the control room turns it into a URL. [§3, D-18]
   */
  picture?: string;
  /**
   * FILL THE FRAME, rather than fit inside it — and on a picture slide
   * the two are different COMPOSITIONS rather than two values of
   * `object-fit`: filling gives the full-bleed photograph with the
   * words over it, fitting gives the split with the words beside it.
   * That is the honest reading of what an operator means by each.
   */
  fill?: boolean;
  /** Which part of a filled picture survives the crop. */
  focus?: Focus;
  /** One of the five. Black when unsaid. */
  background?: Background;
  /** The channel's own colour: the eyebrow, the rule, the quote mark. */
  accent?: string;
  /** The channel's name, drawn once and quietly. */
  channel?: string;
}

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3}(?:[0-9a-f]{2})?)?$/i;

/** A colour, or nothing. Never a string that could close a declaration. */
export function colourOr(value: string | undefined, fallback: string): string {
  return value && HEX.test(value) ? value : fallback;
}

/**
 * Two colours written differently are still one colour.  [C-36]
 *
 * `#FFF`, `#fff` and `#ffffff` are the same white, and a deck checked
 * for drifted identity has to compare what was drawn against what the
 * channel is now — so a comparison that called those three different
 * would mark every slide on a channel whose colour was typed twice.
 *
 * NOTHING IS A COLOUR TOO, and equal to itself: a slide composed
 * before the channel had an identity carries no accent, and neither
 * does one composed after it was cleared.
 */
export function sameColour(
  one: string | undefined, two: string | undefined,
): boolean {
  const flat = (value: string | undefined): string | undefined => {
    if (!value || !HEX.test(value)) return undefined;
    const low = value.toLowerCase();
    return low.length === 4
      ? `#${low[1]!}${low[1]!}${low[2]!}${low[2]!}${low[3]!}${low[3]!}` : low;
  };
  return flat(one) === flat(two);
}

/* ------------------------------------------------------------------------ *
 *  Is this slide any good?  [§21, D-04, C-26]
 * ------------------------------------------------------------------------ */

/**
 * How much text each composition can hold before it stops working.
 *
 * MEASURED IN CHARACTERS, which is a proxy, and an honest one: the
 * content box is a known width, the face is fixed and the sizes are
 * fixed, so characters-per-line is a constant and the limits below are
 * that constant times the number of lines the composition has room for.
 * A limit that is approximately right and always enforced beats an
 * exact one nobody runs.
 */
const LIMITS: Record<SlideLayout, { heading: number; body: number }> = {
  /* Three lines of 104px type across 1536px. */
  title: { heading: 58, body: 160 },
  /* A heading and about seven lines of body. */
  text: { heading: 52, body: 420 },
  /* A caption, not an essay: the picture is the content. */
  picture: { heading: 46, body: 190 },
  /* Four lines of 70px italic. Longer than that is a reading, not a quote. */
  quote: { heading: 0, body: 240 },
};

/** The most bullets a text slide can hold and still be read across a room. */
const MOST_POINTS = 7;

export interface SlideProblem {
  /** Stable, so a test names the fault rather than the sentence. */
  code: 'empty' | 'no-picture' | 'no-words' | 'long-heading' | 'long-body'
    | 'many-points' | 'contrast'
    /* The two a slide cannot know about itself: both need the deck's
       surroundings, and both are found by `slideFaults` in `deck.ts`
       rather than here. [C-36] */
    | 'off-identity' | 'lost-picture';
  /** What to tell the operator, in one line they can act on. */
  says: string;
  /**
   * DOES THIS STOP THE SLIDE, or merely warn about it?  [§5, D-04]
   *
   * A slide with no picture on a picture layout renders the words
   * "no picture" and transmits them, so it is stopped. A heading
   * four characters over its limit is a judgement, and an operator
   * three minutes into a live programme is better placed to make it
   * than this file is — so it is said and not enforced.
   *
   * A control room that refuses to put anything on air until it is
   * perfect is a control room somebody works around. [D-04]
   */
  blocking: boolean;
}

/** Relative luminance, WCAG 2.1 §1.4.3. */
function luminance(hex: string): number {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const part = (at: number): number => {
    const channel = parseInt(full.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * part(1) + 0.7152 * part(3) + 0.0722 * part(5);
}

/** The WCAG ratio between two colours, 1 … 21. */
export function contrast(one: string, two: string): number {
  const [a, b] = [luminance(one), luminance(two)].sort((x, y) => y - x) as
    [number, number];
  return (a + 0.05) / (b + 0.05);
}

/**
 * Everything wrong with this slide, or nothing.  [§21, D-04]
 *
 * THE POINT IS TO STOP A BAD GRAPHIC REACHING AIR, not to grade the
 * operator. So each problem is a sentence about what to change, the
 * list is short, and a slide with nothing in it is "empty" rather than
 * eight separate complaints about its missing parts.
 *
 * The contrast check is the one that is MEASURED rather than
 * estimated: a channel whose colour is a dark blue, on the Studio
 * background, produces an eyebrow nobody can read, and no amount of
 * looking at it in a bright control room reveals that. 3:1 is the
 * WCAG threshold for large text, which every use of the accent here
 * is.
 */
export function slideProblems(spec: SlideSpec): SlideProblem[] {
  const heading = spec.heading?.trim() ?? '';
  const body = spec.body?.trim() ?? '';
  const footnote = spec.footnote?.trim() ?? '';
  const limit = LIMITS[spec.layout];
  const out: SlideProblem[] = [];

  if (!heading && !body && !footnote && !spec.picture) {
    return [{ code: 'empty', says: 'This slide has nothing on it yet.',
      blocking: true }];
  }

  if (spec.layout === 'picture' && !spec.picture) {
    out.push({ code: 'no-picture', says: 'A picture slide needs a picture.',
      blocking: true });
  }
  if (spec.layout === 'quote' && !body) {
    out.push({ code: 'no-words', says: 'A quote slide needs the quotation.',
      blocking: true });
  }
  if (limit.heading > 0 && heading.length > limit.heading) {
    out.push({
      code: 'long-heading',
      says: `The heading is too long for this layout — ${heading.length} `
        + `characters, and it reads at about ${limit.heading}.`,
      blocking: false,
    });
  }
  if (body.length > limit.body) {
    out.push({
      code: 'long-body',
      says: `There is more text than this layout can show at a readable `
        + `size. Split it across two slides.`,
      blocking: false,
    });
  }
  const points = body.split('\n')
    .filter((line) => /^\s*(?:-\s|\d+[.)]\s)/.test(line)).length;
  if (points > MOST_POINTS) {
    out.push({
      code: 'many-points',
      says: `${points} points is more than one slide can hold. Seven is `
        + `about the limit.`,
      blocking: false,
    });
  }

  const preset = presetFor(spec.background);
  const accent = colourOr(spec.accent, preset.ink);
  if (contrast(accent, preset.base) < 3) {
    out.push({
      code: 'contrast',
      says: 'The channel colour is too close to this background to read. '
        + 'Try another background.',
      blocking: false,
    });
  }
  return out;
}

/*
 * `slideReady` AND `slideTransmittable` STOOD HERE AND NOTHING EVER
 * CALLED THEM.  [C-36]
 *
 * They were written at C-26 to be the line between DRAFT and READY,
 * and no surface ever asked: the editor called `slideProblems`
 * directly, no route called anything, and a deck was never checked at
 * all. Two predicates with a test each and no caller are a capability
 * this product claimed and did not have.
 *
 * The line they drew is real and is now drawn where something reads
 * it — `standingOf` in `deck.ts`, which answers for a slide IN a
 * deck and can therefore also see the two faults a spec cannot know
 * about itself. One vocabulary, called from one place.
 */

