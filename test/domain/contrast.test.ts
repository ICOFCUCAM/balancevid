/**
 * Every tone is legible on every surface it is drawn on.  [Doctrine D-04, U-19]
 *
 * THIS TEST EXISTS BECAUSE I GOT IT WRONG BY EYE. Building the token system
 * I picked the dim end of the neutral ramp by looking at it, which is the
 * normal way and is not good enough on a dark interface: light text on dark
 * reads as higher contrast than it measures, so a tone that looks fine at
 * 2.3:1 looks fine right up until somebody uses the product on a laptop in
 * a bright room, or has any degree of low vision at all.
 *
 * Measured afterwards, `ink-400` scored 2.29 to 2.99 against the five
 * surfaces and `ink-300` scored 3.66 to 4.24 on the three lighter ones.
 * Both were being used for real text. Both were lifted until they passed.
 *
 * SO THE NUMBERS LIVE HERE NOW, and a tone that drifts fails a test rather
 * than shipping. The ramp is parsed out of the stylesheet rather than
 * duplicated into this file, because two lists of hex values that must
 * agree are two lists that eventually will not. [D-19]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ALL THREE FILES, because the ramp, the broadcast states and the studio
 * identities are declared in different places and this test is about the
 * relationship between them.
 * Reading only `tokens.css` is how the first draft of this test passed
 * while measuring nothing: the state colours parsed to an empty object
 * and the loop over them ran zero times.
 */
const STYLES = join(import.meta.dirname, '..', '..', 'app', 'styles');
const CSS = ['tokens.css', 'status.css', 'studios.css']
  .map((file) => readFileSync(join(STYLES, file), 'utf8')).join('\n');

/** The ramp, read from the one place it is written down. */
function tokens(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, value] of CSS.matchAll(/--(ink-[\w]+):\s*(#[0-9a-f]{6});/gi)) {
    found[name!] = value!;
  }
  return found;
}

/* WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channel = (byte: number) => {
    const s = byte / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Every surface a tone can be drawn on, lightest last — which is the hard one. */
const SURFACES = ['ink-900', 'ink-800', 'ink-700', 'ink-650', 'ink-600'];

