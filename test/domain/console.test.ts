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
  /*
   * AND IT COVERS THE WHOLE APPLICATION NOW, not the three studio
   * routes. Fourteen sizes were sitting in the five files outside
   * them — the start panels and the guest join page — which the
   * narrower rule had no opinion about. Scoping a rule to where it
   * was first applied is how it stops being a rule; that is the
   * fourth time in this work.
   */
  it('writes no size by hand anywhere in the application', () => {
    const offenders = components().flatMap((file) =>
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
    /* The ban below subtracts from this. Renaming the token without
       noticing would make its floor NaN, and `n <= NaN` is false for
       every n — which fails loud rather than quiet, but says the
       wrong thing when it does. */
    expect(SCREEN_RADIUS, 'the picture ban has no floor to stand on').toBe(2);
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
   *
   * THIS TEST HAS NOW BEEN WRONG IN THREE SEPARATE WAYS, each of which
   * hid pictures it was written to find — and each of which it passed
   * while they were on screen:
   *
   *   1. THE FLOOR STARTED AT 8. Its own comment said a 6px self-view
   *      had slipped through and that "a picture takes the picture
   *      radius; there is no in-between" — and then left the floor at
   *      8, so the sentence was true and the regex still was not. A
   *      picture is rounded wrongly at 3 as much as at 10; the floor
   *      is the screen radius itself.
   *   2. THE DISCRIMINATOR WAS A LIST OF BLACKS. `#000|#08090b` was
   *      how it recognised a picture, so naming those `--screen-bed`
   *      in the commit before this one made this test blinder, not
   *      safer: every bed it knew about stopped being spelled the way
   *      it was looking for. A rule that reads colours by their digits
   *      cannot survive the colours being named.
   *   3. AND `\{[^{}]*\}` CANNOT SEE A NESTED BLOCK. Any style object
   *      containing a conditional spread, or a template literal with
   *      `${...}` in it, has a brace inside it — so the matcher
   *      skipped precisely the elaborate elements, which are the ones
   *      somebody fiddled with. Four of the seven pictures this found
   *      were invisible to it for that reason alone, including a
   *      multiview monitor at 6px sitting in the middle of Studio Two.
   *
   * So it matches a brace to its partner rather than to a character
   * class, and asks what the element IS rather than what it is
   * painted with.
   */
  it('rounds no picture like a card', () => {
    const offenders: string[] = [];
    for (const file of components(join(ROOT, 'app'))) {
      const body = code(file);
      for (const hit of body.matchAll(
        /borderRadius:\s*(?:'?(\d+)(?:px)?'?|'var\(--radius-([a-z]+)\)')/g)) {
        if (hit[1] !== undefined && Number(hit[1]) <= SCREEN_RADIUS) continue;
        if (hit[2] === 'screen') continue;
        const block = enclosingBlock(body, hit.index);
        if (!block) continue;
        /*
         * WHAT THE ELEMENT HOLDS COUNTS, NOT JUST HOW IT IS PAINTED.
         * `<Still>` and `<Thumb>` set no shape of their own, so a well
         * that holds one is the picture — and three poster wells on
         * the home page carried a module radius and a `--surface-sunk`
         * bed for exactly that reason. The style object's braces close
         * before the children, so reading the block alone can never
         * see them: the first attempt at this signal was in the
         * pattern below and could not fire, which the mutation showed
         * and reading it did not.
         */
        /* From where the BLOCK ends, not from where the radius was
           found inside it — the block opens before the hit, so
           adding its length to the hit's index lands somewhere past
           the end and reads the wrong element. */
        const end = body.lastIndexOf(block, hit.index) + block.length;
        const after = body.slice(end, end + 300);
        /* ONLY AS FAR AS THE NEXT ELEMENT. A flat window reached past
           the element into its siblings and called a textarea and a
           hero card pictures; the next `style={{` is where this one
           stops being about this one. */
        const cut = after.indexOf('style={{');
        const what = block + (cut < 0 ? after : after.slice(0, cut));
        if (!/aspectRatio|objectFit|screen-bed|backgroundSize:\s*'cover'|<(?:Still|Thumb)\b/
          .test(what)) continue;
        /* EXCEPT A WASH. `inset: -40` of somebody's own poster at
           opacity 0.3 under blur(48px), bleeding off every edge of the
           card it sits behind, is not a monitor and has no corners
           anybody can see. The tell is the blur: a picture being
           judged is never blurred. */
        if (/filter:\s*'blur/.test(block)) continue;
        offenders.push(`${named(file)}: ${block.replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }
    expect(offenders, 'a picture rounded like a card').toEqual([]);
  });

  /*
   * AND THE ONES ALREADY AT 2 SAY SO.  [D-19]
   *
   * Ten of them were spelled `borderRadius: 2` — five in the control
   * room alone, on plates four lines from plates that used the token.
   * They render identically today, which is exactly the problem: the
   * ban above passes them, so the day the screen radius changes,
   * ten pictures keep the old one and nobody finds out from a test.
   * A token nobody references is a comment, and a token half the
   * pictures reference is worse than none.
   */
  it('spells the screen radius as the token', () => {
    const offenders: string[] = [];
    for (const file of components(join(ROOT, 'app'))) {
      const body = code(file);
      for (const hit of body.matchAll(
        new RegExp(`borderRadius:\\s*'?${SCREEN_RADIUS}(?:px)?'?`, 'g'))) {
        const block = enclosingBlock(body, hit.index);
        if (block && /rgba\(0,0,0,0\.72\)|screen-bed|aspectRatio|objectFit/.test(block)) {
          offenders.push(`${named(file)}: ${hit[0]}`);
        }
      }
    }
    expect(offenders, "a picture's corner is var(--radius-screen)").toEqual([]);
  });
});

/** What `--radius-screen` is, so the ban above has a floor and not a guess. */
const SCREEN_RADIUS = Number(/--radius-screen:\s*(\d+)px/.exec(CONSOLE)?.[1] ?? NaN);

/**
 * The `{ ... }` an index sits inside, matched brace to brace.
 *
 * A style object in this codebase routinely contains another one — a
 * `...(on ? { border } : {})`, a `` `${x}px` `` — and a character class
 * stops at the first inner brace it meets. Counting depth is the only
 * way to read the whole of the object somebody actually wrote.
 */
function enclosingBlock(body: string, at: number): string | null {
  let depth = 0;
  let start = -1;
  for (let i = at; i >= 0; i -= 1) {
    if (body[i] === '}') depth += 1;
    else if (body[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth -= 1;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

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
  /*
   * AND THE VIEWER'S PAGE IS A THIRD STUDIO, which this list did not
   * know. It drew two plates on the same picture four lines apart —
   * a claim at rgba(0,0,0,0.72) and a caption at rgba(0,0,0,.45) —
   * and the near-black ban walked past the second because its alpha
   * window starts at 0.6 and a caption scrim is lighter than a plate
   * by convention. It is not a scrim: it is a box behind a line of
   * text lying on a frame, which is the definition this suite uses.
   */
  it.each([
    ['app/t/[id]/ChannelStudio.tsx', 3],
    ['app/p/[id]/SwitchingStage.tsx', 3],
    ['app/c/[id]/watch/Watch.tsx', 2],
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
  it('has no private near-black anywhere in the product', () => {
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
    for (const file of components(join(ROOT, 'app'))) {
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

  /*
   * AND NOBODY TYPES A BED EITHER.  [D-19, brief §4]
   *
   * The test above only reads `rgba(...)`, so the OPAQUE near-blacks
   * went on being typed: #0d1319 six times — behind a canvas, behind
   * a room video, twice behind a missing composition layer, behind a
   * filmstrip cell, behind a layout diagram — plus #141a20 for an
   * empty slot in the same component as one of them and #0b0d10
   * behind a vertical preview. Eight surfaces, four values, one job.
   *
   * The job is the one `--screen-bed` names, and the diagram case is
   * the one that proves it is not a preference: compose.ts pads with
   * `color=black`, so a preview drawn on #0d1319 was showing a bluer
   * frame than the file it is a preview of.
   *
   * By distance from black rather than by a list of the four, because
   * the list is how the last four got here.
   */
  it('names the bed behind a picture, never types it', () => {
    const offenders: string[] = [];
    for (const file of components(join(ROOT, 'app'))) {
      for (const hit of code(file).matchAll(
        /background(?:Color)?: '#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})'/g)) {
        const hex = hit[1]!.length === 3
          ? hit[1]!.split('').map((c) => c + c).join('') : hit[1]!;
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
        if (r! <= 40 && g! <= 40 && b! <= 46) offenders.push(`${named(file)}: #${hex}`);
      }
    }
    expect(offenders, 'a bed is --screen-bed').toEqual([]);
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
   *
   * A SIXTH LABEL NEEDED A THIRD STEP. Adding ANSWERS to the Live
   * Studio's desks left six uppercase words in a 330px column with no
   * air between them — not clipped, which is what the rule was
   * written to stop, but running together as one string. So the
   * count decides both the tracking and the padding, and it does so
   * in more than one step.
   */
  it('spaces labels by their count, not by the variant', () => {
    expect(STRIP, 'tracking still keys off `compact`')
      .not.toMatch(/letterSpacing: compact \?/);
    expect(STRIP).toMatch(/letterSpacing: options\.length > 5/);
    expect(STRIP).toMatch(/options\.length > 3 \? '0\.04em' : '0\.08em'/);
    /* And the padding follows the same count, with the same steps. */
    expect(STRIP).toMatch(/options\.length > 5\s*\n?\s*\? 'var\(--space-1\)'/);
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
    /*
     * A RED CONTROL, NOT A RED LAMP.  [U-19]
     *
     * The first version of this matched `is-critical` anywhere near a
     * `data-testid`, which was right while `.ctl` was the only thing that
     * used the class. `.state.is-critical` exists too — the lamp that says
     * a render FAILED — and that is red for exactly the reason this rule
     * allows red: something went down. Saying so on a lamp is the rule
     * working, not breaking it, and the rule flagged it because it was
     * written against the instances in front of it rather than against the
     * property. Again.
     *
     * The property is a SATURATED FILL ON A CONTROL. `.ctl` in the same
     * class expression is what says so.
     */
    const offenders: string[] = [];
    for (const file of components(join(ROOT, 'app'))) {
      const body = code(file);
      for (const hit of body.matchAll(
        /className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const classes = hit[1] ?? hit[2] ?? '';
        if (!/\bctl\b/.test(classes) || !/is-critical/.test(classes)) continue;
        /* The element's own name, from the attributes beside the class. */
        const after = body.slice(hit.index, hit.index + 400);
        const named_ = /data-testid="([a-z-]+)"/.exec(after)?.[1] ?? '(unnamed)';
        offenders.push(`${named(file)}: ${named_}`);
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
   * AND THERE ARE TWO TRANSPORTS, ON PURPOSE. Studio One's is built on a
   * frame address because an editor cuts on frames [INV-02]; the other is
   * built on seconds because watching is not cutting. A THIRD would be the
   * point at which they should have been merged.
   *
   * THE FIRST VERSION OF THIS PINNED THE LIST OF USERS, which is a
   * different claim and the wrong one. It failed the moment Studio Two's
   * MASTER module grew a preview of the finished file — a new USER of the
   * seconds transport, which is the rule working exactly as intended, and
   * the opposite of a third implementation. Counting the definitions is
   * what it meant all along; who calls them is not a fact worth freezing.
   */
  it('has two transports and no third', () => {
    const transports = components()
      .filter((file) => /export default function \w*Transport\b/.test(code(file)))
      .map(named).sort();
    expect(transports, 'a third transport — merge it with one of these')
      .toEqual(['app/VideoTransport.tsx', 'app/c/[id]/SourceTransport.tsx']);
  });

  /*
   * And the frame-addressed one stays in the room that cuts on frames. A
   * viewer handed a frame counter is being shown an edit surface.
   */
  it('and the frame transport never reaches a viewer', () => {
    const users = components()
      .filter((file) => /<SourceTransport/.test(code(file)))
      .map(named);
    expect(users.filter((file) => /\/watch\//.test(file)),
      'a viewer counts seconds, not frames').toEqual([]);
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

/**
 * THE CLIENT BUNDLE DOES NOT REACH `node:crypto`.  [D-05, D-20]
 *
 * `performance.ts` opens by saying so: "a single import of `newId`
 * drags `node:crypto` into the client bundle and breaks the build.
 * This codebase has learned that once already, with the render
 * planner's geometry."
 *
 * It has now learned it twice. Naming a colour constant meant
 * importing it from somewhere, I reached for the module that holds
 * the table it comes from — `performanceEdit` — and the build failed
 * with `UnhandledSchemeError: Reading from "node:crypto"`. The split
 * between the browser-safe module and the edit operations is load
 * bearing, and nothing was checking it.
 *
 * The failure is loud, which is why it survived twice: a broken
 * build gets fixed and forgotten rather than written down. This
 * turns it into a named rule with the reason attached.
 */
/**
 * ONE QUESTION, ONE ANSWER.  [D-19]
 *
 * The rule that decides whether a performance can be rendered was written
 * twice: once properly, in `assertPerformanceRenderable`, and once again in
 * the console, from the same timeline. The second copy is the one an author
 * ever read, and it was wrong in two ways that the first one was not — it
 * summed the gaps into a duration and printed it through
 * `formatMasterPosition`, so `00:01.248 of the song has nothing on screen`
 * named a clock position that meant nothing, and it never consulted
 * `span.missing` at all, so the button stayed lit for a render the server
 * would refuse.
 *
 * The lesson generalises past this one screen, so the ban does too: WHEN A
 * DOMAIN FUNCTION DECIDES SOMETHING, A COMPONENT ASKS IT. Re-deriving an
 * answer from the same inputs is how two surfaces come to disagree, and the
 * one that disagrees is always the one in front of a person — the server's
 * copy is exercised by tests, the console's by nobody.
 */
/**
 * THE PICTURE ANSWERS.  [§7, §8, §11, D-19, U-04]
 *
 * The one thing Studio Two is about — what is on screen at this moment —
 * answered neither mouse button. Changing the take in a scene meant going
 * to the take rail; changing how the scene arrives meant opening a
 * `Transitions` toggle in the transport, which raised a row of `<select>`s
 * identified by nothing but their order. The transitions themselves have
 * been built and rendered for a long time; what was missing was a way to
 * reach them from the thing they are about.
 */
/**
 * A STUDIO SOLD ON ITS OWN WORKS ON ITS OWN.  [CHANNEL §6, D-14]
 *
 * The three studios are separable products, so a capability one of them
 * promises must not be reachable only by owning another. Online TV's brief
 * says "you can bring people into the room"; its Guests tab said
 *
 *     No conversations yet. Start one in Studio One and its room becomes
 *     available here.
 *
 * which is an instruction to buy a second studio, written in the shape of a
 * next step. The invite panel existed, the join route existed, the staging
 * existed — the DOOR was in another building.
 *
 * The rule is not testable in general, but its one instance is, and the
 * instance is the one that dead-ended.
 */
/**
 * THE WHOLE STUDIO IS THE SAME PIECE OF EQUIPMENT.  [brief §4, D-14, D-19]
 *
 * Studio Two's editor is built from `.module`: a take rail, a multiview, a
 * composition rail and a timeline, laid out as a desk. Everything BELOW it
 * was built from `<section>` and `<h2>` — a heading and three cards about
 * sound, a heading and four buttons about shapes, a heading and a box about
 * a clip, a preview picture, a publish button, and a red sentence. Seven
 * headings, no structure, and nothing saying which of them belonged to the
 * same act.
 *
 * They belong to three acts, and always did: MASTER makes the one file,
 * DELIVER makes versions and clips of it, PUBLISH gives it a page. The
 * controls inside are the same controls; what changed is which of them
 * stand together, and what the thing they stand in is made of.
 */
describe('the delivery half is made of the same material as the editor', () => {
  const LOWER = ['MasterRender.tsx', 'Deliver.tsx', 'PublishPanel.tsx', 'Stages.tsx']
    .map((name) => join(ROOT, 'app', 'p', '[id]', name));

  it('is built from modules, not from page sections', () => {
    for (const file of LOWER.slice(0, 3)) {
      expect(code(file), `${named(file)} is still a page section`)
        .toMatch(/className="module"/);
    }
  });

  /*
   * AND NOT FROM DOCUMENT HEADINGS. `<h2>` over a control is the shape of
   * an article; a desk labels its panels with a legend and gets on with
   * it. The ban is on the TAG, because the class was already right —
   * `<h2 className="module-label">` was how all three of these were
   * written, which reads correctly and is still an outline entry for a
   * screen reader walking a page that has no article in it.
   */
  it('and labels its panels rather than writing headings over them', () => {
    const offenders: string[] = [];
    for (const file of LOWER) {
      for (const hit of code(file).matchAll(/<h[1-6][\s>]/g)) {
        offenders.push(`${named(file)}: ${hit[0].trim()}`);
      }
    }
    expect(offenders, 'a legend, not a heading').toEqual([]);
  });

  /*
   * THREE ACTS, NAMED, AND NAMED DIFFERENTLY. The point of the
   * reorganisation is that an author can see which controls belong to the
   * same act; two modules sharing a legend, or one going back to "Share
   * it", would be the old grouping with a new border.
   *
   * By the COUNT and not by the words: the middle module was "Deliver" and
   * is now "Versions", because Deliver is the STAGE — what the strip above
   * calls the act, which includes publishing — while the list itself is
   * the formats an audience watches in. Pinning the literals made a
   * rename fail a test about grouping.
   */
  it('and names each act, distinctly', () => {
    const legends = LOWER.slice(0, 3).map((file) => {
      const body = code(file);
      return /<span className="module-label">([^<]+)</.exec(body)?.[1]?.trim();
    });
    expect(legends.filter(Boolean), 'a module lost its legend').toHaveLength(3);
    expect(new Set(legends).size, `two modules share a legend: ${legends.join(', ')}`)
      .toBe(3);
  });

  /*
   * ONE VERB FOR ONE ACT, AND NOT THAT ONE.  [D-14]
   *
   * `Make it`. `Make it again`. `Make an audio file`. `Make the cut`.
   * `not made`. Five controls in the room where a video is finished, all
   * built on the verb a child uses for a sandcastle — in a product whose
   * own domain layer has said `render` and `export` since it was written.
   * The screen was less precise than the code driving it, which is the
   * wrong way round and is most of what reads as a prototype.
   *
   * `Create` throughout, because one verb is worth more than the best
   * verb: a screen saying Render here, Export there and Make somewhere
   * else is three vocabularies for one act.
   *
   * SCOPED TO THE CONTROLS. Plain speech is right wherever the product is
   * explaining a CHOICE rather than naming an operation — "The song, and
   * whoever is on screen" is a decision described in the words of making
   * it, and is not what this bans.
   */
  it('and names the act with one verb, which is not "make"', () => {
    /*
     * ANCHORED FOR A LABEL, LOOSE FOR THE ACT. "Make" at the start of a
     * string is a control's verb; "make" in the middle of a sentence is
     * ordinary English and stays. The exception is naming THIS act —
     * "Make one above", "make the master video first" — where prose and
     * button must agree or the page is teaching two words for one thing.
     */
    const WEAK = /^(?:Make|Draw|Take it|Put it|not made)\b|\b[Mm]akes? (?:one|the master)\b/;
    const offenders: string[] = [];
    for (const file of LOWER) {
      const body = code(file);
      /*
       * EVERY VISIBLE STRING, not only `>Text<`. The first version matched
       * element text and state lamps, and a mutation putting `Make it`
       * back walked straight past it — because the label lives inside a
       * ternary, `{failed ? 'Try again' : 'Make it'}`, which is a string
       * literal and not element text. Most labels on this page are.
       *
       * AND THE CAP IS 200, NOT 60. A second mutation — the act named
       * "Make one above" in a SENTENCE — also passed, because the sentence
       * is seventy characters long and the matcher only looked at short
       * strings. A rule that sees only labels cannot check that the prose
       * agrees with them, which is the half of this that matters.
       */
      for (const hit of body.matchAll(
        /(?:>\s*([A-Z][^<>{}]{1,60}?)\s*<|'([^']{2,200})')/g)) {
        const text = (hit[1] ?? hit[2] ?? '').trim();
        if (WEAK.test(text)) offenders.push(`${named(file)}: “${text}”`);
      }
    }
    expect(offenders, 'one verb, and it is Create').toEqual([]);
  });

  /*
   * ONE POLL. The render jobs decide what every one of these says —
   * whether the master is ready, how many versions exist, whether there is
   * anything to publish — and three components each fetching `/renders`
   * every two seconds would be three answers that disagree for a second at
   * a time, on one screen, about one file. They were already two.
   */
  it('and asks the server once, in one place', () => {
    const offenders: string[] = [];
    for (const file of components(join(ROOT, 'app', 'p', '[id]'))) {
      if (/Delivery\.tsx$/.test(file)) continue;
      /*
       * A POLL IS A READ. `cache: 'no-store'` is how this codebase spells
       * one, and the first version of this banned the URL outright — which
       * flagged the two POSTs that START a render, in the module whose job
       * is to start it. Asking the server to do something is not asking it
       * what it has done.
       */
      for (const hit of code(file).matchAll(
        /fetch\(`\/api\/performances\/\$\{id\}\/(renders|clips|card|audio)`,\s*\{\s*cache: 'no-store' \}/g)) {
        offenders.push(`${named(file)}: polls /${hit[1]}`);
      }
    }
    expect(offenders, 'Delivery.tsx owns the poll — take the jobs as a prop')
      .toEqual([]);
  });

  /*
   * THREE COLUMNS, NOT THREE STACKED PANELS. Master, Deliver and Publish
   * are three acts in order, and an order reads left to right on a desk —
   * the same reason the stage strip is a row. Stacked, each is as wide as
   * the page and as short as its contents, which is how a 300px card ended
   * up with a 300px column of empty dark beside it.
   */
  it('and stands the three acts side by side', () => {
    const wiring = code(join(ROOT, 'app', 'p', '[id]', 'Delivery.tsx'));
    expect(wiring, 'the three acts are stacked again')
      .toMatch(/gridTemplateColumns: 'repeat\(auto-fit/);
    /* And a short column stays short: a module stretched to match its
       tallest neighbour is air inside a border, which is the thing being
       fixed. */
    expect(wiring, "a short column will stretch and fill with air")
      .toMatch(/alignItems: 'start'/);
  });

  /*
   * AND THE MASTER IS WATCHABLE WHERE IT IS MADE. The one file this studio
   * exists to produce, and the only way to see it was to download it.
   */
  it('and shows the master rather than only offering it', () => {
    expect(code(join(ROOT, 'app', 'p', '[id]', 'MasterRender.tsx')),
      'the master can still only be downloaded, not watched')
      .toContain('data-testid="master-preview"');
  });

  /*
   * WHERE IT GOES NAMES SOMEWHERE FOR EVERYONE. A studio sold on its own
   * has no channel, so a destinations list that held only channels said
   * nothing at all to most of the people reading it. [CHANNEL §6, D-14]
   */
  it('and tells a studio-only owner where their file can go', () => {
    const publish = code(join(ROOT, 'app', 'p', '[id]', 'PublishPanel.tsx'));
    expect(publish, 'the destinations are channels only')
      .toContain('POSTING');
    /*
     * AND PROMISES NOTHING IT CANNOT DO. Nothing in this product uploads
     * to any platform; a control offering to connect one would be the only
     * thing worse than the row not being there.
     */
    expect(publish, 'a Connect button that connects nothing')
      .not.toMatch(/>\s*Connect\b/);
  });

  /*
   * A STATE IS NOT AN ERROR.  [U-19, D-14]
   *
   * "make the master video first — there is nothing to publish yet" was
   * drawn in `--bad`, which is the colour this product uses for something
   * having gone wrong. Nothing has: a performance that has not been
   * mastered is the ordinary condition of every performance for most of
   * its life. It is a lamp that is not lit, and `.state.is-off` is the lamp.
   */
  it('and draws a thing not yet done as a state rather than a failure', () => {
    const publish = code(join(ROOT, 'app', 'p', '[id]', 'PublishPanel.tsx'));
    /* The sentence saying why, wherever it is, is not red. */
    const red = publish.slice(publish.indexOf("data-testid=\"publication-state\""));
    expect(red.slice(0, red.indexOf('</p>')), 'not-yet is drawn as a failure')
      .not.toMatch(/--bad/);
    /* And the lamp exists to say it instead. */
    expect(publish, 'there is no unlit lamp to say it with').toContain("'is-off'");
  });
});

describe('a studio sold on its own works on its own', () => {
  const GUESTS = code(join(ROOT, 'app', 't', '[id]', 'GuestsTab.tsx'));

  it('offers the broadcast a room of its own, needing no conversation', () => {
    expect(GUESTS, 'the only way to guests is still through Studio One')
      .toContain('open-broadcast-room');
  });

  it('and does not send a broadcaster to another studio to find one', () => {
    expect(GUESTS, 'a dead end written in the shape of a next step')
      .not.toMatch(/Start one in Studio One/);
  });

  /*
   * AND IT IS STILL ONE ROOM. The point of widening `RoomHost` rather than
   * writing a channel-shaped room was that there be no second invite panel,
   * no second join route and no second staging model to drift.
   */
  it('and invites through the Room\'s own panel, not a second one', () => {
    expect(GUESTS).toMatch(/import InvitePanel from/);
    const panels = components(join(ROOT, 'app'))
      .filter((file) => /export default function InvitePanel/.test(code(file)));
    expect(panels.map(named), 'there is more than one invite panel')
      .toEqual(['app/c/[id]/room/InvitePanel.tsx']);
  });
});

describe('what can be done to what is on screen', () => {
  const STAGE = code(join(ROOT, 'app', 'p', '[id]', 'SwitchingStage.tsx'));

  it('raises the product\'s own menu and not a fourth one', () => {
    expect(STAGE, 'the program monitor offers nothing')
      .toContain("data-testid=\"program-actions\"");
    expect(STAGE, 'a menu that is not the shared one drifts from it')
      .toMatch(/from '\.\.\/\.\.\/Menu\.js'/);
  });

  /*
   * THE TRAP THIS ONE IS ABOUT. `write()` snaps to the beat grid, which is
   * right when placing a cut and wrong for every other edit: swapping who
   * is in a panel, or restyling a join, must not also drag the boundary of
   * the scene it belongs to. An author would see their cut walk to the
   * nearest beat as a side effect of changing a face, and would have no
   * way to connect the two.
   */
  it('and never writes a scene at its own start through the snapping path', () => {
    expect(STAGE, 'that would move the boundary as a side effect of an edit')
      .not.toMatch(/\bwrite\((?:scene|current)\.fromSample/);
  });

  /*
   * And the styles offered are the ones the renderer can actually draw,
   * asked for rather than listed. Scoped to the MENU: the first version of
   * this checked the whole file, and the transitions row further down
   * already asks the same way — so hand-listing two of the three in the
   * menu passed. Same mistake as every other rule in this file that was
   * written against where it happened to be looking.
   */
  it('offers the transitions the renderer has, by asking for them', () => {
    const fn = STAGE.slice(STAGE.indexOf('const stageMenu'));
    /*
     * ENDING ON CODE AND NOT ON A COMMENT. `code()` strips comments before
     * this ever sees the file, so the first end marker here was a comment
     * that did not exist — `indexOf` returned -1, `slice(0, -1)` took
     * almost the whole file, and the assertion passed on a DIFFERENT
     * `Object.values(TRANSITIONS)` four hundred lines further down. The
     * mutation that hand-listed two of the three styles went green.
     *
     * A slice that is non-empty is not a slice that is right, so the
     * boundary is asserted rather than assumed.
     */
    const ends = fn.indexOf('const accept = useCallback');
    expect(ends, 'the end of stageMenu moved — this test is reading the '
      + 'wrong span of the file').toBeGreaterThan(0);
    expect(fn.slice(0, ends)).toMatch(/Object\.values\(TRANSITIONS\)/);
  });
});

describe('one question, one answer', () => {
  /*
   * PROJECTING IS DERIVING. `projectPerformance` turns a document into
   * spans, gaps and missing takes; every judgement a screen wants from it
   * — can this render, how far from finished is it — has a domain function
   * that asks it already. A component that projects is a component about to
   * arrive at its own opinion.
   *
   * By the call rather than by the fields it produces: `.missing` alone
   * flagged `data.missing` in the control room, which is a list of absent
   * channel ASSETS off a fetch and nothing to do with a performance. The
   * property is the derivation, not the word.
   */
  it('no component projects a performance to judge it', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      const body = code(file);
      if (/\bprojectPerformance\s*\(/.test(body)) offenders.push(`${named(file)}: projects`);
      if (/\btimeline\.gaps\b/.test(body)) offenders.push(`${named(file)}: reads gaps`);
    }
    expect(offenders, 'ask renderProblems() — the renderer does')
      .toEqual([]);
  });

  /* And the screen that refuses a render asks the shared question. */
  it('the render console asks it', () => {
    expect(code(join(ROOT, 'app', 'p', '[id]', 'MasterRender.tsx')),
      'MasterRender must ask renderProblems, not work it out')
      .toContain('renderProblems(performance)');
  });

  /*
   * AND THE SHARED ANSWER IS THE ONE THE RENDERER REFUSES WITH. A check the
   * console calls and the invariant ignores would be the same two rules
   * again, with one of them merely better dressed.
   */
  it('and the invariant refuses with it rather than around it', () => {
    const invariants = readFileSync(
      join(ROOT, 'src', 'domain', 'invariants.ts'), 'utf8');
    const fn = invariants.slice(invariants.indexOf('export function assertPerformanceRenderable'));
    const body = fn.slice(0, fn.indexOf('\nexport '));
    expect(body, 'assertPerformanceRenderable must ask renderProblems')
      .toContain('renderProblems(');
    /*
     * And keeps no second opinion beside it. By the FIELD and not by the
     * name in front of it: the first version of this line named
     * `timeline.gaps`, and a mutation that wrote
     * `projectPerformance(performance).gaps` walked straight past it — the
     * same "scoped to its example" mistake this whole suite is about,
     * made inside the test for it.
     */
    expect(body, 'it is deciding for itself again')
      .not.toMatch(/\.gaps\b|\.missing\b/);
  });
});

describe('what the browser is allowed to import', () => {
  /* Server-side by construction: these reach `newId`, the
     filesystem, or both. */
  const SERVER_ONLY = [
    'performanceEdit', 'channelEdit', 'roomEdit', 'edit', 'ids',
  ];

  it('never pulls a server-only domain module into a component', () => {
    const offenders: string[] = [];
    for (const file of components()) {
      for (const hit of code(file).matchAll(
        /from '[^']*\/src\/domain\/([a-zA-Z]+)\.js'/g)) {
        if (SERVER_ONLY.includes(hit[1]!)) {
          offenders.push(`${named(file)} → ${hit[1]}`);
        }
      }
    }
    expect(offenders,
      'that module reaches node:crypto — put the constant in a '
      + 'browser-safe module and import it from there')
      .toEqual([]);
  });

  /*
   * AND THE ONE SOURCE OF TRUTH SURVIVED THE MOVE. The point of
   * naming the fallback was to stop twelve copies going stale; a fix
   * that leaves the table with its own literal would have kept the
   * bug and added a constant.
   */
  it('builds the take palette from the named fallback', () => {
    const edit = readFileSync(
      join(ROOT, 'src', 'domain', 'performanceEdit.ts'), 'utf8');
    const table = edit.slice(edit.indexOf('export const TAKE_ACCENTS'));
    expect(table.slice(0, table.indexOf('];')))
      .toContain('TAKE_ACCENT_FALLBACK');
    expect(table.slice(0, table.indexOf('];')),
      'the table still carries its own copy of the first colour')
      .not.toContain("'#3e7ca6'");
  });
});
