/**
 * The monitors in a set, and where their glass is.
 * [CHANNEL §27, C-23; STUDIO-TWO S-40]
 *
 * *"A screen in a set shows nothing."* The oldest line on the
 * channel's own owed list, and the reason it mattered was never the
 * empty glass — it was that nothing could be PUT there, because where
 * the glass is was worked out twice, in two renderers, differently.
 */

import { describe, expect, it } from 'vitest';

import {
  SCREEN_INSET, VIRTUAL_SETS, glassOf, place, setById,
} from '../../src/domain/virtualSet.js';
import { SPACE_LOOKS } from '../../src/domain/environment.js';
import { sceneOf, screensIn } from '../../src/domain/scene.js';
import { pieceBoxes } from '../../src/render/matte.js';

const sceneFor = (id: string) => {
  const set = setById(id)!;
  return sceneOf(SPACE_LOOKS[set.spaceId]!, set);
};

describe('the glass inside the bezel', () => {
  it('insets by the monitor’s SMALLER side, not its width', () => {
    /*
     * A WIDE MONITOR IS THE FIXTURE. On a square one the two rules
     * agree and a mutation swapping them survives; News Desk's is 512
     * by 288 at 1280×720, where a fraction of the width gives 20 and a
     * fraction of the smaller side gives 12.
     */
    const wide = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
    const frame = { w: 1280, h: 720 };
    const box = place(wide, frame);
    expect(box.w).toBe(512);
    expect(box.h).toBe(288);

    const pane = glassOf(wide, frame);
    const inset = Math.round(288 * SCREEN_INSET);
    expect(inset).toBe(12);
    expect(pane.x).toBe(box.x + inset);
    expect(pane.y).toBe(box.y + inset);
    expect(pane.w).toBe(box.w - inset * 2);
    expect(pane.h).toBe(box.h - inset * 2);
    /* And not what the width would have given. */
    expect(pane.w).not.toBe(box.w - Math.round(512 * SCREEN_INSET) * 2);
  });

  it('always leaves a bezel somebody can see', () => {
    /* A monitor small enough that the fraction rounds to nothing: a
       screen drawn as one flat rectangle is the thing `spaceArt` says
       a screen must never be. */
    const tiny = glassOf({ x: 0, y: 0, w: 0.02, h: 0.02 }, { w: 320, h: 180 });
    expect(tiny.x).toBeGreaterThanOrEqual(2);
    expect(tiny.y).toBeGreaterThanOrEqual(2);
  });

  it('never hands a renderer a negative pane', () => {
    /* A monitor smaller than its own bezel. Drawn backwards by a
       canvas and refused by a filter graph, so it is answered here. */
    const none = glassOf({ x: 0, y: 0, w: 0.005, h: 0.005 }, { w: 320, h: 180 });
    expect(none.w).toBe(0);
    expect(none.h).toBe(0);
  });

  it('is the same glass the filter graph draws', () => {
    /*
     * THE DISAGREEMENT THIS WAS WRITTEN FOR. The chain inset by four
     * hundredths of the smaller side and the canvas by twelve
     * thousandths of the width — six pixels against twelve on the same
     * monitor, so a picture placed by one would sit proud of the bezel
     * drawn by the other.
     */
    const set = setById('news_desk')!;
    const screen = set.furniture.find((one) => one.kind === 'screen')!;
    const pane = glassOf(screen.rect, { w: 1280, h: 720 });
    const drawn = pieceBoxes([screen], 1280, 720);
    expect(drawn[1]).toContain(`x=${Math.round(pane.x)}`);
    expect(drawn[1]).toContain(`y=${Math.round(pane.y)}`);
    expect(drawn[1]).toContain(`w=${Math.round(pane.w)}`);
    expect(drawn[1]).toContain(`h=${Math.round(pane.h)}`);
  });
});

