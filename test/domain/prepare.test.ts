/**
 * Whether this machine can record what is plugged into it.
 *   [U-19, D-21; TAKE-DESKTOP T-3]
 *
 * > *"Refuses to arm with a reason rather than failing mid-record."*
 *
 * The whole point is the word BEFORE. A capture station that
 * discovers at minute forty that the disk cannot keep up has
 * destroyed the thing it was there to make.
 */

import { describe, expect, it } from 'vitest';

import {
  HEADROOM_BYTES, LEAST_MINUTES, WRITE_MARGIN, bitrateOf, bytesPerSecond,
  minutesSays, prepare, rateSays, sizeSays,
} from '../../shared/src/prepare.js';

const hd = { width: 1920, height: 1080, frameRate: 30, hasAudio: true, live: true };
const many = (n: number) => Array.from({ length: n }, () => ({ ...hd }));
const roomy = { freeBytes: 500e9, writeBytesPerSecond: 200e6 };
const of = (id: string, result: ReturnType<typeof prepare>) =>
  result.checks.find((one) => one.id === id)!;

describe('what a recording is expected to cost (T-3)', () => {
  it('costs more for more pixels and more frames', () => {
    const small = bitrateOf({ width: 640, height: 480, frameRate: 30 });
    const big = bitrateOf({ width: 1920, height: 1080, frameRate: 30 });
    const fast = bitrateOf({ width: 1920, height: 1080, frameRate: 60 });
    expect(big).toBeGreaterThan(small);
    expect(fast).toBeCloseTo(big * 2, 0);
  });

  /*
   * DELIBERATELY AT THE TOP OF THE REALISTIC RANGE. The first
   * constant written here gave 7.5 Mbps for 1080p30 — what a
   * static lectern encodes to — and the consequence was worse
   * than an inaccurate figure: four streams came out at 3.6 MB/s,
   * so almost no disk could fail the write check and the refusal
   * this stage is judged on would never have fired.
   */
  it('plans for a room with people moving in it', () => {
    const mbps = bitrateOf(hd) / 1e6;
    expect(mbps).toBeGreaterThan(10);
    expect(mbps).toBeLessThan(16);
  });

  it('counts a microphone whatever the picture is doing', () => {
    expect(bitrateOf({ hasAudio: true })).toBeGreaterThan(0);
    expect(bitrateOf({})).toBe(0);
    expect(bitrateOf({ width: 1920, height: 1080, hasAudio: true }))
      .toBe(bitrateOf({ hasAudio: true }));
  });

  it('adds the sources up', () => {
    expect(bytesPerSecond(many(4))).toBeCloseTo(bytesPerSecond([hd]) * 4, 0);
    expect(bytesPerSecond([])).toBe(0);
  });
});

describe('what the numbers read as (T-3)', () => {
  it('says a size somebody can read', () => {
    expect(sizeSays(0)).toBe('0 B');
    expect(sizeSays(900)).toBe('900 B');
    expect(sizeSays(1536)).toBe('1.5 KB');
    expect(sizeSays(500e9)).toBe('466 GB');
    expect(sizeSays(-1)).toBe('—');
    expect(sizeSays(Number.NaN)).toBe('—');
  });

  /* One decimal below ten, none above: `1.5 GB` and `466 GB`. */
  it('is precise where precision is readable and not where it is not', () => {
    expect(sizeSays(1.5 * 1024 ** 3)).toBe('1.5 GB');
    expect(sizeSays(240 * 1024 ** 2)).toBe('240 MB');
  });

  it('says a rate as a size a second', () => {
    expect(rateSays(6 * 1024 ** 2)).toBe('6.0 MB/s');
  });

  it('says a duration the way somebody thinks about one', () => {
    expect(minutesSays(0)).toBe('no time at all');
    expect(minutesSays(-5)).toBe('no time at all');
    expect(minutesSays(0.4)).toBe('under a minute');
    expect(minutesSays(42)).toBe('42 minutes');
    expect(minutesSays(200)).toBe('3.3 hours');
    expect(minutesSays(3000)).toBe('50 hours');
  });
});

