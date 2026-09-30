/**
 * Typing a moment, and reading one back.  [TIMELINE B3a, B3b]
 *
 * "Jump to an exact moment." A scrub is one guess per press and a click
 * on a four-minute lane is worth about a second of accuracy; when
 * somebody knows they want 02:41 the fastest route is to say so.
 *
 * WHAT MAKES THIS WORTH A FILE is that a parser for times people type
 * is a parser for what people actually type, and every one of the cases
 * below is somebody's ordinary habit rather than an edge case invented
 * to have something to assert.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  HOUSE_SAMPLE_RATE, formatMasterPosition, parseMasterPosition,
  secondsToSamples,
} from '../../src/domain/time.js';

describe('a moment somebody typed', () => {
  it('reads the shape the product itself prints', () => {
    expect(parseMasterPosition('02:41.500'))
      .toBe(secondsToSamples(161.5));
    expect(parseMasterPosition('00:00.000')).toBe(0);
  });

  /* Nobody types the leading zero or the milliseconds they do not mean. */
  it('reads what people actually type', () => {
    expect(parseMasterPosition('2:41')).toBe(secondsToSamples(161));
    expect(parseMasterPosition('161')).toBe(secondsToSamples(161));
    expect(parseMasterPosition('161.5')).toBe(secondsToSamples(161.5));
    expect(parseMasterPosition(' 2:41 ')).toBe(secondsToSamples(161));
  });

  /*
   * A COMMA IS THE DECIMAL SEPARATOR IN MOST OF THE WORLD, and
   * refusing it would be refusing most of the world.
   */
  it('reads a comma as a decimal point', () => {
    expect(parseMasterPosition('2:41,5')).toBe(parseMasterPosition('2:41.5'));
  });

  /*
   * `.5` IS FIVE HUNDRED MILLISECONDS, NOT FIVE. The same trap LRC
   * timing has, and the same answer: pad on the right. Reading it the
   * other way puts every jump half a second early while looking like
   * the parser working. [INV-02]
   */
  it('pads the fraction on the right, not the left', () => {
    expect(parseMasterPosition('0:01.5')).toBe(secondsToSamples(1.5));
    expect(parseMasterPosition('0:01.05')).toBe(secondsToSamples(1.05));
    expect(parseMasterPosition('0:01.005')).toBe(secondsToSamples(1.005));
  });

  /*
   * NOTHING RATHER THAN ZERO. Seeking to the start of the song because
   * somebody typed a word is a jump they did not ask for and cannot
   * undo, and the control says so instead.
   */
  it('answers nothing for what it cannot read', () => {
    for (const typed of ['', '   ', 'soon', '2:41:30', '-5', '2m41s', '1e3']) {
      expect(parseMasterPosition(typed), JSON.stringify(typed)).toBeNull();
    }
  });

  /*
   * SIXTY SECONDS IS A MINUTE. `1:75` is somebody who does not mean
   * 2:15, and a control that silently rewrites what was typed is one
   * nobody can trust with a number they care about.
   */
  it('refuses more than sixty seconds in a minute', () => {
    expect(parseMasterPosition('1:75')).toBeNull();
    expect(parseMasterPosition('1:60')).toBeNull();
    /* Without minutes it IS a count of seconds, so it is allowed. */
    expect(parseMasterPosition('75')).toBe(secondsToSamples(75));
  });

  /*
   * THE INVERSE OF THE FORMATTER, which is the property that matters:
   * whatever the product prints, somebody can copy back in.
   */
  it('reads back everything the formatter writes', () => {
    for (const samples of [
      0, 1, 1599, 1600, HOUSE_SAMPLE_RATE, 48_000 * 3 + 7,
      secondsToSamples(161.5), secondsToSamples(243.999),
    ]) {
      const written = formatMasterPosition(samples);
      const read = parseMasterPosition(written);
      /* To the millisecond the formatter printed, which is all it
         printed — a sample is a twentieth of one. */
      expect(Math.abs((read ?? -1) - samples), `${samples} -> ${written}`)
        .toBeLessThanOrEqual(HOUSE_SAMPLE_RATE / 1000 / 2 + 1);
    }
  });

  it('is a whole number of samples, which every position here is', () => {
    for (const typed of ['2:41.501', '0.1', '3']) {
      const at = parseMasterPosition(typed);
      expect(Number.isInteger(at), typed).toBe(true);
    }
  });

  /*
   * THE CLOCK IN THIS PRODUCT IS TO THE MILLISECOND, which is what the
   * formatter prints and what a person can read off it. A fourth
   * decimal is somebody pasting a float from somewhere else, and
   * quietly keeping three of its digits would be the control deciding
   * what they meant.
   */
  it('refuses finer than the clock it is printed on', () => {
    expect(parseMasterPosition('0.0001')).toBeNull();
    expect(parseMasterPosition('2:41.5001')).toBeNull();
  });
});


