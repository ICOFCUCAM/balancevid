/**
 * The only instrument that looks at the output.
 * [Doctrine CHANNEL §18, §11, §7, §6, D-04, D-19, D-20, C-28]
 *
 * C-24 was a channel transmitting four seconds of black, forever, while
 * every instrument in the building read healthy. The audit said why:
 *
 *   *"The control room looks fine — by design. Its monitor is the
 *   operator's own canvas, never the transmission. It cannot show this
 *   fault."*
 *
 * `playoutHealth` now catches the cause that was found. This catches the
 * CLASS, by reading the same bytes a viewer reads and measuring them —
 * because an operator glancing at a small muted picture on a busy desk
 * will not notice it has been black for a minute, which is exactly the
 * attention the fault survived the first time.
 */

import { describe, expect, it } from 'vitest';

import {
  BLACK_FLOOR, BLACK_FOR_MS, SAMPLES_KEPT, type Sample,
  confidenceSays, expectsPicture, keep, meanLuma, readPicture,
} from '../../src/domain/confidence.js';
import type { OnAir } from '../../src/domain/channel.js';

const T = 1_800_000_000_000;
/** A run of samples a second apart, ending `now`. */
const run = (means: number[], now = T): Sample[] =>
  means.map((mean, at) => ({ mean, at: now - (means.length - 1 - at) * 1000 }));

const DARK = 0.01;
const LIT = 0.3;

describe('how bright a frame is (C-28)', () => {
  const fill = (r: number, g: number, b: number, pixels = 16) =>
    Array.from({ length: pixels * 4 }, (_, at) =>
      [r, g, b, 255][at % 4]!);

  it('reads black as zero and white as one', () => {
    expect(meanLuma(fill(0, 0, 0))).toBe(0);
    expect(meanLuma(fill(255, 255, 255))).toBeCloseTo(1, 6);
  });

  /*
   * REC. 709, NOT A FLAT AVERAGE. A channel transmitting saturated
   * blue is not black; the flat average reads it at 0.33 — close
   * enough to the floor to raise an alarm about a picture that is
   * plainly there — and the eye reads it at 0.07, which is what the
   * coefficients say.
   */
  it('weights the channels the way an eye does', () => {
    expect(meanLuma(fill(0, 255, 0))).toBeCloseTo(0.7152, 4);
    expect(meanLuma(fill(0, 0, 255))).toBeCloseTo(0.0722, 4);
    expect(meanLuma(fill(255, 0, 0))).toBeCloseTo(0.2126, 4);
    /* And green is the one that would be lost by averaging. */
    expect(meanLuma(fill(0, 255, 0))).toBeGreaterThan(meanLuma(fill(0, 0, 255)));
  });

  it('ignores the alpha channel', () => {
    const opaque = fill(255, 255, 255);
    const clear = opaque.map((v, at) => (at % 4 === 3 ? 0 : v));
    expect(meanLuma(clear)).toBeCloseTo(meanLuma(opaque), 6);
  });

  it('averages over the whole frame rather than one pixel', () => {
    /* Half white, half black: a frame with a caption on black is not
       a white frame, and it is not a black one either. */
    const half = [...fill(255, 255, 255, 8), ...fill(0, 0, 0, 8)];
    expect(meanLuma(half)).toBeCloseTo(0.5, 6);
  });

  /*
   * THE FLOOR IS MEASURED IN THE RIGHT COLOUR SPACE, which the first
   * version was not: it was written against MPEG's limited-range
   * black at 16/255, a number in the YUV domain, when what a canvas
   * hands back has already been expanded. RGB 16 is a visibly dark
   * grey, not black — and a floor above it would have been a
   * black-picture alarm that could not fire on a black picture.
   */
  it('puts the floor between decoded black and a dark picture', () => {
    expect(meanLuma(fill(0, 0, 0))).toBeLessThan(BLACK_FLOOR);
    /* Black with the noise a real encoder leaves on it. */
    expect(meanLuma(fill(4, 4, 4))).toBeLessThan(BLACK_FLOOR);
    /* A dark grey picture is a picture. */
    expect(meanLuma(fill(24, 24, 24))).toBeGreaterThan(BLACK_FLOOR);
    expect(meanLuma(fill(16, 16, 16))).toBeGreaterThan(BLACK_FLOOR);
  });

  /*
   * THE PRODUCT'S OWN DARKEST SLIDE, which is the nearest thing it
   * makes to a false positive. Bare, it reads as black — correctly: a
   * frame with nothing on it IS a black picture. With a line of type
   * across a twelfth of it, it is comfortably a picture again.
   */
  it('tells a bare black slide from one with a headline on it', () => {
    const bare = fill(7, 9, 12, 48);
    expect(meanLuma(bare)).toBeLessThan(BLACK_FLOOR);
    const titled = [...fill(255, 255, 255, 4), ...fill(7, 9, 12, 44)];
    expect(meanLuma(titled)).toBeGreaterThan(BLACK_FLOOR);
  });

  it('says nothing rather than dividing by nothing', () => {
    expect(meanLuma([])).toBe(0);
    expect(meanLuma([10, 10])).toBe(0);
  });
});