describe('arming, and refusing to (T-3)', () => {
  it('arms when the machine can do it', () => {
    const ready = prepare(many(4), roomy);
    expect(ready.armable).toBe(true);
    expect(ready.checks.every((one) => one.ok)).toBe(true);
  });

  it('refuses with nothing chosen, and says what to do', () => {
    const none = prepare([], roomy);
    expect(none.armable).toBe(false);
    expect(of('sources', none).says).toMatch(/Pick at least one/);
    /*
     * AND NOTHING ELSE COMPLAINS. The disk check FAILED here,
     * blocking, saying "Nothing to record yet" — a refusal that
     * is not one, two lines below the real one. `write` already
     * got this right and the two disagreed; found by a mutation
     * on the sources check that could not be killed because
     * another blocking check was failing anyway.
     */
    expect(none.checks.filter((one) => !one.ok).map((one) => one.id))
      .toEqual(['sources']);
  });

  /*
   * THE FAULT THIS WHOLE SCREEN EXISTS FOR. A capture card with
   * no cable opens perfectly and records forty minutes of black,
   * and the operator finds out when somebody asks for the wide
   * shot.
   */
  it('refuses when a source is open and delivering nothing', () => {
    const dark = prepare([...many(3), { ...hd, live: false }], roomy);
    expect(dark.armable).toBe(false);
    const says = of('picture', dark).says;
    expect(says).toMatch(/1 of 4/);
    expect(says).toMatch(/capture card with no cable/);
  });

  /*
   * THE CRITERION THIS STAGE IS JUDGED ON: *"a refusal with a
   * sentence when a disk cannot sustain four streams."*
   */
  it('refuses a disk that cannot keep up, and says both numbers', () => {
    const slow = prepare(many(4),
      { freeBytes: 500e9, writeBytesPerSecond: 7e6 });
    expect(slow.armable).toBe(false);
    const says = of('write', slow).says;
    expect(says).toMatch(/4 sources need/);
    /*
     * AND THE SENTENCE QUOTES THE NUMBER IT COMPARED. It said
     * "need about 6.0 MB/s … sustained 6.7 MB/s" and then
     * refused, because the comparison was against 6.0 x the
     * margin. A refusal whose own numbers say it should have
     * passed is worse than no numbers at all.
     */
    const needed = bytesPerSecond(many(4));
    expect(says).toContain(rateSays(needed * WRITE_MARGIN));
    expect(says).toContain(rateSays(7e6));
    expect(says).toMatch(/fewer sources|resolution|faster disk/);
  });

  it('allows a disk with the margin and refuses one just under it', () => {
    const needed = bytesPerSecond(many(4));
    expect(prepare(many(4), {
      freeBytes: 500e9, writeBytesPerSecond: needed * WRITE_MARGIN,
    }).armable).toBe(true);
    expect(prepare(many(4), {
      freeBytes: 500e9, writeBytesPerSecond: needed * WRITE_MARGIN - 1,
    }).armable).toBe(false);
  });

  /*
   * NOT ONE MINUTE, WHICH IS WHAT THIS SAID FIRST. Three
   * gigabytes free armed happily and reported two minutes — a
   * check that announces two minutes and calls it ready is not
   * protecting anybody.
   */
  it('refuses a disk with only minutes on it', () => {
    const tiny = prepare(many(4), { freeBytes: 3e9, writeBytesPerSecond: 200e6 });
    expect(tiny.armable).toBe(false);
    expect(of('disk', tiny).says).toMatch(/less than the 10 minutes/);
  });

  it('keeps room for the machine as well as the recording', () => {
    const needed = bytesPerSecond(many(4));
    /* Exactly enough for the floor, and not a byte of headroom. */
    const bare = needed * 60 * LEAST_MINUTES;
    expect(prepare(many(4),
      { freeBytes: bare, writeBytesPerSecond: 200e6 }).armable).toBe(false);
    expect(prepare(many(4), {
      freeBytes: bare + HEADROOM_BYTES, writeBytesPerSecond: 200e6,
    }).armable).toBe(true);
  });

  it('says the disk as a time rather than as bytes', () => {
    const says = of('disk', prepare(many(4), roomy)).says;
    expect(says).toMatch(/466 GB free/);
    expect(says).toMatch(/hours|minutes/);
  });

  /*
   * A FORMAT NOBODY ASKED FOR IS A WARNING, NOT A REFUSAL. A
   * camera that gave 640x480 when asked for 1080p will record
   * perfectly well; it will simply not match the others, and that
   * is the operator's decision rather than this screen's.
   */
  it('warns about mismatched sources without refusing them', () => {
    const mixed = prepare(
      [hd, { ...hd, width: 640, height: 480 }], roomy);
    expect(of('format', mixed).ok).toBe(false);
    expect(of('format', mixed).blocking).toBe(false);
    expect(mixed.armable).toBe(true);
    expect(of('format', mixed).says).toMatch(/1920×1080.*640×480|640×480.*1920×1080/);
  });

  it('says nothing about format before there is a picture', () => {
    const early = prepare([{ hasAudio: true, live: true }], roomy);
    expect(of('format', early).ok).toBe(true);
  });

  /*
   * THE ORDER IS THE ORDER SOMEBODY FIXES THEM IN. Telling
   * somebody their disk is slow when they have not plugged a
   * camera in is a check list read out backwards.
   */
  it('reads in the order somebody fixes them in', () => {
    expect(prepare(many(2), roomy).checks.map((one) => one.id))
      .toEqual(['sources', 'picture', 'format', 'disk', 'write']);
  });

  it('answers the rate and the time it computed, not only the words', () => {
    const ready = prepare(many(4), roomy);
    expect(ready.bytesPerSecond).toBeCloseTo(bytesPerSecond(many(4)), 0);
    expect(ready.minutes).toBeGreaterThan(60);
  });
});
