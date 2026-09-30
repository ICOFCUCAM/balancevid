/**
 * The system, kept.  [Doctrine D-04, D-19]
 *
 * A design system that is not enforced is a design system that was
 * applied once. Nothing in a compiler objects to `fontSize: 12.5` or
 * `background: '#1e2125'`, both of which are in this codebase's history,
 * and both of which are how a product drifts back into a sediment of
 * one-off values — slowly, in small correct-looking increments, by people
 * who never saw the file that says what the values should be.
 *
 * SO THIS IS A RATCHET RATHER THAN A RULE. There are still 244 raw hex
 * colours in the components: the token system landed in this pass and the
 * surfaces are being converted as each is worked on, so a test demanding
 * zero would fail today and be deleted tomorrow, which is worse than no
 * test. What it demands instead is that the number does not GROW.
 *
 * (322 and not the 297 I first wrote here. The shell command I counted
 * with matched six-digit hex and three-digit hex and nothing between, so
 * it missed every `#rrggbbaa`. The test's own regex is the number that
 * matters, and writing the budget from a different tool's count is how a
 * ratchet starts life already loose.
 *
 * AND THEN IT WAS LOOSE THE OTHER WAY. Thirty of the counted "colours"
 * were never colours: `&#9654;` is a play triangle, and a regex looking
 * for `#` followed by hex digits finds `9654` inside it very happily.
 * A budget inflated by a tenth is a budget with a tenth of a free pass
 * in it, so the regex now refuses a `#` that an `&` introduced, and the
 * number was re-baselined against what it actually measures.)
 *
 * A ratchet is an uncomfortable kind of test and it is the honest one
 * here. It says: this is where we are, this is the direction, and you may
 * not go backwards without noticing. When a surface is converted the
 * budget is lowered, and lowering it is the only edit to this file that
 * should ever be made.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

function components(dir = join(ROOT, 'app')): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...components(full));
    else if (/\.tsx$/.test(entry.name)) found.push(full);
  }
  return found;
}

/*
 * A COLOUR, AND NOT A CHARACTER REFERENCE. `&#9654;` is the play
 * triangle this interface is full of, and `#9654` is four hex digits
 * followed by a word boundary, so a naive pattern counts every glyph in
 * the product as a colour to be converted. The lookbehind is the whole
 * difference between a budget that measures something and a budget with
 * slack built into it.
 */
const RAW = /(?<!&)#[0-9a-fA-F]{3,8}\b/g;

/** Code only: a hex in a comment is documentation, not a value. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('raw colour in components', () => {
  /*
   * THE BUDGET. Lower it when a surface is converted; never raise it.
   * If this fails on a new feature, the fix is a token, not a bigger
   * number — and the tokens are in `app/styles/`.
   */
  const BUDGET = 76;

  it(`is at or below ${BUDGET} occurrences, and falling`, () => {
    const counts = components()
      .map((file) => ({
        file: file.slice(file.indexOf('app/')),
        n: (code(file).match(RAW) ?? []).length,
      }))
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n);
    const total = counts.reduce((sum, row) => sum + row.n, 0);
    expect(total, `worst offenders: ${counts.slice(0, 3)
      .map((row) => `${row.file} (${row.n})`).join(', ')}`)
      .toBeLessThanOrEqual(BUDGET);
  });

  /*
   * THE FILES THAT ARE DONE STAY DONE, which is the half of a ratchet
   * that actually changes behaviour. A global budget lets a converted
   * surface regress while another improves and the total holds; naming
   * the finished ones stops that.
   */
  it.each([
    'app/Confirm.tsx',
    'app/Notice.tsx',
    'app/SignOut.tsx',
    /* The building itself, converted whole rather than in patches. [D-24] */
    'app/Workspace.tsx',
  ])('%s uses tokens only', (name) => {
    const found = code(join(ROOT, name)).match(RAW) ?? [];
    expect(found, `raw colour in ${name}: ${found.join(', ')}`).toEqual([]);
  });
});

