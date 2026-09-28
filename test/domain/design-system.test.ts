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
 * ratchet starts life already loose.)
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
  const BUDGET = 244;

  it(`is at or below ${BUDGET} occurrences, and falling`, () => {
    const counts = components()
      .map((file) => ({
        file: file.slice(file.indexOf('app/')),
        n: (code(file).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length,
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
  ])('%s uses tokens only', (name) => {
    const found = code(join(ROOT, name)).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(found, `raw colour in ${name}: ${found.join(', ')}`).toEqual([]);
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
