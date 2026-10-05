/**
 * Four lanes, four questions.  [CHANNEL §13, §11, D-04, D-19, D-21, C-48]
 *
 * THE FAULT THESE ANSWER was a timeline whose lanes answered one
 * question in four typefaces.
 *
 * > *"the VIDEO TRACKS lane repeats PROGRAM's titles at an offset;
 * > GRAPHICS shows '25 events' as undifferentiated ticks; AUDIO
 * > shows 'Programme' in every block."*
 *
 * All three were true, and each had a different cause:
 *
 *   VIDEO TRACKS captioned itself with `stateLine(on) ??
 *   sourceLine(sourceOf(on))` — the EXACT expression PROGRAM's
 *   second line is built from, one row apart. And `sourceLine` is
 *   the VIEWER'S caption, written for the lower third in C-42: an
 *   operator looking at a video track already knows which studio
 *   made it.
 *
 *   GRAPHICS drew four rows — bug, LIVE, lower third, next — and
 *   named none of them. Only the bug is wide enough to carry a
 *   label, because it holds its text all day; a lower third is
 *   eight seconds, which is two pixels of a two-and-a-half-hour
 *   window, so `fitsText` rightly suppressed every word and left
 *   three anonymous rows of ticks.
 *
 *   AUDIO drew a cell per PROGRAMME and wrote one word in each —
 *   so it re-drew PROGRAM's boundaries underneath PROGRAM. Sound
 *   is continuous and a schedule is not: a boundary between two
 *   programmes is not a boundary in the audio.
 *
 * These are read off the source because the claim is about which
 * expression is written where, and that is exactly what a browser
 * run cannot tell you — a screenshot of two identical captions
 * looks like a lane that is working. The arithmetic behind them is
 * tested in `schedule-view.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { LAYERS, layerSays } from '../../src/domain/graphicsLane.js';

/** The room with its prose taken out: these rules are about code. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ROOM = code('app/t/[id]/ChannelStudio.tsx');

describe('the viewer’s caption belongs to one lane', () => {
  /*
   * ONE CALLER. `sourceLine` says "Studio Two · Performance", which
   * is what a VIEWER should be told under a picture. PROGRAM is the
   * lane that says what is on; the filmstrip is not a second one.
   */
  it('is written once in the room, in PROGRAM', () => {
    expect(ROOM.match(/sourceLine\(sourceOf\(/g) ?? []).toHaveLength(1);
  });
});

describe('the filmstrip says where in the media it is', () => {
  /*
   * `on.fromMs` IS HOW FAR INTO THE MEDIA, not a wall clock — the
   * same number the countdown is built from, and nothing on this
   * page had ever shown it.
   */
  it('captions each cell with the piece’s own timecode', () => {
    expect(ROOM).toMatch(/piece\.intoMs/);
    expect(ROOM).toMatch(/piece\.outMs/);
  });

  /*
   * AND MARKS THE JOIN, which is the lane's whole purpose. The
   * five-minute walk cuts one film into pieces, so a border on
   * every cell draws a join where there is none — and none where
   * there is one.
   */
  it('marks a cut only where the media changes', () => {
    expect(ROOM).toMatch(/data-cut=/);
    expect(ROOM).toMatch(/made\[index\]\?\.cut/);
  });

  /* A still has no timecode to run, and a running number over a
     photograph would be a lane lying in four digits. [D-21] */
  it('says the word where the word is all there is', () => {
    expect(ROOM).toMatch(/'Slide'/);
  });
});

describe('the graphics lane names its own rows', () => {
  /*
   * IN THE LEGEND COLUMN, NOT IN THE ROW. The first attempt put the
   * name at the row's left edge and a browser run showed why that is
   * wrong: the bug's bar starts at the window's left edge and runs
   * the whole width, so `CHANNEL BUG` and `Channel bug: BALANCEVID`
   * printed on top of each other, and the first tick of every other
   * row landed on its own name.
   */
  it('draws a legend per layer, beside the lane and not inside it', () => {
    expect(ROOM).toMatch(/data-testid="lane-row-name"/);
    expect(ROOM).toMatch(/name: layerSays\(layer\)/);
    expect(ROOM).not.toMatch(/graphics-row-name/);
  });

  /*
   * AND THE TWO AGREE BY CONSTRUCTION. The legend's tops and the
   * rows' tops are one expression, because two copies of
   * `3 + row * 15` are two copies until somebody changes one. [D-19]
   */
  it('puts the legend at the rows’ own offsets', () => {
    expect(ROOM.match(/GRAPHICS_TOP \+ row \* GRAPHICS_PITCH/g) ?? [])
      .toHaveLength(2);
  });

  /* Dim where the layer has nothing on it, which is the legend
     saying the layer exists and is off. */
  it('says which layers are carrying something', () => {
    expect(ROOM).toMatch(/lit: graphics\.some\(/);
  });

  /*
   * AND THE COLUMN HOLDS ONE OR THE OTHER. The note sits directly
   * under the lane's name, which is where the first track's own name
   * goes: `21 events` and `CHANNEL BUG` printed over each other the
   * first time this was drawn. The count was the complaint anyway —
   * a total across four layers does not say which.
   */
  it('does not also try to fit a note in the same column', () => {
    expect(ROOM).toMatch(/\{note && !rows &&/);
    expect(ROOM).not.toMatch(/event\$\{graphics\.length === 1/);
  });

  /*
   * AND THERE IS A NAME FOR EVERY ROW IT DRAWS. A row the lane can
   * draw and cannot name is the anonymous tick again.
   */
  it('has a word for every layer the compositor has', () => {
    for (const layer of LAYERS) {
      expect(layerSays(layer).length, layer).toBeGreaterThan(0);
    }
    expect(new Set(LAYERS.map(layerSays)).size).toBe(LAYERS.length);
  });
});

describe('the master bus is drawn from runs', () => {
  /*
   * NOT FROM PROGRAMME BLOCKS. A cell per programme is PROGRAM's
   * boundaries drawn a second time, under PROGRAM.
   */
  it('maps the runs and not the segments', () => {
    expect(ROOM).toMatch(/\{sound\.map\(\(run\)/);
    expect(ROOM).toMatch(/data-testid="audio-cell"/);
    /* The cell is keyed off a run, so a second author cannot
       quietly put the segments back under it. */
    expect(ROOM).toMatch(/key=\{`a\$\{run\.fromMs\}`\}/);
  });

  /*
   * AND THE LEGEND SAYS WHETHER THE SOUND EVER STOPS, which is the
   * one thing worth saying in three words about a master bus — and
   * what "master bus" itself was not saying. [D-04]
   */
  it('says in the legend whether anything broke it', () => {
    expect(ROOM).toMatch(/note=\{soundSays\(sound\)\}/);
  });
});
