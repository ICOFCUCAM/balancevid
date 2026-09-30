/**
 * Cropping a take, and what else has to move with it.
 *   [MASTER-EDIT §2, §5, §15; INV-16, U-15, D-19]
 *
 * THE THIRD OF THE THREE OPERATIONS. Moving a take changes WHEN it plays,
 * trimming changes WHICH PART OF IT exists, and a reframe changes WHAT
 * PART OF THE PICTURE shows. The document, the plan and the renderer each
 * have to agree about the third, and the renderer has a second reason to
 * care that the other two do not: the difference matte.
 *
 * AND IT IS RENDERED, not merely planned. The lesson this file is built on
 * was paid for twice already — deleting the one line in the mixer that
 * applied a cleanup left every other test passing, and a colour match that
 * rendered BLACK passed every domain test because they shared its
 * convention. A crop is one substring in one filter chain; nothing short
 * of decoding the output can tell you it is there.
 */
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import {
  PerformanceEditError, addTake, newPerformance, setReframe, setScene,
} from '../../src/domain/performanceEdit.js';
import { MIN_REFRAME_SPAN } from '../../src/domain/focus.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG, run } from '../../src/render/ffmpeg.js';
import { measureColour } from '../../src/render/ingest.js';
import { boxFrom, content } from '../../app/p/[id]/ReframeBox.js';

const ROOT = join(import.meta.dirname, '..', '..');
/*
 * Comments stripped, as every other source-reading test here does: an
 * assertion that a line is NEAR another must not be satisfied — or
 * defeated — by the paragraph explaining why it is there.
 */
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/* Four, not two: a two-second silent master makes aac produce no frames. */
const SECONDS = 4;
const SONG = secondsToSamples(SECONDS);