describe('the contrast of every text tone', () => {
  const ink = tokens();

  it('reads the ramp out of the stylesheet rather than a copy of it', () => {
    expect(Object.keys(ink).length).toBeGreaterThanOrEqual(16);
    expect(ink['ink-050']).toMatch(/^#[0-9a-f]{6}$/);
  });

  /*
   * THE LIGHTEST SURFACE IS THE ONE THAT MATTERS. A tone that passes on the
   * darkest panel and fails on a floating menu fails in practice, because
   * the person reading it does not know which surface they are looking at.
   */
  it.each([
    ['ink-050', 'body and headings', 4.5],
    ['ink-200', 'secondary text', 4.5],
    ['ink-300', 'faint text — subtitles, captions, empty states', 4.5],
  ])('%s (%s) reaches AA on every surface', (tone, _why, need) => {
    for (const surface of SURFACES) {
      const got = contrast(ink[tone]!, ink[surface]!);
      expect(got, `${tone} on ${surface} is ${got.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(need);
    }
  });

  /*
   * ink-400 IS ALLOWED TO BE DIMMER, AND ONLY BECAUSE OF WHAT IT IS FOR:
   * a row's ordinal, a lane's legend, the dot on a menu. Those are not text
   * in the sense the rule means — nobody reads them to learn anything, and
   * removing them would lose no information. 3:1 is the bar for a
   * non-text element, and it has to clear that.
   *
   * If it is ever used for a sentence, this test still passes and the
   * product is still wrong, which is worth knowing about a test.
   */
  it('ink-400 clears the non-text bar on every surface', () => {
    for (const surface of SURFACES) {
      const got = contrast(ink['ink-400']!, ink[surface]!);
      expect(got, `ink-400 on ${surface} is ${got.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  /*
   * A RAMP MUST BE MONOTONIC or the names lie. `ink-400` lighter than
   * `ink-300` would not look broken — it would just quietly make every
   * rule about which tone to use meaningless.
   */
  it('gets lighter in the direction its names say it does', () => {
    const order = [
      'ink-900', 'ink-850', 'ink-800', 'ink-750', 'ink-700', 'ink-650',
      'ink-600', 'ink-550', 'ink-500', 'ink-450', 'ink-400', 'ink-300',
      'ink-200', 'ink-100', 'ink-050', 'ink-000',
    ];
    const lums = order.map((name) => luminance(ink[name]!));
    for (let i = 1; i < lums.length; i += 1) {
      expect(lums[i]!, `${order[i]} is not lighter than ${order[i - 1]}`)
        .toBeGreaterThan(lums[i - 1]!);
    }
  });
});

describe('the broadcast state colours', () => {
  const ink = tokens();
  const state = Object.fromEntries(
    [...CSS.matchAll(/--state-(\w+):\s*(#[0-9a-f]{6});/gi)]
      .map(([, name, value]) => [name!, value!]));

  /*
   * A LAMP IS A UI COMPONENT, not text, so 3:1 is the bar — but it is the
   * bar that decides whether somebody can see that the channel is live,
   * which makes it the most consequential 3:1 in the product. [CHANNEL §9]
   */
  /* A loop over nothing passes. This is what stops that. */
  it('were actually found in the stylesheet', () => {
    for (const name of ['live', 'armed', 'ok', 'warn', 'bad']) {
      expect(state[name], `--state-${name} was not parsed`)
        .toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('are each visible against the panel they sit on', () => {
    for (const [name, hex] of Object.entries(state)) {
      if (!/^(live|armed|ok|warn|bad)$/.test(name)) continue;
      const got = contrast(hex, ink['ink-700']!);
      expect(got, `state-${name} on a panel is ${got.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  /*
   * AND ON AIR IS DISTINGUISHABLE FROM ARMED WITHOUT COLOUR VISION. The
   * two carry different shapes as well (filled versus hollow), but if
   * their luminances matched, the shapes would be the only cue left —
   * and a shape is much harder to read at nine pixels than a brightness
   * difference is. [U-19]
   */
  it('separate on air from armed by brightness as well as by hue', () => {
    const live = luminance(state['live']!);
    const armed = luminance(state['armed']!);
    expect(Math.abs(live - armed)).toBeGreaterThan(0.1);
  });
});

/**
 * A FILLED BLOCK WITH A WORD ON IT IS TEXT.  [Doctrine D-04, U-19]
 *
 * The bar for a colour changes with what is drawn on it. A lamp is a
 * non-text element and clears 3:1; the moment the same colour becomes a
 * chip with "ON AIR" or "Open Studio Two" written across it, the bar is
 * the text bar, and it is measured against the ink the chip carries
 * rather than against the desk behind it.
 *
 * TWO OF THESE FAILED. The workspace wrote "ON AIR" in --ink-000 on the
 * live red: 4.00:1. Online TV's green carried its own name at 3.97:1.
 * Both were chosen against the dark ground, where they are plainly
 * visible, and nobody thought about the white sitting on top of them —
 * which is the whole reason this is a test and not a habit.
 *
 * The live red keeps its brightness for the job it is good at and hands
 * the chip to --state-live-dim (5.86:1); the green moved one step.
 */
describe('a colour that carries a word', () => {
  const ink = tokens();
  const chip = Object.fromEntries(
    [...CSS.matchAll(/--(studio-(?:one|two|tv)|state-live-dim):\s*(#[0-9a-f]{6});/gi)]
      .map(([, name, value]) => [name!, value!]));

  /* A loop over nothing passes, so count them first. */
  it('was found in the stylesheet, all four of them', () => {
    expect(Object.keys(chip).sort())
      .toEqual(['state-live-dim', 'studio-one', 'studio-tv', 'studio-two']);
  });

  it('reaches the text bar against the ink written on it', () => {
    for (const [name, hex] of Object.entries(chip)) {
      const got = contrast(hex, ink['ink-000']!);
      expect(got, `--${name} carries ink-000 at ${got.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  /*
   * AND IS STILL VISIBLE AS A BLOCK. Darkening a chip until its text
   * passes can push the chip itself into the background it sits on,
   * which trades one failure for another. 3:1 against the page. [U-19]
   */
  it('is still distinguishable from the surface it sits on', () => {
    for (const [name, hex] of Object.entries(chip)) {
      const got = contrast(hex, ink['ink-800']!);
      expect(got, `--${name} on the page is ${got.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(3);
    }
  });
});

/**
 * THE CONSOLE FACES ARE DARKER THAN THE RAMP WAS TUNED AGAINST.
 * [Doctrine D-04, CHANNEL §1]
 *
 * The neutral ramp's dim tones were measured against `--surface-*`,
 * whose lightest member is #22262b. The control room's module faces sit
 * BELOW that — #101317 for a face, #0a0c0f for the chassis — because a
 * desk is darker than a page, and a tone checked on one is not checked
 * on the other.
 *
 * It bit immediately: `--ink-450` on a module face is 1.96:1, and it was
 * the obvious pick for a panel's quietest legend. This suite is the
 * reason that lasted one commit.
 */
describe('the console surfaces', () => {
  const CONSOLE = readFileSync(join(STYLES, 'console.css'), 'utf8');
  const ink = tokens();
  const face = (name: string) => {
    const found = new RegExp(`--console-${name}:\\s*(#[0-9a-f]{6});`, 'i')
      .exec(CONSOLE);
    return found?.[1] ?? '';
  };

  it('declares a chassis, a face and a control', () => {
    for (const name of ['chassis', 'face', 'control']) {
      expect(face(name), `--console-${name} was not parsed`)
        .toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  /*
   * THE STEP BETWEEN LEVELS IS DELIBERATELY NEAR THE THRESHOLD. "The
   * difference between surfaces should be barely perceptible but
   * intentional." Barely perceptible has a floor as well as a ceiling:
   * below about 1.02 the seam disappears on a cheap panel, and above
   * about 1.25 the layout reads as a stack of cards again — which is
   * the thing this whole pass is removing.
   */
  it.each([
    ['chassis', 'face'],
    ['face', 'control'],
  ])('steps from %s to %s without becoming a card', (lower, upper) => {
    const got = contrast(face(lower), face(upper));
    expect(got, `${lower}→${upper} is ${got.toFixed(3)}:1`)
      .toBeGreaterThan(1.02);
    expect(got, `${lower}→${upper} is ${got.toFixed(3)}:1 — that is a card`)
      .toBeLessThan(1.25);
  });

  /*
   * AND EVERY TONE THE CONSOLE WRITES ON A FACE STILL HAS TO BE READ.
   * A module's label is text somebody reads to know what they are
   * looking at, so it takes the text bar on the darkest face it can
   * appear on.
   */
  it('keeps a module label legible on every face', () => {
    for (const surface of ['chassis', 'face', 'control']) {
      const got = contrast(ink['ink-300']!, face(surface));
      expect(got, `ink-300 on the ${surface} is ${got.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  /*
   * ink-450 IS BANNED FROM A CONSOLE FACE, by name, because it is the
   * tone somebody reaches for when they want something quiet and it is
   * the one that does not work here.
   */
  it('never writes a legend in the tone that fails here', () => {
    const offenders = [...CONSOLE.matchAll(/color:\s*var\(--ink-450\)/g)];
    expect(offenders.length,
      'ink-450 is 1.96:1 on a module face — use ink-400 or lighter')
      .toBe(0);
  });
});