describe('the JSX the compiler will not take', () => {
  /*
   * A COMMENT CANNOT BE THE FIRST CHILD OF A `&&`.
   *
   *     {ready && (
   *       {/* why * /}          <- not valid JSX
   *       <p>…</p>
   *     )}
   *
   * `{cond && (` opens an EXPRESSION, and `{/* … * /}` is only a
   * comment where JSX children are expected — inside an expression it
   * is an object literal, and the parser fails on the first property.
   *
   * THIS IS HERE BECAUSE IT HAPPENED THREE TIMES IN TWO DAYS, and
   * every time it cost a full production build to find. `tsc --noEmit`
   * accepts it; only swc rejects it, which means the fast check passes
   * and the slow one fails thirty-five seconds later. A test that runs
   * in a millisecond is the right place for a rule the type-checker
   * does not enforce.
   */
  const OPENS_WITH_COMMENT = /&&\s*\(\s*\n\s*\{\s*\/\*/g;

  it('never opens a conditional with a comment', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const hits = readFileSync(file, 'utf8').match(OPENS_WITH_COMMENT);
      if (hits) offenders.push(`${file.slice(file.indexOf('app/'))} (${hits.length})`);
    }
    expect(offenders, 'a JSX comment opening a && expression').toEqual([]);
  });

  /*
   * AND THE PATTERN ITSELF IS TESTED, because a regex that matches
   * nothing passes this suite for ever while catching nothing — which
   * is the failure mode of every "assert there are no offenders" test
   * ever written.
   */
  it('recognises the shape that broke the build', () => {
    const bad = [
      '{ready && (\n  {/* why */}\n  <p />\n)}',
      '{a.b === 1 && (\n        {/*\n          * why\n          */}\n  <p />)}',
    ];
    for (const one of bad) {
      expect(new RegExp(OPENS_WITH_COMMENT.source).test(one), one).toBe(true);
    }
    /* And it does not object to a comment ABOVE the conditional. */
    expect(new RegExp(OPENS_WITH_COMMENT.source)
      .test('{/* why */}\n{ready && (\n  <p />\n)}')).toBe(false);
  });
});

