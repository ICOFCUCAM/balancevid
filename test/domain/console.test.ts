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
   * AND THE WHOLE CONTROL ROOM COUNTS, not the one file named above.
   *
   * `ChannelStudio.tsx` was clean while two filled blue buttons sat in
   * `GuestsTab` and `SlidesPanel` — which are not somewhere else, they
   * are the GUESTS and GRAPHICS tabs of the Live Studio, rendered
   * inside the console's right-hand column. A ban scoped to the file
   * somebody already fixed measures the fix, not the rule.
   *
   * Studio One and Studio Two are deliberately NOT included. Their
   * routes hold genuine forms — the export panel, the publish stage,
   * the room plate's setup flow — and a form keeps a conventional
   * primary button. This was never a campaign against blue buttons;
   * it is about what an operating surface is made of, and `app/t` is
   * an operating surface all the way down.
   */
  it('raises no generic CTA anywhere in the control room', () => {
    const found = components(join(ROOT, 'app', 't', '[id]'))
      .flatMap((file) => [...code(file).matchAll(/className=(?:"|\{`)primary/g)]
        .map(() => named(file)));
    expect(found, 'the control room is a desk in every file').toEqual([]);
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
  /*
   * THE RADIUS BAN STARTS AT 8, which let a 6px self-view through in
   * the Room — the one place where "a bit rounded" reads as friendly
   * and is therefore most tempting. A picture takes the picture
   * radius; there is no in-between.
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

/**
 * A PANEL TITLE IS A LEGEND, WHATEVER TAG IT USES.  [brief §13]
 *
 * The `<h2 style={{fontSize: 16}}>` route into a stray heading was
 * closed in 35, and four titles had simply taken a different route:
 * `<strong className="grow">The finished video</strong>`, and the
 * same shape for Clips, Claims worth answering and — in the control
 * room — Destinations. No font size to catch, no heading tag to
 * catch, and the browser's bold default lands them somewhere between
 * --text-base and --text-md depending on the container.
 *
 * The tell is that the text is a LITERAL. A `<strong>` wrapping
 * `{entry.name}` or `{title}` is a value being emphasised, which is
 * what the tag is for; a `<strong>` wrapping words typed into the
 * source is a title, and a title on a desk is a legend.
 */
describe('titles', () => {
  it('writes no panel title as a bold literal', () => {
    /*
     * THE FIRST VERSION REQUIRED `className="grow"`, because all four
     * titles it was written for happened to have it. The conversation
     * watch page had three more as bare `<strong>The conversation
     * </strong>` — same object, same escape from the legend, and the
     * rule walked straight past them because it was describing the
     * four instances rather than the thing.
     *
     * Third rule in this pass to be widened for exactly that: the
     * radius ban was scoped to five files, the near-black ban to a
     * list of colours, and this to one class name.
     */
    /*
     * AND A TITLE IS ALONE ON ITS LINE. Widening it first caught
     * `Press <strong>GO LIVE</strong> — that arms the feed`, which is
     * emphasis inside a sentence and exactly what the tag is for. The
     * discriminator is not the class, it is whether the `<strong>` IS
     * the line or sits in one.
     */
    const offenders: string[] = [];
    for (const file of ['t', 'c', 'p']
      .flatMap((route) => components(join(ROOT, 'app', route, '[id]')))) {
      for (const line of code(file).split('\n')) {
        const hit = /^\s*<strong[^>]*>\s*([A-Z][^<{]*?)\s*<\/strong>\s*$/.exec(line);
        if (hit) offenders.push(`${named(file)}: "${hit[1]}"`);
      }
    }
    expect(offenders, 'use className="module-label" — a title is signage')
      .toEqual([]);
  });
});

/**
 * A BANK IS ONE PIECE OF METAL.  [brief §3, §4, §14]
 *
 * Mutually exclusive positions had already stopped being cards and
 * become `.ctl`s, which was most of the work — and left four objects
 * with four pixels of air between them, which is four objects that
 * happen to agree rather than one control. A gap says these were
 * placed; a shared seam says they were machined.
 */
describe('a bank of positions', () => {
  it('shares edges rather than leaving gaps', () => {
    const rule = CONSOLE.slice(CONSOLE.indexOf('.ctl-bank > .ctl {'),
      CONSOLE.indexOf('.ctl-bank > .ctl:last-child'));
    expect(rule, 'a position inside a bank keeps its own border')
      .toMatch(/border:\s*0/);
    expect(rule, 'a position inside a bank keeps its own corners')
      .toMatch(/border-radius:\s*0/);
    expect(rule, 'there is no seam between positions')
      .toMatch(/border-bottom: var\(--border\) solid var\(--console-seam\)/);
    expect(CONSOLE, 'the last position draws a seam against nothing')
      .toMatch(/\.ctl-bank > \.ctl:last-child \{ border-bottom: 0/);
  });

  /*
   * AND THE CHOSEN ONE IS LIT ON ITS EDGE, not outlined — inside a
   * bank there is no outline of its own to colour, and an edge is
   * what every rail in this product uses to say "this one".
   */
  it('lights the chosen position on its leading edge', () => {
    expect(CONSOLE).toMatch(/inset 3px 0 0 0 var\(--accent\)/);
  });

  it('is what the room uses to choose a speaker mode', () => {
    expect(code(join(ROOT, 'app', 'c', '[id]', 'room', 'RoomView.tsx')))
      .toMatch(/className="ctl-bank" data-testid="speaker-mode"/);
  });
});

/**
 * A COMPONENT WITH TWO PARENTS CANNOT USE `flex`.  [brief §3]
 *
 * `Strip` is the tab strip in both the Live Studio's header, which is
 * a ROW, and the left rail's Frame, which is a COLUMN. `flex` acts on
 * whichever axis its parent happens to be, so `flex: 1 1 auto` —
 * added to let the labels shrink horizontally — also told the strip
 * to grow VERTICALLY in the rail. It ate every spare pixel: a 220px
 * tall tab strip with the playlist crushed into the bottom half of
 * the panel, which is what the empty upper half of the control room's
 * left column was for twenty commits.
 *
 * Growing and shrinking are two properties. The shorthand sets both,
 * and only one of them was ever wanted.
 */
describe('the tab strip', () => {
  const STRIP = (() => {
    const body = code(join(ROOT, 'app', 't', '[id]', 'ChannelStudio.tsx'));
    const at = body.indexOf('function Strip(');
    return body.slice(at, body.indexOf('\nfunction ', at + 1));
  })();

  it('never grows, on either axis', () => {
    const grows = [...STRIP.matchAll(/flex: '[1-9]/g)].map(([hit]) => hit);
    expect(grows, 'flex shorthand with a grow factor — say flexShrink instead')
      .toEqual([]);
  });

  it('is still allowed to give way', () => {
    expect(STRIP).toMatch(/flexShrink: 1/);
    expect(STRIP).toMatch(/minWidth: 0/);
  });

  /*
   * AND THE LABELS ARE SPACED BY HOW MANY THERE ARE. The wide variant
   * already tracked lighter "because it has five labels to seat rather
   * than three" — the right reason attached to the wrong property, so
   * the COMPACT five-up strip kept 0.08em and clipped AUDIO to "AUDI"
   * for the third time in this pass.
   */
  it('spaces labels by their count, not by the variant', () => {
    expect(STRIP, 'tracking still keys off `compact`')
      .not.toMatch(/letterSpacing: compact \?/);
    expect(STRIP).toMatch(/letterSpacing: options\.length > 3/);
  });
});

/**
 * A COMPONENT MAY NOT TAKE THE KEYBOARD'S CUE AWAY.  [D-04]
 *
 * `focus.css` draws the ring as an `outline` plus a dark separator in
 * `box-shadow`, under a `:where()` selector — zero specificity, on
 * purpose, so a component can retint the ring. Zero specificity also
 * means ANY component rule that sets `box-shadow` on a focusable
 * thing silently deletes the separator, and commit 43's bank did
 * exactly that: the outline survived, the dark ring behind it did
 * not, and because a bank's positions sit flush the 2px ring then ran
 * into its neighbour with nothing between them.
 *
 * Scoping the removal was not enough either — with `box-shadow: none`
 * gone, a focused position fell back to `.ctl`'s own bevel, which is
 * also higher specificity than the ring. Every state has to name the
 * separator.
 */
describe('the focus ring', () => {
  const FOCUS = readFileSync(join(ROOT, 'app', 'styles', 'focus.css'), 'utf8');

  it('is drawn with an outline and a separator', () => {
    expect(FOCUS).toMatch(/outline: var\(--focus-ring-width\) solid/);
    expect(FOCUS).toMatch(/box-shadow: 0 0 0 calc\(/);
  });

  /*
   * EVERY `.ctl` STATE ENDS ITS SHADOW LIST WITH THE SLOT.
   *
   * The first version of this test asked each rule to scope itself
   * with `:not(:focus-visible)` and name the focused case. It found
   * three offenders — `.ctl`, `.ctl.is-on` and `.ctl.is-critical`,
   * which is every control on all three desks — and that was the
   * finding, but the remedy was wrong: three rules today and a fourth
   * next month, each having to remember.
   *
   * `--ring` is nothing until `:focus-visible` fills it in, so a state
   * gets the separator by ending with `var(--ring)`, and a state added
   * tomorrow gets it by copying the line above.
   */
  it('has a slot in every control state', () => {
    expect(CONSOLE, '--ring is not declared as empty by default')
      .toMatch(/--ring: 0 0 #0000/);
    expect(CONSOLE, ':focus-visible does not fill the slot')
      .toMatch(/\.ctl:focus-visible \{\s*--ring:/);

    const offenders: string[] = [];
    for (const block of CONSOLE.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = block;
      const shadow = /box-shadow:([^;]*);/.exec(body ?? '');
      if (!shadow) continue;
      if (!/\.ctl\b/.test(selector!)) continue;
      /* A control that cannot be focused cannot lose its ring. */
      if (/:disabled/.test(selector!)) continue;
      if (/var\(--ring\)/.test(shadow[1]!)) continue;
      offenders.push(selector!.split('*/').pop()!.trim().replace(/\s+/g, ' '));
    }
    expect(offenders, 'end the shadow list with var(--ring)').toEqual([]);
  });

  it('keeps both the lit edge and the separator on a chosen position', () => {
    const at = CONSOLE.indexOf(".ctl-bank > .ctl.is-on,");
    const body = CONSOLE.slice(CONSOLE.indexOf('{', at), CONSOLE.indexOf('}', at));
    expect(body).toContain('inset 3px 0 0 0 var(--accent)');
    expect(body).toContain('var(--ring)');
  });
});

/**
 * RED MEANS ON AIR.  [U-19, U-20, brief §2]
 *
 * It is the one signal in this product that must never be ambiguous:
 * the tally, the LIVE lamp, the playhead, ON AIR, GO LIVE, TAKE LIVE,
 * EMERGENCY. Three controls were spending it without transmitting
 * anything — enabling your own camera, turning your microphone on,
 * and asking to speak later. This pass has already corrected three
 * other places where red asserted something untrue (the multi-view
 * tally in 11 and 21, the playhead flag in 33); those were bugs in
 * what the colour said, and this is a bug in what it is FOR.
 */
describe('the loud controls', () => {
  /*
   * THE FULL RULE IS ON AIR **OR RECORDING**, which the first draft of
   * this test got wrong by naming only transmission. A record button
   * has been red since tape, and Studio Two's start and stop are
   * capturing something irreversible — the same class of fact as a
   * tally, which is what red is for. Studio One's Continue resumes a
   * recording in progress.
   *
   * GO LIVE IS THE INTERESTING ONE and it went the other way. Its own
   * tooltip reads "Nothing reaches the wire until you press TAKE LIVE
   * — the programme keeps playing until then." It brings the camera
   * up in PREVIEW. It was wearing the transmission colour two feet
   * from the button that transmits, while its own copy explained that
   * it does not.
   */
  const CRITICAL = [
    ['app/t/[id]/ChannelStudio.tsx', 'take-live'],
    ['app/t/[id]/ChannelStudio.tsx', 'emergency'],
    ['app/c/[id]/Studio.tsx', 'continue-button'],
    ['app/p/[id]/PerformanceStudio.tsx', 'start-take'],
    ['app/p/[id]/PerformanceStudio.tsx', 'stop-take'],
  ];

  it('spends red only on going out or going down', () => {
    const offenders: string[] = [];
    for (const file of ['t', 'c', 'p']
      .flatMap((route) => components(join(ROOT, 'app', route, '[id]')))) {
      const body = code(file);
      for (const hit of body.matchAll(
        /is-critical[^>]*?data-testid="([a-z-]+)"/g)) {
        offenders.push(`${named(file)}: ${hit[1]}`);
      }
      for (const hit of body.matchAll(
        /data-testid="([a-z-]+)"[^>]*?is-critical/g)) {
        offenders.push(`${named(file)}: ${hit[1]}`);
      }
    }
    const allowed = new Set(CRITICAL.map(([f, t]) => `${f}: ${t}`));
    expect([...new Set(offenders)].filter((row) => !allowed.has(row)),
      'use .ctl.is-key — red is for on air and for recording')
      .toEqual([]);
  });

  /*
   * AND THE FOURTH WEIGHT DIFFERS BY MATERIAL, NOT BY HUE. #c8382c
   * and #3f8ee8 are 1.54:1 apart in luminance, so to anybody who does
   * not separate red from blue they are the same tone. `.is-critical`
   * is a saturated FILL; `.is-key` is a dark face with a lit edge.
   */
  it('separates key from critical by more than colour', () => {
    const key = CONSOLE.slice(CONSOLE.indexOf('.ctl.is-key {'),
      CONSOLE.indexOf('}', CONSOLE.indexOf('.ctl.is-key {')));
    const crit = CONSOLE.slice(CONSOLE.indexOf('.ctl.is-critical {'),
      CONSOLE.indexOf('}', CONSOLE.indexOf('.ctl.is-critical {')));
    expect(crit, 'the critical control stopped being a fill')
      .toMatch(/background: linear-gradient/);
    expect(key, 'the key control became a fill too')
      .not.toMatch(/background: linear-gradient/);
    expect(key, 'the key control has no lit edge')
      .toMatch(/border-color: var\(--accent\)/);
    /* And it keeps the ring slot, like every other state. */
    expect(key).toContain('var(--ring)');
  });
});

/**
 * THE APPLICATION BAR IS DRAWN, NOT TYPED.  [D-04]
 *
 * `Icon.tsx` opens by naming the characters it exists to replace —
 * "▣ ♪ ◉ ☰ ⌫ ⌦" — and the bar that sits above every studio screen
 * was still using five of them, plus an arrow for Publish. They are
 * whatever font happens to be installed: ◉ is a different weight on
 * every platform, several render as emoji on macOS, and none share a
 * baseline. A row of six is six optical sizes pretending to be a set.
 *
 * The set arrived, the building and the three studios were converted,
 * and the one component common to all of them kept the glyphs — which
 * is what "check what is already there" is for. [D-19]
 */
describe('the application bar', () => {
  const BAR = code(join(ROOT, 'app', 'StudioBar.tsx'));

  it('types no glyph as an icon', () => {
    /* The Unicode blocks Icon.tsx names: arrows, geometric shapes,
       and the miscellaneous symbols the trigrams live in. */
    const found = [...BAR.matchAll(/'[\u2190-\u21FF\u25A0-\u25FF\u2630-\u267F]'/g)]
      .map(([hit]) => hit);
    expect(found, `${found.join(' ')} — use Icon`).toEqual([]);
  });

  it('takes its marks from the one set', () => {
    expect(BAR).toMatch(/import Icon, \{ type IconName \}/);
    expect(BAR).toMatch(/<Icon name=\{tab\.icon\}/);
  });

  /*
   * AND NO TWO PLACES WEAR THE SAME MARK. Converting straight to the
   * lit rail's mapping gave Conversations and Studio One the same
   * speech bubble, one tab apart — a set is only a set if its members
   * are told apart. Conversations took a new `list`, because it and
   * Library are two anchors into two lists and should read as
   * siblings.
   */
  it('gives every place its own mark', () => {
    /*
     * BY TAB, NOT BY OCCURRENCE. Every tab is written twice — once
     * with an href and once dimmed with a hint for when there is
     * nothing to point at — so counting `icon:` lines said eight
     * marks for five places and called the duplicates a collision.
     */
    const marks = new Map<string, Set<string>>();
    for (const hit of BAR.matchAll(
      /id: '([a-z-]+)'[^}]*?icon: '([a-z]+)'/g)) {
      const [, id, icon] = hit;
      marks.set(icon!, (marks.get(icon!) ?? new Set()).add(id!));
    }
    expect(marks.size, 'the bar lost its icons').toBeGreaterThanOrEqual(5);
    const shared = [...marks.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([icon, ids]) => `${icon}: ${[...ids].join(' + ')}`);
    expect(shared, 'two places wear the same mark').toEqual([]);
  });
});

/**
 * NOTHING IN THIS PRODUCT IS AN ICON MADE OF TEXT.  [D-04, D-14]
 *
 * Twenty-nine characters were doing an icon's job across fourteen
 * files: the five nav tabs, the transport, two settings gears, four
 * disclosure carets, a warning, a loop, a graphics tile, a music
 * note, the legend swatches on the finished-video bar, two emoji,
 * and the play triangle inside four hand-copied brand marks.
 *
 * `Icon.tsx` was written to replace them and named six of them in
 * its opening paragraph. It shipped, the building and the studios
 * were converted, and the characters stayed — because nothing was
 * looking for them.
 *
 * WHY IT MATTERS, beyond consistency: a glyph is whatever font the
 * reader happens to have. ◉ is a different weight on every platform,
 * ⚠ and 🎙 render as full-colour emoji on macOS, ▨ is a different
 * hatch in every family, and ▶ inside a 26px badge needed a
 * hand-tuned `paddingLeft: 2` to look centred in whichever font the
 * author was using.
 */
describe('glyphs', () => {
  /* The Unicode blocks an icon gets reached for from: arrows,
     geometric shapes, and the miscellaneous symbols and dingbats. */
  const GLYPH = /[\u2190-\u21FF\u25A0-\u25FF\u2600-\u27BF]/u;
  const ENTITY = /&#(\d+);/g;

  /*
   * Characters are legitimate in prose, in a title, and in the
   * comments that explain why they were removed — so this looks at
   * what is RENDERED: a character alone inside an element, or an
   * HTML entity in that range, which is only ever written to draw
   * one.
   */
  it('renders no character as a mark', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const body = code(file);
      for (const hit of body.matchAll(ENTITY)) {
        const ch = String.fromCodePoint(Number(hit[1]));
        if (GLYPH.test(ch)) offenders.push(`${named(file)}: ${hit[0]} (${ch})`);
      }
      /* `>◀</button>`, `{'▾'}`, `'● LIVE'` — a glyph next to a tag
         boundary or alone in a string literal. */
      for (const hit of body.matchAll(
        new RegExp(`(?:>\\s*|'|\`)(${GLYPH.source}[^'\`<]{0,12})(?:\\s*<|'|\`)`, 'gu'))) {
        offenders.push(`${named(file)}: ${hit[1]}`);
      }
    }
    expect(offenders, 'use Icon — a glyph is whatever font the reader has')
      .toEqual([]);
  });

  /*
   * AND THE MARK IS ONE COMPONENT. It was four hand-copied blocks of
   * gradient, bevel and tinted shadow, already diverging in size and
   * padding. `StudioBar`'s own doc comment warns about exactly this
   * for tabs — "a second copy would be a second place they go out of
   * date" — and the logo had four.
   */
  it('draws the mark in one place', () => {
    const copies = components()
      .filter((file) => /linear-gradient\(180deg, #3f8ee8/.test(code(file)))
      .map(named);
    expect(copies, 'the mark is copied — use <Brand />')
      .toEqual(['app/Brand.tsx']);
  });
});

/**
 * THE PAGES A STRANGER LANDS ON.  [D-04, D-14, U-01]
 *
 * Studio One's operator stopped seeing `<video controls>` in commit
 * 12 of the art-direction pass, under an essay calling it "the
 * single least premium object a video product can ship". The
 * AUDIENCE kept it: the channel's watch page, the performance's, and
 * every vertical clip on it.
 *
 * On a viewer page it is worse than on a desk. It is the product's
 * public face, and its three-dot menu offers **Download** — an offer
 * to take somebody's published work, made by the page that publishes
 * it.
 */
describe('the viewer pages', () => {
  const VIEWERS = [
    'app/t/[id]/watch/ChannelPlayer.tsx',
    'app/p/[id]/watch/Watch.tsx',
    'app/c/[id]/watch/Watch.tsx',
  ];

  it.each(VIEWERS)('%s ships no native control bar', (file) => {
    const body = code(join(ROOT, file));
    /* `controls` as a bare JSX attribute on an element. */
    expect(body, 'a viewer sees the browser\'s own bar, and its Download menu')
      .not.toMatch(/^\s*controls$/m);
    expect(body).not.toMatch(/<video[^>]*\scontrols[\s/>]/);
  });

  /*
   * AND THE TWO THAT NEEDED ONE USE THE SAME TRANSPORT. Two
   * transports exist on purpose — Studio One's is built on a frame
   * address because an editor cuts on frames [INV-02], a viewer's is
   * built on seconds because a viewer watches. A THIRD would be the
   * point at which they should have been merged.
   */
  it('has one transport for viewers', () => {
    const users = components()
      .filter((file) => /<VideoTransport/.test(code(file)))
      .map(named).sort();
    expect(users).toEqual([
      'app/p/[id]/watch/Watch.tsx',
      'app/t/[id]/watch/ChannelPlayer.tsx',
    ]);
  });

  /*
   * NOW PLAYING IS A CLAIM ABOUT THE VIEWER'S SCREEN. The channel
   * page made it unconditionally, directly under its own notice that
   * the channel is not transmitting — so a stranger arriving off air
   * read both at once. `title` is what the SCHEDULE says; only
   * `transmitting` says anything is arriving.
   *
   * The first fix then reintroduced the same lie four lines higher:
   * the transport's `live` prop meant "no scrubber" and was also
   * drawing a red LIVE badge. Two facts, two props.
   */
  it('says NOW PLAYING only when something is', () => {
    const watch = code(join(ROOT, 'app', 't', '[id]', 'watch', 'Watch.tsx'));
    expect(watch).toMatch(/transmitting \? 'NOW PLAYING' : 'SCHEDULED'/);
    expect(watch, 'the countdown runs on something that is not running')
      .toMatch(/remaining !== null && now\?\.transmitting/);

    const transport = code(join(ROOT, 'app', 'VideoTransport.tsx'));
    expect(transport, 'the LIVE badge is drawn from a layout prop')
      .toMatch(/\{onAir && \(/);
    expect(transport).toMatch(/!continuous && total > 0/);
  });
});
