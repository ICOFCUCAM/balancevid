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
   * AND THE STUDIOS WRITE NO SIZES BY HAND AT ALL.
   *
   * This started as a ratchet at 164, because the first draft — a ban
   * on any `fontSize` of 15 or more on a desk — fired on the Room's
   * `<h1>`, which is a page title and genuinely a heading, and on a
   * placeholder glyph, which is furniture. A rule that is wrong about
   * two things out of three is measuring the wrong property, so it
   * became a countable budget instead: a number written by hand is a
   * size chosen by eye against one screen, and you can simply count
   * them.
   *
   * 164 → 25 → 6 → 0 over four commits, and at zero a budget is worse
   * than a ban: it invites the next one. The scale has eight steps and
   * they cover everything the three studios needed, which is the
   * argument the number was standing in for all along.
   *
   * The building is deliberately not included, for the same reason it
   * keeps its rounding — this is a claim about what a console is made
   * of, and the lobby is not one.
   */
  const STUDIOS = ['t', 'c', 'p']
    .flatMap((route) => components(join(ROOT, 'app', route, '[id]')));

  it('writes no size by hand anywhere in the three studios', () => {
    const offenders = STUDIOS.flatMap((file) =>
      (code(file).match(/fontSize:\s*\d+/g) ?? [])
        .map((hit) => `${named(file)}: ${hit}`));
    expect(offenders, 'the scale has eight steps — use one').toEqual([]);
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
   * THE THREE STUDIOS ARE AT ZERO NOW, so this is a ban rather than a
   * budget — and it covers every file under the studio routes, not the
   * five desks. The narrow version was satisfied while eight 8px and
   * 10px corners sat one import away in the panels the desks open: a
   * slide writer, a clip rail, a publish chooser, the pages a viewer
   * sees. A rule scoped to the files somebody already fixed is a
   * record of past work, not a rule.
   *
   * A circle is exempt, which the first version of this was not:
   * `'50%'` on an avatar and a lamp matched the pattern, and a round
   * thing being round is not a rounded corner.
   */
  const LARGE = /borderRadius:\s*'?(?:(?:[89]|[1-9]\d)(?:px)?|var\(--radius-(?:lg|xl)\))(?!%)'?/g;

  const ROOMS = ['t', 'c', 'p']
    .flatMap((route) => components(join(ROOT, 'app', route, '[id]')));

  it('rounds nothing like a card anywhere in the three studios', () => {
    const found = ROOMS.flatMap((file) =>
      [...code(file).matchAll(LARGE)].map(([hit]) => `${named(file)}: ${hit}`));
    expect(found, 'modules take --radius-module, controls --radius-control, '
      + 'pictures --radius-screen').toEqual([]);
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

/**
 * WHAT MEASURING A REAL FEED TAUGHT THE LEGEND.
 *
 * Both of these were found by pointing the desk at an actual picture
 * rather than by reasoning about one, and neither would have been
 * caught by a test written from the same head that wrote the code —
 * because that head reaches for 1920×1080, and 1920×1080 is the one
 * input where both bugs are invisible.
 */
describe('the legend against a real picture', () => {
  const PROGRAM = code(join(ROOT, 'app', 't', '[id]', 'ChannelStudio.tsx'));
  const LEGEND = PROGRAM.slice(PROGRAM.indexOf('function Legend('),
    PROGRAM.indexOf('function Status('));

  /*
   * A COPRIME RASTER HAS NO RATIO. A 1464×823 canvas feed reduced to
   * "1464:823" — true, useless, and wider on screen than the raster it
   * was explaining. Broadcast ratios are all small, so the reduction
   * is only printed when it stays small.
   */
  it('prints a ratio only when it is one people use', () => {
    expect(LEGEND).toMatch(/<=\s*32/);
  });

  /*
   * AND THE RATE IS NEVER ROUNDED INTO THE HOUSE RATE. The same feed
   * ran at 24; a legend that snapped it to 30 because 30 is the house
   * rate would be stating the desk's assumption as the signal's fact.
   */
  it('reports the rate the track gives', () => {
    expect(LEGEND).toMatch(/Math\.round\(fps\)/);
  });
});

/**
 * A PICTURE IS NOT A THUMBNAIL.  [brief §4, §5]
 *
 * The surface this entire product exists to put a picture on was
 * rounded at 8 and 10 pixels in seven places, including the two pages
 * a VIEWER sees. Ten pixels on a video is the shape of a card in a
 * feed, and that association is the wrong one for a broadcast
 * monitor: a screen has square corners, and rounding them is the
 * difference between a monitor and a thumbnail.
 *
 * The rule is a token rather than a number in seven files, so this
 * checks the token is what the pictures actually use — a token
 * nobody references is a comment.
 */
describe('the pictures', () => {
  const SCREENS: [string, number][] = [
    ['app/t/[id]/ChannelStudio.tsx', 2],
    ['app/t/[id]/watch/ChannelPlayer.tsx', 1],
    ['app/c/[id]/Stage.tsx', 2],
    ['app/p/[id]/watch/Watch.tsx', 2],
    ['app/p/[id]/RoomPlate.tsx', 1],
  ];

  it('names the screen radius once', () => {
    expect(CONSOLE).toMatch(/--radius-screen:\s*2px/);
  });

  /*
   * A FLOOR RATHER THAN AN EXACT COUNT, because the token turned out
   * to belong to more than the pictures: what is PRINTED on a picture
   * takes the same corner, so unifying the OSD plates added a fourth
   * use in the control room and broke an exact count that was never
   * measuring the right thing. The real guarantee is the next test —
   * this one only says the token is load-bearing in each file.
   */
  it.each(SCREENS)('%s draws its picture on the token', (file, count) => {
    const hits = (code(join(ROOT, file)).match(/var\(--radius-screen\)/g) ?? []);
    expect(hits.length, `${file} has ${hits.length}, wanted ${count} or more`)
      .toBeGreaterThanOrEqual(count);
  });

  /*
   * AND NO PICTURE IS ROUNDED LIKE A CARD ANYWHERE IN THE STUDIOS. The
   * per-file counts above would pass if somebody added an eighth
   * picture at 10px in a new file, which is exactly how the first
   * seven got there.
   */
  it('rounds no video or canvas like a card', () => {
    const offenders: string[] = [];
    for (const file of ['t', 'c', 'p']
      .flatMap((route) => components(join(ROOT, 'app', route, '[id]')))) {
      const body = code(file);
      /* A style block that sets a large radius and also says it is a
         picture: an aspect ratio, a black bed, or object-fit. */
      for (const [block] of body.matchAll(/\{[^{}]*borderRadius:\s*'?(?:[89]|[1-9]\d)(?:px)?'?[^{}]*\}/g)) {
        if (/aspectRatio|objectFit|#000\b|#08090b/.test(block)) {
          offenders.push(`${named(file)}: ${block.replace(/\s+/g, ' ').slice(0, 70)}`);
        }
      }
    }
    expect(offenders, 'a picture rounded like a card').toEqual([]);
  });
});

/**
 * AN OSD IS PRINTED ON THE GLASS.  [brief §5, §19, U-20]
 *
 * Three studios draw plates on top of a picture — a clock, a name, a
 * state. They had settled into three different objects: flat black
 * with a hairline in the control room, a saturated fill of the take's
 * own colour in Studio Two, a near-black box with 4px corners for the
 * clock beside it.
 *
 * The rule the control room arrived at is the right one everywhere: a
 * readout over a picture is opaque, square and quiet, because the
 * thing underneath it is the thing being judged. Identity rides a
 * lamp or a leading edge, never a flood — a saturated plate makes the
 * label the loudest thing on the frame it is labelling.
 */
describe('what sits on a picture', () => {
  const STAGE = code(join(ROOT, 'app', 'p', '[id]', 'SwitchingStage.tsx'));

  /*
   * The first version of this banned `background: take.accent`
   * outright and failed on two things that are right: an 8px round
   * lamp beside a take's name, and the numbered take keys in the
   * transport — which are the physical source buttons of a switcher,
   * and source buttons are lit in their source's colour on every desk
   * ever built. The rule is about a LABEL LYING ON A PICTURE, so that
   * is what it checks.
   */
  it('labels a monitor with a plate, not with the take\'s colour', () => {
    const label = STAGE.slice(STAGE.indexOf("position: 'absolute', left: 6, bottom: 6"));
    const block = label.slice(0, label.indexOf('}}'));
    expect(block, 'the monitor label floods with take.accent')
      .not.toMatch(/background: take\.accent/);
    expect(block, 'the monitor label is not the agreed plate')
      .toContain("background: 'rgba(0,0,0,0.72)'");
  });

  it('carries take identity on an edge', () => {
    expect(STAGE).toMatch(/borderLeft: `3px solid \$\{take\.accent/);
  });

  /*
   * AND THE PLATES AGREE ACROSS THE STUDIOS. One alpha, one hairline.
   * Two studios drawing the same object two ways is the thing a
   * viewer reads as "assembled from parts", and it is invisible in
   * any single screenshot.
   */
  it.each([
    ['app/t/[id]/ChannelStudio.tsx', 3],
    ['app/p/[id]/SwitchingStage.tsx', 3],
  ])('%s draws its plates one way', (file, atLeast) => {
    const body = code(join(ROOT, file));
    const plates = (body.match(/background: 'rgba\(0,0,0,0\.72\)'/g) ?? []).length;
    expect(plates, `${file} has ${plates} plates at the agreed alpha`)
      .toBeGreaterThanOrEqual(atLeast);
  });

  /*
   * AND NOBODY HAS A PRIVATE NEAR-BLACK. Three turned up: rgba(5,7,10,
   * 0.78) for Studio Two's clock, rgba(0,0,0,0.78) for the control
   * room's input numbers, and rgba(0,0,0,0.74) on the view toggle,
   * against the agreed 0.72. Two of the three were found by this test
   * rather than by me. None is distinguishable from the others by
   * eye, which is the point: each was arrived at by eye.
   */
  it('has no private near-black anywhere in the studios', () => {
    /*
     * BY SHAPE, NOT BY LIST. The first version named the two darks it
     * knew about; the next commit found a third, then a fourth, then a
     * seventh — rgba(14,15,17,0.82) in the clip rail. A ban that has
     * to be extended every time somebody invents a near-black is not
     * catching them, it is recording them.
     *
     * So: any near-black used as a BACKGROUND is a plate, and there is
     * one plate. The property matters and the first attempt at this
     * ignored it — matching the colour alone flagged sixteen things,
     * of which twelve were right: the hard rings this same commit
     * added, two text shadows, a gradient stop. A shadow and a surface
     * are different jobs that happen to be spelled with the same
     * colour, and only one of them is a plate.
     */
    const offenders: string[] = [];
    for (const file of ['t', 'c', 'p']
      .flatMap((route) => components(join(ROOT, 'app', route, '[id]')))) {
      const body = code(file);
      for (const hit of body.matchAll(
        /background: '?rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(0?\.\d+)\s*\)/g)) {
        const [r, g, b] = [1, 2, 3].map((i) => Number(hit[i]));
        const alpha = Number(hit[4]);
        if (r! > 39 || g! > 39 || b! > 39) continue;
        if (alpha < 0.6 || alpha > 0.95) continue;
        if (/rgba\(0,\s*0,\s*0,\s*0\.72\)/.test(hit[0])) continue;
        offenders.push(`${named(file)}: ${hit[0].replace("background: '", '')}`);
      }
    }
    expect(offenders, 'use rgba(0,0,0,0.72) — the plate alpha').toEqual([]);
  });
});