describe('the monitors in a scene', () => {
  it('finds every one of them, and only them', () => {
    /* Talk Show has two and a riser; News Desk has one, a band and a
       desk; Stage has none at all. A fixture of one set could not tell
       "the screens" from "the furniture". */
    expect(screensIn(sceneFor('talk_show'), 1280, 720)).toHaveLength(2);
    expect(screensIn(sceneFor('news_desk'), 1280, 720)).toHaveLength(1);
    expect(screensIn(sceneFor('lecture'), 1280, 720)).toHaveLength(1);
    expect(screensIn(sceneFor('stage'), 1280, 720)).toHaveLength(0);
  });

  it('answers in the glass, not the bezel', () => {
    const set = setById('news_desk')!;
    const screen = set.furniture.find((one) => one.kind === 'screen')!;
    const [pane] = screensIn(sceneFor('news_desk'), 1280, 720);
    expect(pane).toEqual(glassOf(screen.rect, { w: 1280, h: 720 }));
    /* Which is inside where the monitor itself is. */
    const box = place(screen.rect, { w: 1280, h: 720 });
    expect(pane!.x).toBeGreaterThan(box.x);
    expect(pane!.w).toBeLessThan(box.w);
  });

  it('takes the monitor where the frame moved it', () => {
    /*
     * THROUGH `placedFor`, which is the whole reason this is a scene
     * question rather than a set one. News Desk's monitor is authored
     * beside a presenter who filled a quarter of a 16:9 frame; in a
     * 9:16 one they fill four fifths, and the monitor is resolved
     * against that rather than left where it was drawn. [S-40]
     */
    const wide = screensIn(sceneFor('news_desk'), 1920, 1080)[0]!;
    const tall = screensIn(sceneFor('news_desk'), 608, 1080)[0]!;
    /* As fractions of their own frames, so the shapes are comparable. */
    expect(wide.x / 1920).toBeCloseTo(0.56 + 12 / 1920, 2);
    expect(tall.x / 608).toBeGreaterThan(0.56);
  });

  it('drops a monitor there is no longer room for', () => {
    /*
     * `placedFor` drops a piece squeezed below its own `atLeast`, and
     * this must not resurrect it as an empty rectangle to draw into —
     * a picture would then be shown on a monitor the set is not
     * drawing.
     *
     * TALK SHOW IS THE FIXTURE, AND I GUESSED WRONG FIRST. Lecture's
     * monitor is the biggest of the four and looked like the one that
     * would not fit, but it is authored to `shrink` and it survives
     * every shape; Talk Show's two are small, sit at the far edges,
     * and at 9:16 a performer taking four fifths of the width leaves
     * neither of them their `atLeast`. Measured rather than reasoned
     * about:
     *
     *   set         16:9  4:3  1:1  9:16
     *   news_desk      1    1    1     1
     *   talk_show      2    2    2     0
     *   lecture        1    1    1     1
     */
    expect(screensIn(sceneFor('talk_show'), 1920, 1080)).toHaveLength(2);
    expect(screensIn(sceneFor('talk_show'), 1080, 1080)).toHaveLength(2);
    expect(screensIn(sceneFor('talk_show'), 608, 1080)).toHaveLength(0);
    /* And the big one does survive, which is what makes the drop a
       property of the piece rather than of the frame. */
    expect(screensIn(sceneFor('lecture'), 608, 1080)).toHaveLength(1);
  });

  it('agrees with every set about how many monitors it has', () => {
    for (const set of VIRTUAL_SETS) {
      const screens = set.furniture.filter((one) => one.kind === 'screen');
      expect(screensIn(sceneFor(set.id), 1280, 720), set.id)
        .toHaveLength(screens.length);
    }
    /* And the loop saw both kinds, which is what makes it a check. */
    const counts = VIRTUAL_SETS.map(
      (set) => set.furniture.filter((one) => one.kind === 'screen').length);
    expect(Math.min(...counts)).toBe(0);
    expect(Math.max(...counts)).toBeGreaterThan(1);
  });
});
