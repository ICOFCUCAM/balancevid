/**
 * The control room is one instrument.  [Doctrine D-04, D-19, art-direction brief]
 *
 * THE BRIEF'S GOVERNING SENTENCE was "art-direct and premiumize the
 * existing broadcast console in place, preserving its containers,
 * colors, architecture and functionality while eliminating the visual
 * language of generic SaaS cards."
 *
 * "Eliminating a visual language" is not a thing a diff can be checked
 * for, so this file names the specific objects that language is made
 * of and holds the product to their absence. Each one is something that
 * was genuinely there, in a specific place, doing a specific harm —
 * not a style preference written as a rule.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const CONSOLE = readFileSync(
  join(ROOT, 'app', 'styles', 'console.css'), 'utf8');

function components(dir = join(ROOT, 'app')): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...components(full));
    else if (/\.tsx$/.test(entry.name)) found.push(full);
  }
  return found;
}

const code = (file: string) => readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const named = (file: string) => file.slice(file.indexOf('app/'));

/**
 * THE FIVE SURFACES A PERSON OPERATES, as opposed to the panels they
 * fill in. These are the rooms: the control room, both studios, the
 * conversation room, and the switching stage. A form can keep a
 * conventional primary button; a desk cannot.
 */
const DESKS = [
  'app/t/[id]/ChannelStudio.tsx',
  'app/c/[id]/Studio.tsx',
  'app/c/[id]/room/RoomView.tsx',
  'app/p/[id]/PerformanceStudio.tsx',
  'app/p/[id]/SwitchingStage.tsx',
];

describe('the console material', () => {
  it('declares three surfaces and one border language', () => {
    for (const token of ['chassis', 'face', 'control', 'seam', 'edge', 'rule']) {
      expect(CONSOLE, `--console-${token} is missing`)
        .toContain(`--console-${token}:`);
    }
  });

  /*
   * A MODULE IS IN THE DESK, NOT ABOVE IT. A drop shadow says "floating
   * above the page", which is what a card does. The only shadows a
   * module may carry are the one-pixel top bevel and the inset well.
   */
  it('lifts a module with a bevel rather than a shadow', () => {
    expect(CONSOLE).toMatch(/--console-bevel:\s*inset 0 1px 0/);
    expect(CONSOLE).toMatch(/--console-well:\s*inset/);
    const module = CONSOLE.slice(CONSOLE.indexOf('\n.module {'),
      CONSOLE.indexOf('\n.module.is-well'));
    expect(module, 'a module casts a shadow')
      .not.toMatch(/box-shadow:[^;]*(?<!inset )\d+px \d+px/);
  });
});

describe('the desks', () => {
  /*
   * NO GENERIC PRIMARY BUTTON ON A DESK. `.primary` is the product's
   * filled blue — correct on a form, and on an operating surface it is
   * the object the brief rules out by name. The desks use `.ctl` with a
   * weight, so a loud control is loud by being LIT rather than by being
   * a different kind of object.
   *
   * The forms keep theirs. This is not a campaign against blue buttons;
   * it is about what a control room is made of.
   */
  it.each(DESKS)('%s raises no generic CTA', (file) => {
    const body = code(join(ROOT, file));
    const found = [...body.matchAll(/className=(?:"|{`)primary/g)];
    expect(found.length,
      `${file} still has a .primary — desks use .ctl.is-critical`)
      .toBe(0);
  });

  /*
   * AND THE CONSOLE CONTROL IS ACTUALLY USED. A ban with no adoption is
   * a ban that was satisfied by deleting buttons.
   */
  it.each(DESKS)('%s uses the console control', (file) => {
    expect(code(join(ROOT, file))).toMatch(/className=(?:"|\{`|\{')[^"`']*\bctl\b/);
  });
});

/**
 * THE LEGEND IS ONE VOICE.  [brief §13]
 *
 * "Program Output", "Multi-view", "24/7 Schedule", "Takes", "Sound",
 * the timeline's four lane names, the application bar's six places and
 * every tab strip were set five different ways — 13px semibold, 15px
 * bold, 14px in an `<h2>`, sentence case, title case. They name things,
 * which makes them signage, and signage is read by shape.
 *
 * `.module-label` is the one treatment. What this checks is that the
 * shape of it has not drifted, because the value of a single voice is
 * entirely in there being one.
 */
describe('the legend', () => {
  it('is small, uppercase and tracked', () => {
    const rule = CONSOLE.slice(CONSOLE.indexOf('.module-label {'),
      CONSOLE.indexOf('}', CONSOLE.indexOf('.module-label {')));
    expect(rule).toMatch(/font-size:\s*var\(--text-2xs\)/);
    expect(rule).toMatch(/text-transform:\s*uppercase/);
    expect(rule).toMatch(/letter-spacing:\s*0\.1em/);
  });

  /*
   * AND THE DESKS ARE LOSING THEIR HAND-WRITTEN SIZES.
   *
   * The first draft of this test banned any `fontSize` of 15 or more on
   * a desk, on the theory that a panel title at heading size is a
   * heading that escaped. It failed on the Room's `<h1>` — which is a
   * page title and genuinely a heading — and on a placeholder glyph
   * sized 16 with opacity 0.4, which is furniture. A rule that fires on
   * two correct things and one wrong one is measuring the wrong
   * property.
   *
   * What is actually true is narrower and countable: a type scale
   * exists, a number written by hand is a size chosen by eye against
   * one screen, and the desks are full of them. So it is a ratchet,
   * like the raw colours. Lower it when a surface is converted.
   */
  const SIZES = 164;

  it(`writes at most ${SIZES} sizes by hand across the desks`, () => {
    const counts = DESKS.map((file) => ({
      file,
      n: (code(join(ROOT, file)).match(/fontSize:\s*\d/g) ?? []).length,
    })).sort((a, b) => b.n - a.n);
    const total = counts.reduce((sum, row) => sum + row.n, 0);
    expect(total, `worst: ${counts.slice(0, 2)
      .map((row) => `${row.file} (${row.n})`).join(', ')}`)
      .toBeLessThanOrEqual(SIZES);
  });
});

/**
 * THE RADIUS RATCHET.  [brief §4]
 *
 * "Avoid excessive rounded corners. Use corner radii consistently and
 * modestly." A 10px radius repeated across eight panels is the single
 * strongest "web app" signal an interface can emit, and the control
 * room was emitting it eight times.
 *
 * A number rather than a ban, for the same reason the raw-colour
 * budget is: there are legitimate large radii left in surfaces this
 * pass has not reached, and a test demanding zero would fail today and
 * be deleted tomorrow. Lower it when a surface is converted.
 */
describe('rounding', () => {
  const BUDGET = 96;

  it(`is at or below ${BUDGET} large radii, and falling`, () => {
    const counts = components()
      .map((file) => ({
        file: named(file),
        n: (code(file).match(
          /borderRadius:\s*(?:'?(?:[89]|[1-9]\d+)(?:px)?'?|'?var\(--radius-(?:lg|xl)\))/g)
          ?? []).length,
      }))
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n);
    const total = counts.reduce((sum, row) => sum + row.n, 0);
    expect(total, `worst: ${counts.slice(0, 3)
      .map((row) => `${row.file} (${row.n})`).join(', ')}`)
      .toBeLessThanOrEqual(BUDGET);
  });
});