describe('zooming the timeline', () => {
  /*
   * ZOOM IS ONE WRAPPER, AND THAT IS THE DESIGN.  [B3a]
   *
   * The column clips, the track inside it is `zoom` times as wide, and
   * `pct()` keeps meaning a percentage of the song — which is now a
   * percentage of the track. Every ruler tick, scene block, take lane,
   * beat mark, hole and join zooms and pans without one of them being
   * told about it, and a lane added next year cannot be left behind.
   *
   * The alternative — giving `pct` a window and clamping — piles
   * everything outside the view against the edges, which is a timeline
   * that lies at both ends.
   */
  const code = readFileSync(
    join(import.meta.dirname, '..', '..', 'app', 'p', '[id]', 'SwitchingStage.tsx'),
    'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('zooms by widening one track, not by rewriting every lane', () => {
    expect(code).toMatch(/data-testid="lane-track"/);
    expect(code).toMatch(/width: `\$\{\(zoom \* 100\)\.toFixed\(4\)\}%`/);
    expect(code).toMatch(/marginLeft: `-\$\{\(at \* zoom \* 100\)\.toFixed\(4\)\}%`/);
    /* And `pct` is untouched by it: still a percentage of the song. */
    expect(code).toMatch(
      /const pct = \(samples: number\) => `\$\{Math\.max\(0, Math\.min\(100, \(samples \/ duration\) \* 100\)\)\}%`/);
  });

  /* A click and a drag both go through `sampleAtX`, so zooming cannot
     make them disagree about where a pointer is. */
  it('reads a pointer through the window, in one place', () => {
    expect(code).toMatch(
      /const along = at \+ \(\(clientX - box\.left\) \/ box\.width\) \/ zoom;/);
  });

  /* Zoomed to 8x the song leaves the window in four seconds, and a
     timeline you have to chase with a scrollbar is not one you can
     work on. It follows only when the line LEAVES — a view that
     recentres every frame is one nothing can be dragged on. */
  it('follows the playhead when it leaves the window, and not before', () => {
    expect(code).toMatch(/if \(where >= at && where <= at \+ span\) return;/);
    expect(code).toMatch(/setAt\(Math\.max\(0, Math\.min\(panLimit, where - span \/ 5\)\)\);/);
  });

  /* At 1x there is nowhere to pan, so the view is pinned to the start
     — which is what makes zooming out always land somewhere sensible. */
  it('pins the view to the start when the whole song fits', () => {
    expect(code).toMatch(/const panLimit = Math\.max\(0, 1 - 1 \/ zoom\);/);
    expect(code).toMatch(/if \(zoom <= 1\) \{ if \(at !== 0\) setAt\(0\); return; \}/);
  });

  it('offers the whole song and three steps in', () => {
    expect(code).toMatch(/\[1, 2, 4, 8\]\.map\(\(step\)/);
    expect(code).toMatch(/data-testid="zoom-step"/);
  });
});
