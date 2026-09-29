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
   *
   * 164 → 25 in one commit, which is not 139 decisions: 10, 11, 12 and
   * 13 ARE the scale — `--text-2xs` through `--text-base` are those
   * exact pixels — so those were a rename with no visual change at all.
   * What is left is the genuinely off-scale, and those are decisions.
   */
  const SIZES = 25;

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
  /*
   * "Avoid excessive rounded corners. Use corner radii consistently and
   * modestly." A 10px radius repeated across eight panels is the
   * strongest "web app" signal an interface can emit, and the control
   * room was emitting it eight times.
   *
   * THE DESKS ARE AT ZERO NOW, so this is a ban rather than a budget —
   * for the five operating surfaces only. A circle is exempt, which
   * the first version of this was not: `'50%'` on an avatar and a lamp
   * matched the pattern, and a round thing being round is not a
   * rounded corner.
   */
  const LARGE = /borderRadius:\s*'?(?:(?:[89]|[1-9]\d)(?:px)?|var\(--radius-(?:lg|xl)\))(?!%)'?/g;

  it.each(DESKS)('%s rounds nothing like a card', (file) => {
    const found = [...code(join(ROOT, file)).matchAll(LARGE)]
      .map(([hit]) => hit);
    expect(found, `${file}: ${found.join(', ')}`).toEqual([]);
  });

  /*
   * AND THE BUILDING KEEPS ITS ROUNDING, deliberately. The lit lobby is
   * made of cards because on a lit page a card is the right object —
   * the argument in this pass is about what a CONSOLE is made of, not
   * about radii being bad. A rule that pushed 2px corners onto the home
   * page would be cargo-culting the conclusion past its reason.
   */
  it('leaves the lit building alone', () => {
    const building = code(join(ROOT, 'app', 'Workspace.tsx'));
    expect([...building.matchAll(LARGE)].length,
      'the building stopped being made of cards').toBeGreaterThan(5);
  });
});

/**
 * THE LEGEND UNDER THE PICTURE IS MEASURED.  [brief §5]
 *
 * A broadcast monitor says what it is looking at. The easy way to
 * ship that is to print the house format, because the house format is
 * a constant and the constant is right almost always — and "almost
 * always" is the failure mode that matters, since a legend is what an
 * operator reads when the picture already looks wrong.
 *
 * So this holds the legend to reading the element rather than naming
 * a format. It is a real risk and not a hypothetical one: the version
 * of this component I did not ship had `1920×1080` in it.
 */
describe('the signal legend', () => {
  const PROGRAM = code(join(ROOT, 'app', 't', '[id]', 'ChannelStudio.tsx'));
  const LEGEND = PROGRAM.slice(PROGRAM.indexOf('function Legend('),
    PROGRAM.indexOf('function Monitor('));

  it('exists under Program Output', () => {
    expect(LEGEND, 'the Legend component is gone').not.toBe('');
    expect(PROGRAM, 'the legend is not mounted').toContain('<Legend on={on} />');
  });

  it('reads the picture rather than naming a format', () => {
    expect(LEGEND).toContain('videoWidth');
    expect(LEGEND).toContain('naturalWidth');
    /*
     * No raster written down. 1920, 1080, 1280, 720, 3840, 2160 —
     * any of them in here means somebody decided what the signal is
     * instead of asking it.
     */
    const asserted = [...LEGEND.matchAll(/\b(?:3840|2160|1920|1280|1080|720)\b/g)];
    expect(asserted.map(([hit]) => hit),
      'the legend states a raster instead of measuring one').toEqual([]);
  });

  /*
   * AND IT SAYS SO WHEN THERE IS NOTHING TO MEASURE, rather than
   * holding the last thing it saw. A stale raster on a dead input is
   * the one thing worse than no raster at all.
   */
  it('admits to no signal', () => {
    expect(LEGEND).toContain('NO SIGNAL');
    expect(LEGEND).toMatch(/setFormat\(null\)/);
  });

  /*
   * THE FRAME RATE IS ONLY CLAIMED WHERE IT IS KNOWABLE. A browser
   * will not tell you a file's rate; a MediaStream track will tell
   * you its own. So the number comes from track settings and is
   * omitted otherwise — `rate !== null` rather than a fallback to
   * HOUSE_FPS, which would print 30 over a 24 fps film.
   */
  it('claims a frame rate only from the track', () => {
    expect(LEGEND).toContain('getSettings');
    expect(LEGEND).toContain('rate !== null');
    expect(LEGEND, 'the legend falls back to the house rate')
      .not.toContain('HOUSE_FPS');
  });
});