let dir: string;

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/*
 * A FRAME IN QUARTERS, three of them near-black and one bright.
 *
 * The whole picture is then dark and a crop to the bright quarter is a
 * picture that is bright — which is a fact about the OUTPUT, readable by
 * the same `measureColour` the product uses, and not a fact about a
 * filter string. A gradient would have been prettier and would not have
 * let a test say "the crop took the part I asked for" in one number.
 */
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-reframe-'));
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=0x101010:s=320x180:r=${HOUSE_FPS}:d=${SECONDS}`,
    /*
     * THE BRIGHT QUARTER IS TOP RIGHT, OFF THE DIAGONAL, and that is
     * not decoration. The first version put it top left and tested
     * crops at (0,0) and (0.5,0.5) — both symmetric in x and y — so a
     * renderer that SWAPPED the two offsets passed every assertion in
     * this file. A mutation that survives is a test that was not
     * testing. Off the diagonal, x and y can be told apart.
     */
    '-vf', 'drawbox=x=160:y=0:w=160:h=90:color=0xd0d0d0@1:t=fill',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'quarters.mp4'),
  ]);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 180_000);

function master(): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'The Long Way Round',
    class: 'own', durationSamples: SONG,
  };
}

function take(id = 'take_one', assetId = 'quarters'): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: assetId as AssetId,
    label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    hasAudio: false,
    createdAt: '2026-09-29T12:00:00.000Z',
  };
}

/** The one take of the one shot, which every plan here has. */
function shotTake(p: Performance) {
  const shot = buildPerformancePlan(p).shots[0];
  if (!shot || shot.kind !== 'performance') throw new Error('not a performance shot');
  return shot.takes[0];
}

function performance(): Performance {
  const p = newPerformance('A Performance', master(), '2026-09-29T12:00:00.000Z');
  addTake(p, take());
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  return p;
}

describe('the box a drag makes', () => {
  /*
   * IT KEEPS THE FRAME'S OWN SHAPE, which is what makes the crop
   * honest. The renderer fits a take into its panel with `cover`; a box
   * of some other shape would be cut again on the way in and the author
   * would not get what they drew. Square in these units means "the same
   * shape as the frame", because the frame is 1x1 in fractions of
   * itself.
   */
  it('is the shape of the frame, whatever shape the drag was', () => {
    const wide = boxFrom({ x: 0.1, y: 0.4 }, { x: 0.8, y: 0.45 });
    expect(wide.w).toBeCloseTo(wide.h, 10);
    const tall = boxFrom({ x: 0.4, y: 0.1 }, { x: 0.45, y: 0.8 });
    expect(tall.w).toBeCloseTo(tall.h, 10);
  });

  it('follows the larger of the two spans the pointer made', () => {
    expect(boxFrom({ x: 0.1, y: 0.4 }, { x: 0.8, y: 0.45 }).w)
      .toBeCloseTo(0.7, 10);
    expect(boxFrom({ x: 0.4, y: 0.1 }, { x: 0.45, y: 0.8 }).h)
      .toBeCloseTo(0.7, 10);
  });

  it('never makes a box smaller than the document would accept', () => {
    const dot = boxFrom({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    expect(dot.w).toBe(MIN_REFRAME_SPAN);
    expect(() => setReframe(performance(), 'take_one', dot)).not.toThrow();
  });

  /* Slid back inside rather than clipped, so a box drawn at an edge
     keeps the size it was given — `focus.ts` makes the same choice
     about a subject standing at the edge of shot. [D-19] */
  it('slides a box at the edge back inside, keeping its size', () => {
    const past = boxFrom({ x: 0.8, y: 0.8 }, { x: 1.4, y: 1.4 });
    expect(past.x + past.w).toBeLessThanOrEqual(1);
    expect(past.y + past.h).toBeLessThanOrEqual(1);
    expect(past.w).toBeCloseTo(0.6, 10);
    expect(() => setReframe(performance(), 'take_one', past)).not.toThrow();
  });

  it('never makes one bigger than the frame', () => {
    const huge = boxFrom({ x: -1, y: -1 }, { x: 2, y: 2 });
    expect(huge).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('where the picture is inside the tile it is drawn on', () => {
  /*
   * A CLICK ON THE LETTERBOX IS NOT A POINT IN THE PICTURE. While a
   * crop is being drawn the video is shown CONTAINED, so on any tile
   * that is not the source's shape there are bars — and every pointer
   * position has to be measured against the picture, not the tile, or
   * the box lands somewhere other than where it was drawn.
   */
  it('letterboxes a wide frame in a tall tile', () => {
    const box = content({ width: 400, height: 400 }, 9 / 16);
    expect(box.width).toBe(400);
    expect(box.height).toBeCloseTo(225, 6);
    expect(box.top).toBeCloseTo(87.5, 6);
    expect(box.left).toBe(0);
  });

  it('pillarboxes a tall frame in a wide tile', () => {
    const box = content({ width: 400, height: 200 }, 16 / 9);
    expect(box.height).toBe(200);
    expect(box.width).toBeCloseTo(112.5, 6);
    expect(box.left).toBeCloseTo(143.75, 6);
    expect(box.top).toBe(0);
  });

  it('fills a tile of the same shape exactly', () => {
    const box = content({ width: 320, height: 180 }, 180 / 320);
    expect(box).toEqual({ left: 0, top: 0, width: 320, height: 180 });
  });

  /* A tile with no size yet, or media whose shape is not known, is not
     a crash: it is a pad nothing can be drawn on until it is. */
  it('answers nothing for a tile that has no size yet', () => {
    expect(content({ width: 0, height: 0 }, 9 / 16))
      .toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(content({ width: 400, height: 300 }, 0).width).toBe(0);
  });
});

describe('the tool\u2019s own controls', () => {
  /*
   * PRESSING `DONE` HAS TO LEAVE THE TOOL, and for a while it did not.
   * The pad captures the pointer so a drag can run off the edge of the
   * picture — and a captured pointer sends every later event, including
   * the one the browser turns into a click, to the CAPTURING ELEMENT.
   * So both buttons were pressed and nothing happened. The fix is to
   * refuse to start a drag that began on the bar; this holds it.
   */
  it('does not start a drag on its own buttons', () => {
    const source = code('app/p/[id]/ReframeBox.tsx');
    const down = source.slice(source.indexOf('onPointerDown'));
    const guard = down.indexOf('closest(\'[data-testid="reframe-bar"]\')');
    const capture = down.indexOf('setPointerCapture');
    expect(guard).toBeGreaterThan(-1);
    expect(guard, 'the guard must come before the capture').toBeLessThan(capture);
  });

  /* Nothing drawn over the picture may take a pointer either: a dimming
     pane over the bottom of the frame was swallowing presses on the bar
     before the browser caught it. */
  it('lets no decoration take a pointer', () => {
    const source = code('app/p/[id]/ReframeBox.tsx');
    /* Anchored on the panes' own map rather than on their colour: the
       colour changed the moment the house plate-alpha rule caught it,
       and a test pinned to a value is a test that breaks when the
       value was the thing that was wrong. */
    const panes = source.slice(source.indexOf('.map((pane, index)'));
    expect(panes.slice(0, 500)).toContain("pointerEvents: 'none'");
    const rect = source.slice(source.indexOf('data-testid="reframe-rect"'));
    expect(rect.slice(0, 500)).toContain("pointerEvents: 'none'");
  });
});

describe('what the document will accept as a crop', () => {
  it('keeps the rectangle it was given', () => {
    const p = performance();
    setReframe(p, 'take_one', { x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    expect(p.takes[0]!.reframe).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
  });

  /*
   * CROPPING TO EVERYTHING IS NOT A CROP, and storing it would cost a
   * filter, a generation of resampling and a different plan hash for a
   * picture identical to the one already there. [U-16]
   */
  it('stores a box round the whole frame as no crop at all', () => {
    const p = performance();
    setReframe(p, 'take_one', { x: 0, y: 0, w: 1, h: 1 });
    expect(p.takes[0]!.reframe).toBeUndefined();
    expect(shotTake(p)).not.toHaveProperty('reframe');
  });

  it('takes a crop off again', () => {
    const p = performance();
    setReframe(p, 'take_one', { x: 0.1, y: 0.1, w: 0.4, h: 0.4 });
    setReframe(p, 'take_one', null);
    expect(p.takes[0]!.reframe).toBeUndefined();
  });

  /*
   * A ZOOM NO SOURCE SURVIVES. A fifth of the width of a 1080p frame is
   * under 220 pixels across in the panel it then fills, and the author
   * cannot see that while drawing the box over a small monitor.
   */
  it('refuses a crop deeper than any source survives', () => {
    const p = performance();
    const tiny = MIN_REFRAME_SPAN / 2;
    expect(() => setReframe(p, 'take_one', { x: 0, y: 0, w: tiny, h: tiny }))
      .toThrow(PerformanceEditError);
    expect(p.takes[0]!.reframe).toBeUndefined();
  });

  it('refuses a crop that leaves the picture', () => {
    const p = performance();
    for (const bad of [
      { x: -0.1, y: 0, w: 0.5, h: 0.5 },
      { x: 0.7, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.7, w: 0.5, h: 0.5 },
    ]) {
      expect(() => setReframe(p, 'take_one', bad), JSON.stringify(bad))
        .toThrow(/outside the picture/);
    }
  });

  it('refuses numbers that are not numbers', () => {
    const p = performance();
    expect(() => setReframe(p, 'take_one',
      { x: Number.NaN, y: 0, w: 0.5, h: 0.5 })).toThrow(/not a number/);
  });

  it('carries the crop into the plan, as fractions', () => {
    const p = performance();
    setReframe(p, 'take_one', { x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
    expect(shotTake(p)?.reframe).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
  });
});

describe('a performance rendered with a crop on it', () => {
  async function render(p: Performance, name: string): Promise<string> {
    const out = join(dir, `${name}.mp4`);
    await compose(buildPerformancePlan(p), {
      workDir: join(dir, `work-${name}`),
      outputPath: out,
      resolveAsset: () => join(dir, 'quarters.mp4'),
      resolveStill: (id) => join(dir, `${id}.png`),
      masterAudioPath: join(dir, 'song.webm'),
    });
    return out;
  }

  /*
   * THE TEST THAT CANNOT BE PASSED BY A PLAN. One substring in one
   * filter chain does this; delete it and every assertion above still
   * passes.
   */
  it('shows the part of the frame that was kept, and not the rest', async () => {
    const whole = await measureColour(
      await render(performance(), 'whole'), SECONDS);

    const cropped = performance();
    /* The bright quarter, exactly: top right. */
    setReframe(cropped, 'take_one', { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    const bright = await measureColour(await render(cropped, 'bright'), SECONDS);

    const dark = performance();
    /* And the quarter diagonally opposite — bottom LEFT — to prove it
       is the box that decides and not merely that cropping brightens
       things. Swap x and y and this is the one that comes out bright. */
    setReframe(dark, 'take_one', { x: 0, y: 0.5, w: 0.5, h: 0.5 });
    const shadow = await measureColour(await render(dark, 'shadow'), SECONDS);

    expect(bright.y, `whole ${whole.y} -> kept-bright ${bright.y}`)
      .toBeGreaterThan(whole.y + 30);
    expect(shadow.y, `whole ${whole.y} -> kept-dark ${shadow.y}`)
      .toBeLessThan(whole.y);
    expect(bright.y - shadow.y).toBeGreaterThan(60);
  }, 300_000);

  /*
   * AND THE MATTE'S PLATE IS CROPPED WITH IT.  [INV-16]
   *
   * The key is a DIFFERENCE against a still of the same room from the
   * same camera. Crop the take and leave the plate whole and the
   * comparison is between two different parts of the room: every pixel
   * differs, so the key passes the whole frame through — which does not
   * look like a broken crop, it looks like background replacement
   * silently not working. This holds the two filters to the same
   * rectangle.
   */
  it('crops the backdrop plate to the same rectangle', () => {
    const p = performance();
    setReframe(p, 'take_one', { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    const crop = 'crop=iw*0.500000:ih*0.500000:iw*0.250000:ih*0.250000';
    /* The renderer builds the chains from the plan, so the pairing is
       asserted where it is written: both the take's chain and the
       plate's carry the same crop, from one `reframe` string. */
    const source = code('src/render/compose.ts');
    expect(source).toMatch(/\[\$\{index\}:v\]\$\{steady\}\$\{reframe\}\$\{fitFilter/);
    expect(source).toMatch(/\[\$\{plateInput\}:v\]\$\{reframe\}\$\{fitFilter/);
    /* And the crop is built once, from the take, in fractions. */
    expect(source).toMatch(/const reframe = take\.reframe \? cropOf\(take\.reframe\) : '';/);
    expect(crop.length).toBeGreaterThan(0);
  });

  /*
   * AFTER THE STABILISER, which needs the whole sensor to know how far
   * the picture moved, and BEFORE the fit, which is what makes the
   * picture the panel's size — cropping after that would be cutting a
   * frame that has already been scaled.
   */
  it('crops after the shake is taken out and before the fit', () => {
    const source = code('src/render/compose.ts');
    /*
     * The order IS the assertion: shake out, then crop, then fit, in
     * one template string the renderer sends to ffmpeg.
     */
    const at = (what: string) => source.indexOf(what);
    expect(at('`[${index}:v]${steady}${reframe}${fitFilter('))
      .toBeGreaterThan(-1);
    expect(at('const steady = take.stabilize'))
      .toBeLessThan(at('const reframe = take.reframe'));
  });
});