describe('the scales are the only sizes', () => {
  /*
   * FRACTIONAL PIXELS ARE THE TELL. `fontSize: 12.5` was in this
   * codebase, and a half-pixel type size renders differently on every
   * platform — the difference landing precisely on the small sizes this
   * interface is mostly made of. Nobody chooses 12.5 from a scale; they
   * choose it because 12 looked small and 13 looked big.
   */
  it('has no fractional font sizes anywhere', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const hits = code(file).match(/fontSize:\s*'?\d+\.\d+/g);
      if (hits) offenders.push(`${file.slice(file.indexOf('app/'))}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  /*
   * A type size above the scale's top is a heading that escaped the
   * system. The scale runs to 27px; anything larger is somebody sizing
   * by eye against one particular screen.
   */
  it('has no font size larger than the scale goes', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      for (const [, size] of code(file).matchAll(/fontSize:\s*(\d{2,})[,\s}]/g)) {
        if (Number(size) > 27) {
          offenders.push(`${file.slice(file.indexOf('app/'))}: ${size}px`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the stylesheet itself', () => {
  const styles = join(ROOT, 'app', 'styles');
  const all = readdirSync(styles).filter((f) => f.endsWith('.css'));

  it('is loaded in full by the one entry point', () => {
    const globals = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    for (const file of all) {
      expect(globals, `${file} is never imported`).toContain(`./styles/${file}`);
    }
  });

  /*
   * THE REDUCED-MOTION RULE MUST EXIST SOMEWHERE. It was moved out of
   * globals.css during this pass, and a rule that is deleted rather than
   * moved would take a D-04 obligation with it, silently. [D-04]
   */
  it('still honours a request for less motion', () => {
    const css = all.map((f) => readFileSync(join(styles, f), 'utf8')).join('\n');
    expect(css).toContain('prefers-reduced-motion');
  });
});

/**
 * ONE VISUAL LANGUAGE FOR SPEAKER IDENTITY.  [Doctrine U-20]
 *
 * U-20 names the surfaces it applies to and the editor timeline is the
 * first of them: "a single speaker-identity system is defined once and
 * applied in every surface: the editor timeline, the transcript panel,
 * burned-in captions, lower-thirds, the conversation map, the article
 * transcript, and the shareable claim card."
 *
 * IT WAS NOT. The published article, the interactive player and the
 * presentation HTML all declare `--source: #7f9bb5; --user: #c2794f`.
 * Studio One's timeline drew the source in `#6fb3e0` — a different blue
 * — and drew RESPONSES, which are the user's, in that same source blue.
 * An operator marking up a conversation saw one identity system and
 * everybody they published to saw another.
 *
 * This is why the check reads the published surfaces rather than a
 * constant: the exports are the definition, and a test that agreed with
 * itself would have passed throughout.
 *
 * THERE ARE TWO LEGITIMATE PAIRS AND THAT IS NOT A VIOLATION. The article
 * and the interactive player each declare a light theme as well
 * (`--bg: #ffffff`), where the same two identities are darkened to stay
 * legible on white: #3c5a73 and #a35a34. One system, two grounds. The
 * first draft of this test asserted a single source colour, failed on
 * that pair, and was wrong — the code was right.
 */
describe('speaker identity is one system', () => {
  const published = ['src/present/html.ts', 'src/interactive/html.ts',
    'src/article/html.ts'].map((f) => readFileSync(join(ROOT, f), 'utf8'));

  /** What every published surface says the two speakers are. */
  const declared = (which: 'source' | 'user') => {
    const found = new Set<string>();
    for (const html of published) {
      for (const [, hex] of html.matchAll(
        new RegExp(`--${which}:\\s*(#[0-9a-f]{6})`, 'gi'))) found.add(hex!.toLowerCase());
    }
    return [...found];
  };

  it('is declared identically by every published surface', () => {
    /* Dark ground first, light ground second, and nothing else. */
    expect(new Set(declared('source')), 'the exports disagree about the source')
      .toEqual(new Set(['#7f9bb5', '#3c5a73']));
    expect(new Set(declared('user')), 'the exports disagree about the responder')
      .toEqual(new Set(['#c2794f', '#a35a34']));
  });

  /*
   * EVERY SURFACE WITH A DARK GROUND USES THE DARK PAIR. The failure this
   * catches is one export quietly adopting the light-theme blue on a dark
   * page, which would look almost right and be a different speaker.
   */
  it('uses the dark pair wherever the ground is dark', () => {
    for (const html of published) {
      const dark = html.match(/--panel:\s*#1[0-9a-f]{5}/i);
      if (!dark) continue;
      const near = html.slice(Math.max(0, html.indexOf(dark[0]) - 200),
        html.indexOf(dark[0]) + 60);
      expect(near, 'a dark surface is not using the dark identity')
        .toMatch(/#7f9bb5/);
    }
  });

  it('is the same system the editor timeline uses', () => {
    const timeline = code(join(ROOT, 'app', 'c', '[id]', 'Timeline.tsx'));
    /*
     * The timeline must name the tokens rather than any hex of its own.
     * A raw colour here is, by construction, a second identity system.
     */
    /*
     * IDENTITY COLOURS ONLY. The timeline legitimately draws chrome —
     * the trough it sits in, the amber of a pending claim — and a test
     * banning every hex there would be a test about the wrong thing.
     * What it may not do is write a SPEAKER's colour by hand, because a
     * speaker colour written twice is a speaker colour that will
     * eventually be written differently.
     */
    const identity = timeline.match(/#(7f9bb5|c2794f|3c5a73|a35a34|6fb3e0)\b/gi) ?? [];
    expect(identity,
      `the timeline writes speaker colours by hand: ${identity.join(', ')}`)
      .toEqual([]);
    expect(timeline).toContain('var(--user-accent)');
    expect(timeline).toContain('var(--source-accent)');
  });

  it('is the same system the stylesheet declares', () => {
    const globals = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    expect(globals).toContain('--source-accent: #7f9bb5');
    expect(globals).toContain('--user-accent: #c2794f');
  });
});

/**
 * A STUDIO'S COLOUR IS WRITTEN IN ONE PLACE.  [Doctrine D-24, D-19]
 *
 * The product is three studios and a building, and the workspace shows
 * all three at once — so the colour is what says which card belongs to
 * which room before a word of it is read. Online TV's green was written
 * in `Workspace.tsx` and again in `ChannelStudio.tsx`, five thousand
 * lines apart, which is the same shape of defect U-20 names for speaker
 * identity and has the same ending: one of the two gets adjusted.
 */
describe('studio identity', () => {
  const STUDIOS = join(ROOT, 'app', 'styles', 'studios.css');
  const css = readFileSync(STUDIOS, 'utf8');

  it('is declared, once, in the stylesheet', () => {
    for (const name of ['one', 'two', 'tv']) {
      expect(css, `--studio-${name} is not declared`)
        .toMatch(new RegExp(`--studio-${name}:\\s*#[0-9a-f]{6};`, 'i'));
    }
  });

  /*
   * And nowhere else. A component that writes the green by hand has
   * made a second Online TV, which will be a slightly different green
   * the first time anybody adjusts either one.
   */
  it('is never written by hand in a component', () => {
    const identity = [...css.matchAll(/--studio-\w+:\s*(#[0-9a-f]{6});/gi)]
      .map(([, hex]) => hex!.toLowerCase());
    expect(identity.length).toBe(3);
    const offenders: string[] = [];
    for (const file of components()) {
      const found = code(file).match(RAW) ?? [];
      for (const hex of found) {
        if (identity.includes(hex.toLowerCase())) {
          offenders.push(`${file.slice(file.indexOf('app/'))}: ${hex}`);
        }
      }
    }
    expect(offenders, `a second studio identity: ${offenders.join(', ')}`)
      .toEqual([]);
  });
});

/**
 * YOU CANNOT PUT AN ALPHA ON A TOKEN BY GLUING TWO CHARACTERS TO IT.
 *
 * `${colour}22` is the obvious way to get a translucent version of a
 * colour you were handed, it reads fine, and it works right up until the
 * caller passes `var(--state-ok)` instead of `#4f9d63`. Then the value
 * is `var(--state-ok)22`, which is not a colour, so the browser drops
 * the whole declaration and says nothing. The border, the halo or the
 * glow simply is not drawn, and it looks like a design choice.
 *
 * TWO OF THESE WERE LIVE IN THE PRODUCT when this test was written: every
 * notice in `Notice.tsx` had been borderless since the day it was
 * written, and three of the channel studio's five status lamps had been
 * unlit since the day they were converted to tokens. Neither looked
 * broken. `color-mix(in srgb, X 20%, transparent)` does the same job and
 * works for both a hex and a token.
 */
describe('translucency', () => {
  /*
   * THE THREE EXCEPTIONS ARE REAL ONES. Takes and speakers get their
   * colour from a fixed palette of raw hex in `src/domain/` — there is
   * no token to pass — so the suffix is correct there and converting
   * them would be churn. They are named rather than pattern-matched so
   * that a fourth cannot join them quietly.
   */
  const PALETTE_DRIVEN = [
    'app/p/[id]/SwitchingStage.tsx',
    'app/p/[id]/PerformanceStudio.tsx',
    'app/c/[id]/room/RoomView.tsx',
  ];

  it('is mixed rather than glued onto the end of a value', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const name = file.slice(file.indexOf('app/'));
      if (PALETTE_DRIVEN.includes(name)) continue;
      for (const [hit] of code(file).matchAll(/\$\{[^}]+\}[0-9a-fA-F]{2}\b/g)) {
        offenders.push(`${name}: ${hit}`);
      }
    }
    expect(offenders,
      `an alpha suffix that a token would break: ${offenders.join(', ')}`)
      .toEqual([]);
  });
});

/**
 * A TOKEN WITH A FALLBACK IS TWO ANSWERS.  [Doctrine D-19, U-20]
 *
 * `var(--user-accent, #6fb3e0)` reads as caution and is the opposite. The
 * fallback fires only when the token is missing — which, since every
 * surface in `app/` loads `globals.css`, is never — so it is dead code
 * that nonetheless has to be right, and none of the thirteen in this
 * product were. Every one named #6fb3e0, the source blue that Studio
 * One's timeline was corrected away from, and three of those thirteen
 * offered it as the fallback for the RESPONDER: if the token ever did go
 * missing, the person answering would be drawn in the colour of the
 * person being answered. Silently, and only then.
 *
 * The rule is: name the token, or write the value. Not both.
 */
describe('a custom property', () => {
  it('is named without a second answer behind it', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      for (const [hit] of code(file).matchAll(/var\(\s*--[\w-]+\s*,[^)]*\)/g)) {
        offenders.push(`${file.slice(file.indexOf('app/'))}: ${hit}`);
      }
    }
    expect(offenders, `a fallback that only fires when it is wrong: `
      + offenders.join(', ')).toEqual([]);
  });
});

/**
 * THE LIGHT-GROUND PAIR BELONGS TO THE PUBLISHED PAGE.  [Doctrine U-20]
 *
 * U-20's system has two grounds: #7f9bb5 / #c2794f on dark, and #3c5a73 /
 * #a35a34 darkened for white. The application has no light theme — the
 * article and the interactive player do — so a light-ground identity
 * inside `app/` is, by construction, a speaker drawn in a colour for a
 * page this surface never renders.
 *
 * ONE WAS. Studio One gave the conversation's author #a35a34, in the two
 * places the author is ever drawn, so the one person guaranteed to be in
 * every conversation wore the light theme's orange on a dark desk.
 */
describe('speaker identity in the application', () => {
  /* Both grounds' colours, as hex and as the rgb() triples they hide in. */
  const DARK = { source: '#7f9bb5', user: '#c2794f' };
  const LIGHT = { source: '#3c5a73', user: '#a35a34' };
  const OLD_SOURCE = '#6fb3e0';

  const triple = (hex: string) => [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

  it('never uses the light-theme pair, which this surface cannot show', () => {
    const banned = [LIGHT.source, LIGHT.user];
    const offenders: string[] = [];
    for (const file of components()) {
      const body = code(file);
      for (const hex of banned) {
        if (new RegExp(hex, 'i').test(body)) {
          offenders.push(`${file.slice(file.indexOf('app/'))}: ${hex}`);
        }
      }
    }
    expect(offenders, `a light-ground identity on a dark surface: `
      + offenders.join(', ')).toEqual([]);
  });

  /*
   * NOR THE BLUE THAT WAS NEVER IN THE SYSTEM. #6fb3e0 is the colour
   * Studio One's timeline drew the source in before U-20 was enforced,
   * and it survived in fifteen selection borders and thirteen fallbacks
   * long after the timeline was fixed — close enough to the source blue
   * to read as it, and used for things that are not a speaker at all.
   */
  it('never uses the blue the system replaced', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      if (new RegExp(OLD_SOURCE, 'i').test(code(file))) {
        offenders.push(file.slice(file.indexOf('app/')));
      }
    }
    expect(offenders, `the pre-U-20 blue is still here: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  /*
   * AND AN IDENTITY HIDDEN IN AN rgba() IS STILL AN IDENTITY. `rgba(127,
   * 155, 181, 0.22)` is the source accent; nothing about reading it says
   * so, and it does not move when the token does.
   */
  it('never writes an identity as three numbers', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const body = code(file).replace(/\s/g, '');
      for (const [which, hex] of Object.entries(DARK)) {
        if (body.includes(`rgba(${triple(hex)},`)
          || body.includes(`rgb(${triple(hex)})`)) {
          offenders.push(`${file.slice(file.indexOf('app/'))}: ${which}`);
        }
      }
    }
    expect(offenders, `an identity written as an rgb triple: `
      + offenders.join(', ')).toEqual([]);
  });
});

/**
 * WHICH ONE IS CHOSEN, SAID ONCE.  [Doctrine D-04, D-19, U-19]
 *
 * A row of identical buttons where one is chosen is the commonest
 * control in this product — the mode tabs, the mark tools, the sound
 * modes, the publish styles, the pin. `controls.css` has had a rule for
 * it all along: an almost-invisible fill, a lit border at 4.30:1 and a
 * two-pixel marker on the leading edge, because the fill is not the
 * signal and the two structural cues are what survive greyscale.
 *
 * EIGHT PLACES WROTE THEIR OWN ANYWAY: `background: '#2b5f8a'` inline, a
 * sixth blue at 2.45:1 against the surface behind it, with enough
 * specificity to suppress the rule it was imitating. Five of those eight
 * had no ARIA state at all — `data-on`, `data-armed`, `data-chosen`,
 * which are for tests and announce nothing — so the state was invisible
 * to a screen reader and nearly invisible to the eye.
 */
describe('a chosen control', () => {
  it('has exactly one rule saying what chosen looks like', () => {
    const css = readFileSync(join(ROOT, 'app', 'styles', 'controls.css'), 'utf8');
    expect(css).toMatch(/button\[aria-pressed='true'\][\s\S]{0,300}?box-shadow:\s*inset/);
  });

  /*
   * AND NOWHERE OVERRIDES IT WITH A COLOUR OF ITS OWN. A conditional
   * `background` on a button is, nine times in ten, somebody
   * re-inventing this rule — and it wins, because an inline style
   * always does.
   */
  it('is never re-invented inline', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      for (const [hit] of code(file)
        .matchAll(/background:\s*[\w.=!' ]+\?\s*'#[0-9a-fA-F]{3,8}'/g)) {
        offenders.push(`${file.slice(file.indexOf('app/'))}: ${hit}`);
      }
    }
    expect(offenders, `a selected state drawn by hand: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  /*
   * A TOGGLE SAYS ITS STATE IN ARIA. `data-armed` is for this test
   * suite; `aria-pressed` is for the person who cannot see the border.
   * Every button in the product that stores an on/off state in a
   * `data-` attribute must carry the ARIA one too. [D-04]
   */
  it('announces its state rather than only storing it for the tests', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const body = code(file);
      for (const match of body.matchAll(
        /data-(?:on|armed|chosen|open)=\{[^}]*\?\s*'true'\s*:\s*'false'\}/g)) {
        const open = body.lastIndexOf('<button', match.index);
        if (open < 0) continue;
        const tag = body.slice(open, body.indexOf('>', match.index));
        if (!/aria-(pressed|selected|expanded)=/.test(tag)) {
          offenders.push(`${file.slice(file.indexOf('app/'))}: ${
            /data-testid="([^"]+)"/.exec(tag)?.[1] ?? 'a button'}`);
        }
      }
    }
    expect(offenders, `state stored for tests and not announced: ${
      offenders.join(', ')}`).toEqual([]);
  });
});

/**
 * THE MATERIALS A BROADCAST DESK IS NOT MADE OF.  [brief §4, §19]
 *
 * The art-direction brief rules out five things by name, and each of
 * them is something a person adds in good faith to make a surface look
 * more finished: glass, glow, big gradients, deep rounding, floating
 * cards. Every one of them was somewhere in this product.
 *
 * They are banned here rather than merely removed because the failure
 * mode is not "somebody puts them all back" — it is one blur on one
 * overlay, added by somebody who has not read a brief written a year
 * earlier, on the day they are making a plate legible over a bright
 * shot. Which is exactly how the three on the programme monitor got
 * there.
 */
const named = (file: string) => file.slice(file.indexOf('app/'));

describe('the console has no glass and no glow', () => {
  /*
   * GLASSMORPHISM. On a broadcast monitor it is not merely a fashion:
   * a blurred sample of the picture behind a status readout means the
   * readout changes appearance with the programme, and the programme
   * is the thing being judged. It also costs a compositor pass per
   * frame on a surface that repaints thirty times a second.
   */
  it('frosts nothing', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      if (/backdropFilter|backdrop-filter/.test(code(file))) {
        offenders.push(named(file));
      }
    }
    expect(offenders, `frosted glass in: ${offenders.join(', ')}`).toEqual([]);
  });

  /*
   * A GLOW IS A SPREAD SHADOW IN THE OBJECT'S OWN HUE, and on a dark
   * desk it reads as the object being out of focus. The playhead, the
   * take button, the emergency and the live tile all had one; a
   * hairline at full contrast is found faster and stays sharp.
   *
   * The lamps are the exception and are allowed exactly one: a tally
   * light has had a halo since the 1950s, it is the cue that survives
   * being seen in peripheral vision, and `status.css` is where it
   * lives. Anything outside that file is somebody decorating.
   *
   * THE FIRST VERSION OF THIS MISSED A GLOW ASSEMBLED IN A TEMPLATE
   * LITERAL. The level meter built one per segment as
   * `` `0 0 4px ${colour}` ``, and the pattern was looking for `rgba(`
   * immediately after the blur radius. A rule that only catches the
   * literal spelling catches the careless half and misses the clever
   * half, which is the wrong half to miss.
   *
   * AND THE SECOND VERSION MISSED A THIRD SPELLING: the clip rail's
   * claim marker built its halo with `color-mix(in srgb, ...)`, which
   * is none of `rgba(`, `${` or `var(`. Three spellings of the same
   * decoration found over three commits is the argument for matching
   * on the SHAPE — a blur radius with any colour after it — rather
   * than on a list of ways to write a colour, which is what this now
   * does. A genuine ambient shadow is dark and is spelled rgba(0,0,0.
   */
  it('glows only where a lamp glows', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const body = code(file);
      /*
       * ONE LAMP CANNOT LIVE IN status.css. `Dot` takes its colour as
       * a prop — the encoder lamp, the guest lamps and the ingest
       * lamps each pass a different token — so its halo has to be
       * mixed in the component. It is a lamp by the rule's own words,
       * so it is exempt by name and by span rather than by the file
       * it happens to sit in. Everything else in that file still
       * counts.
       */
      const lamp = body.indexOf('function Dot(');
      const lampEnds = lamp < 0 ? -1
        : body.indexOf('\nfunction ', lamp + 1);
      for (const hit of body.matchAll(
        /(?<!inset )0 0 (?:[4-9]|[1-9]\d)px (?!rgba\(0,\s*0,\s*0)[#$a-z(]/gi)) {
        const at = hit.index ?? 0;
        if (lamp >= 0 && at > lamp && (lampEnds < 0 || at < lampEnds)) continue;
        offenders.push(`${named(file)}: ${hit[0].trim().slice(0, 52)}`);
      }
    }
    expect(offenders, `a glow outside status.css: ${offenders.join(' | ')}`)
      .toEqual([]);
  });
});