describe('reading the picture (C-28)', () => {
  it('says nothing at all before the first sample', () => {
    expect(readPicture([], T)).toEqual({ mean: null, darkForMs: 0, black: false });
  });

  it('is not black while there is a picture', () => {
    const read = readPicture(run([LIT, LIT, LIT]), T);
    expect(read.mean).toBe(LIT);
    expect(read.darkForMs).toBe(0);
    expect(read.black).toBe(false);
  });

  /*
   * A CHANNEL IS ALLOWED TO GO TO BLACK. A dissolve through black, the
   * gap at the end of a programme and the moment an operator takes a
   * source down are all black and all correct. An alarm that fired on
   * them is an alarm nobody reads. [D-04]
   */
  it('does not call a short black an alarm', () => {
    const read = readPicture(run([LIT, LIT, DARK, DARK, DARK]), T);
    expect(read.darkForMs).toBe(2000);
    expect(read.black).toBe(false);
  });

  it('calls it black once it has lasted', () => {
    const means = [LIT, ...Array.from({ length: 15 }, () => DARK)];
    const read = readPicture(run(means), T);
    expect(read.darkForMs).toBeGreaterThanOrEqual(BLACK_FOR_MS);
    expect(read.black).toBe(true);
  });

  /* ONE BRIGHT FRAME ENDS THE RUN. A picture that came back is a
     picture that came back, and a run surviving an interruption would
     be an alarm about the past. */
  it('forgets the run the moment a picture comes back', () => {
    const means = [...Array.from({ length: 20 }, () => DARK), LIT];
    expect(readPicture(run(means), T).black).toBe(false);
    expect(readPicture(run(means), T).darkForMs).toBe(0);
  });

  it('starts a fresh run after an interruption', () => {
    const means = [...Array.from({ length: 20 }, () => DARK), LIT, DARK, DARK];
    const read = readPicture(run(means), T);
    /* Two samples a second apart span one second, and the twenty before
       the interruption count for nothing. */
    expect(read.darkForMs).toBe(1000);
    expect(read.black).toBe(false);
  });

  /*
   * MEASURED TO NOW, NOT TO THE LAST SAMPLE. A throttled background tab
   * stops sampling; the picture has still been black for however long
   * it has been black, and stopping the clock when the evidence stopped
   * arriving would freeze the alarm at the worst moment.
   */
  it('keeps counting when the sampler stops', () => {
    const stale = run([LIT, DARK, DARK], T - 30_000);
    const read = readPicture(stale, T);
    expect(read.darkForMs).toBeGreaterThanOrEqual(BLACK_FOR_MS);
    expect(read.black).toBe(true);
  });

  /*
   * AND IT MUST NOT INVENT BLACK FROM SILENCE. The counterpart to the
   * test above, and the more dangerous direction: when the sampler
   * stops on a LIT picture, the last thing anybody saw was a picture.
   * Carrying the clock forward from it would raise a black alarm out
   * of an absence of evidence — an alarm about a tab that went to the
   * background, on a channel that is fine. [D-04]
   */
  it('does not invent black when the sampler stops on a picture', () => {
    const stale = run([LIT, LIT], T - 30_000);
    expect(readPicture(stale, T).darkForMs).toBe(0);
    expect(readPicture(stale, T).black).toBe(false);
  });

  /* Above the noise a decoder leaves, below any real picture. */
  it('sits above decoded black and below a dark picture', () => {
    expect(BLACK_FLOOR).toBeGreaterThan(0.016);
    expect(BLACK_FLOOR).toBeLessThan(0.09);
    const means = Array.from({ length: 20 }, () => BLACK_FLOOR + 0.01);
    expect(readPicture(run(means), T).black).toBe(false);
  });
});

describe('the samples cannot grow without bound (C-28)', () => {
  /* A confidence monitor runs for the length of a broadcast, and a list
     that kept every sample would be a slow leak in the one component
     that must still be working at hour nine. */
  it('drops what is older than the window', () => {
    const old = { mean: LIT, at: T - 10 * 60_000 };
    expect(keep([old, ...run([LIT, LIT])], T)).not.toContainEqual(old);
  });

  it('never holds more than it needs', () => {
    const many = run(Array.from({ length: 200 }, () => LIT));
    expect(keep(many, T).length).toBeLessThanOrEqual(SAMPLES_KEPT);
  });

  it('keeps the newest, not the oldest', () => {
    const many = run(Array.from({ length: 200 }, (_, n) => n / 1000));
    const kept = keep(many, T);
    expect(kept[kept.length - 1]).toEqual(many[many.length - 1]);
  });
});

describe('what the monitor says (C-28, §18, D-04)', () => {
  const lit = readPicture(run([LIT]), T);
  const black = readPicture(run(Array.from({ length: 20 }, () => DARK)), T);

  /*
   * THE LAST CASE IS WHY ANY OF THIS EXISTS. Engine running, segments
   * arriving, nothing in playoutHealth complaining — and the picture is
   * black. Every other instrument says the channel is perfect.
   */
  it('names the fault nothing else in the building can see', () => {
    const note = confidenceSays({
      engine: 'running', stream: 'transmitting', picture: black,
      expected: true,
    });
    expect(note?.tone).toBe('fault');
    expect(note?.says).toContain('the picture is black');
    expect(note?.says).toMatch(/\d+s/);
  });

  it('says nothing when there is a picture and a transmitter', () => {
    expect(confidenceSays({
      engine: 'running', stream: 'transmitting', picture: lit,
      expected: true,
    })).toBe(null);
  });

  /*
   * A PROCESS FAULT OUTRANKS A PICTURE FAULT, which is the same order
   * `controlRoomNote` keeps — the two sit on one desk and must not
   * describe one condition two different ways. Blaming the picture for
   * the absence of a transmitter is the mistake available here.
   */
  it('blames the engine, not the picture, when nothing is being written', () => {
    const note = confidenceSays({
      engine: 'stopped', stream: 'silent', picture: black,
      expected: true,
    });
    expect(note?.says).not.toContain('the picture is black');
    expect(note?.says).toContain('playout engine');
  });

  it('blames the stream when the engine is up and it has stopped', () => {
    const note = confidenceSays({
      engine: 'running', stream: 'stalled', picture: black,
      expected: true,
    });
    expect(note?.says).not.toContain('the picture is black');
    expect(note?.says).toContain('stopped');
  });

  /* And a render failure outranks everything, exactly as it does in
     `controlRoomNote`: it is the one fault that explains the black. */
  /*
   * OFF AIR IS BLACK ON PURPOSE. `segment.ts`: *"Black and silence,
   * generated — which is also the honest picture: the channel has
   * nothing to show and says so by showing nothing."* An alarm here
   * would fire on every gap between two programmes, which is the
   * exact mistake `whyDark` exists to avoid. Found by opening the
   * monitor on a real channel and reading what it said. [D-04]
   */
  it('does not call an off-air channel’s black a fault', () => {
    expect(confidenceSays({
      engine: 'running', stream: 'transmitting', picture: black,
      expected: false,
    })).toBe(null);
  });

  it('knows when a picture is owed', () => {
    expect(expectsPicture({ kind: 'off' } as OnAir)).toBe(false);
    for (const kind of ['live', 'programme', 'rotation', 'emergency',
      'backup'] as const) {
      expect(expectsPicture({ kind } as OnAir), `${kind} owes a picture`)
        .toBe(true);
    }
  });

  it('gives a render failure the first word', () => {
    const note = confidenceSays({
      engine: 'running', stream: 'transmitting', picture: black,
      expected: true, failing: { says: 'no such filter: drawtext' },
    });
    expect(note?.says).toContain('drawtext');
    expect(note?.says).not.toContain('the picture is black');
  });
});
