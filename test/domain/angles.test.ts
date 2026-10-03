/**
 * Which takes are views of one moment.  [S-2, §7; TAKE-DESKTOP B-1]
 *
 * A singer doing the chorus four times has made four ATTEMPTS at
 * one thing. A capture station pointing four cameras at one room
 * has made four ANGLES of one thing. Studio Two has shown both in
 * the same multiview since it was written and has never been able
 * to say which it was looking at.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  angleNumber, angleSays, anglesOf, arrivalsIn, captureSpread, capturesIn,
  isAngle, spreadSays,
} from '../../src/domain/angles.js';

const take = (id: string, capture?: string, offset = 0, spread?: number) => ({
  id,
  ...(capture
    ? {
      capturedIn: {
        id: capture, offsetSamples: offset,
        ...(spread === undefined ? {} : { spreadSamples: spread }),
      },
    }
    : {}),
});

describe('an angle, or an attempt (B-1)', () => {
  /*
   * ABSENT MEANS AN ATTEMPT, and absent is what every take ever
   * recorded by this product is. A migration would be writing
   * down a fact that is already true.
   */
  it('reads a take with no capture as an attempt', () => {
    expect(isAngle(take('t1'))).toBe(false);
    expect(isAngle(take('t1', 'cap_1'))).toBe(true);
  });

  it('reads a capture id that is empty as no capture at all', () => {
    expect(isAngle({ id: 't', capturedIn: { id: '', offsetSamples: 0 } }))
      .toBe(false);
  });
});

describe('the angles of one capture (B-1)', () => {
  const four = [
    take('d', 'cap_1', 29), take('a', 'cap_1', 0),
    take('c', 'cap_1', 24), take('b', 'cap_1', 19),
  ];

  /*
   * INCLUDING ITSELF, because the question a surface asks is
   * *how many angles is this one of* and the answer for a
   * capture of four is four.
   */
  it('counts the take it was asked about', () => {
    expect(anglesOf(four, four[0]!).map((one) => one.id))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  /*
   * IN THE ORDER THEY STARTED, which is the order the capture
   * station numbered them. A multiview that reordered them by
   * upload would renumber somebody's cameras.
   */
  it('runs in the order they started, not the order they arrived', () => {
    expect(anglesOf(four, four[1]!).map((one) => one.id))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  /* Two angles that started on the same sample are ordered by id,
     so the answer does not move between two reads. */
  it('breaks a tie the same way twice', () => {
    const tied = [take('z', 'cap_1', 5), take('y', 'cap_1', 5)];
    expect(anglesOf(tied, tied[0]!).map((one) => one.id)).toEqual(['y', 'z']);
  });

  /*
   * NOTHING FOR AN ATTEMPT. A take with no capture is not an
   * angle of anything, and answering with the one take would say
   * it was an angle of itself.
   */
  it('answers nothing for a take that is not an angle', () => {
    expect(anglesOf([...four, take('lone')], take('lone'))).toEqual([]);
    expect(angleNumber(four, take('lone'))).toBe(0);
    expect(angleSays(four, take('lone'))).toBe('');
  });

  it('never mixes two captures', () => {
    const mixed = [...four, take('x', 'cap_2'), take('y', 'cap_2', 7)];
    expect(anglesOf(mixed, mixed[0]!).map((one) => one.id))
      .toEqual(['a', 'b', 'c', 'd']);
    expect(anglesOf(mixed, take('x', 'cap_2')).map((one) => one.id))
      .toEqual(['x', 'y']);
  });

  it('numbers an angle within its own capture', () => {
    expect(angleNumber(four, four[1]!)).toBe(1);
    expect(angleNumber(four, four[0]!)).toBe(4);
  });

  it('says which of how many', () => {
    expect(angleSays(four, four[0]!)).toBe('Angle 4 of 4');
    expect(angleSays(four, four[1]!)).toBe('Angle 1 of 4');
  });

  /*
   * NOTHING FOR A CAPTURE OF ONE. A single camera submitted from
   * the capture station is still a capture, and telling the
   * producer it is "Angle 1 of 1" is furniture explaining an
   * absence. What they need to know is when there is more than
   * one view to cut between.
   */
  it('says nothing about a capture with one angle in it', () => {
    const alone = [take('solo', 'cap_9')];
    expect(angleSays(alone, alone[0]!)).toBe('');
    expect(anglesOf(alone, alone[0]!).length).toBe(1);
  });
});

describe('the captures among a set of takes (B-1)', () => {
  it('lists each once, in the order its first angle appears', () => {
    expect(capturesIn([
      take('a'), take('b', 'cap_2'), take('c', 'cap_1'),
      take('d', 'cap_2'), take('e'),
    ])).toEqual(['cap_2', 'cap_1']);
  });

  it('lists nothing where nothing was captured together', () => {
    expect(capturesIn([take('a'), take('b')])).toEqual([]);
    expect(capturesIn([])).toEqual([]);
  });
});

describe('whether the capture held together (B-1)', () => {
  /*
   * THE SPREAD TRAVELS ON EVERY ANGLE and any one of them
   * answers. Where they disagree — which should not happen and
   * is a file on disk, so it can — the widest is taken, because
   * a capture is only as synchronised as its worst angle.
   */
  it('takes the widest where the angles disagree', () => {
    expect(captureSpread([
      take('a', 'cap_1', 0, 24), take('b', 'cap_1', 24, 96),
    ])).toBe(96);
  });

  it('answers from any one angle', () => {
    expect(captureSpread([take('a', 'cap_1', 0, 29)])).toBe(29);
  });

  /* Nothing between things that were not recorded together. */
  it('answers nothing where no angle recorded one', () => {
    expect(captureSpread([take('a'), take('b')])).toBe(null);
    expect(captureSpread([take('a', 'cap_1', 0)])).toBe(null);
    expect(captureSpread([])).toBe(null);
  });

  /* Zero is a spread, not an absence: four recorders that started
     on the same sample is the best possible answer. */
  it('reads a spread of nothing as a measurement', () => {
    expect(captureSpread([take('a', 'cap_1', 0, 0)])).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 *  What the multiview does with them.  [B-1]
 * ------------------------------------------------------------------ */

describe('the multiview says which are angles (B-1)', () => {
  const STAGE = readFileSync(
    join(import.meta.dirname, '..', '..', 'app/p/[id]/SwitchingStage.tsx'),
    'utf8');

  /*
   * IT ALREADY HELD N TAKES ON ONE CLOCK, which is the
   * correction PART FOUR records: the first draft of this plan
   * wanted to give a take N tracks, and reading this file showed
   * that four cameras do not need a new model — they need four
   * takes that know they belong together.
   *
   * SO THE CHANGE IS ONE LABEL, and the test is that it is one
   * label: a second multiview, or a branch on whether a take is
   * an angle, would be the thing B-1 exists not to build.
   */
  it('learns a label and not a second view', () => {
    expect(STAGE).toMatch(/angleSays\(performance\.takes, take\)/);
    expect(STAGE).toMatch(/data-testid="monitor-angle"/);
    /* No second grid, no second transport, no branch on kind. */
    expect(STAGE).not.toMatch(/if \(isAngle/);
    expect(STAGE).not.toMatch(/angleGrid|AngleView|anglesView/);
  });

  /*
   * AND EVERY EXISTING PERFORMANCE IS UNCHANGED, which is the
   * other half of what B-1 is judged on. `angleSays` answers
   * nothing for a take with no capture and nothing for a capture
   * of one, so a multiview of four attempts draws exactly what
   * it drew before this existed.
   */
  it('adds nothing to a performance of four attempts', () => {
    const attempts = ['a', 'b', 'c', 'd'].map((id) => take(id));
    for (const one of attempts) {
      expect(angleSays(attempts, one)).toBe('');
    }
  });

  /*
   * FOUR HAND-WRITTEN TAKES SHARING A CAPTURE READ AS ANGLES,
   * which is the criterion in as many words.
   */
  it('reads four takes sharing a capture as four angles', () => {
    const angles = [
      take('t1', 'cap_x', 0, 29), take('t2', 'cap_x', 19, 29),
      take('t3', 'cap_x', 24, 29), take('t4', 'cap_x', 29, 29),
    ];
    expect(angles.map((one) => angleSays(angles, one))).toEqual([
      'Angle 1 of 4', 'Angle 2 of 4', 'Angle 3 of 4', 'Angle 4 of 4',
    ]);
    expect(captureSpread(angles)).toBe(29);
  });

  /* And a performance holding both says so about each. */
  it('tells angles and attempts apart in one performance', () => {
    const mixed = [
      take('solo'), take('again'),
      take('cam1', 'cap_y', 0), take('cam2', 'cap_y', 12),
    ];
    expect(mixed.map((one) => angleSays(mixed, one)))
      .toEqual(['', '', 'Angle 1 of 2', 'Angle 2 of 2']);
  });
});

/* ------------------------------------------------------------------ *
 *  B-3 — what the inbox is looking at.
 * ------------------------------------------------------------------ */

describe('what arrived, rather than what was uploaded', () => {
  /*
   * THE WHOLE OF B-3 IN ONE ASSERTION. Four cameras on one song
   * is ONE thing a producer has to decide about, and the list has
   * been handing them that decision four times.
   */
  it('shows four angles as one arrival', () => {
    const sent = [
      take('cam1', 'cap_x', 0, 29), take('cam2', 'cap_x', 19, 29),
      take('cam3', 'cap_x', 24, 29), take('cam4', 'cap_x', 29, 29),
    ];
    const arrivals = arrivalsIn(sent);
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]!.map((one) => one.id)).toEqual(['cam1', 'cam2', 'cam3', 'cam4']);
  });

  /*
   * AND AN ATTEMPT IS AN ARRIVAL OF ONE, not a special case —
   * which is what makes this safe to put in front of every
   * submission this product has ever taken.
   */
  it('leaves a recording that belongs to nothing exactly as it was', () => {
    const sent = [take('one'), take('two'), take('three')];
    expect(arrivalsIn(sent).map((group) => group.map((o) => o.id)))
      .toEqual([['one'], ['two'], ['three']]);
  });

  /*
   * ORDER IS THE ORDER THINGS CAME IN, with a capture standing
   * where its FIRST angle stood. A producer who looked away must
   * not find the list reshuffled because one camera's segments
   * finished uploading before another's.
   */
  it('keeps a capture where its first angle was', () => {
    const sent = [
      take('early'), take('cam1', 'cap_x', 19), take('late'),
      take('cam2', 'cap_x', 0),
    ];
    expect(arrivalsIn(sent).map((group) => group.map((o) => o.id)))
      /* The capture sits third-from-nothing — where `cam1` arrived —
         and inside it the angles are in start order, so `cam2`
         (offset 0) leads although it landed last. */
      .toEqual([['early'], ['cam2', 'cam1'], ['late']]);
  });

  /* Two captures in one request are two arrivals, not one. */
  it('keeps two captures apart', () => {
    const sent = [
      take('a1', 'cap_a', 0), take('b1', 'cap_b', 0),
      take('a2', 'cap_a', 7), take('b2', 'cap_b', 9),
    ];
    expect(arrivalsIn(sent).map((group) => group.map((o) => o.id)))
      .toEqual([['a1', 'a2'], ['b1', 'b2']]);
  });
});

describe('whether a capture held together', () => {
  /*
   * MILLISECONDS, BECAUSE SAMPLES ARE NOT A UNIT ANYBODY FEELS.
   * The producer's question is whether these can be cut between,
   * and a frame at 30fps is 33 ms — so T-4's own measured capture,
   * at 0.6 ms, is comfortably inside one and the number says so
   * without anybody doing the division.
   */
  it('says how far apart they started, in a unit a person has', () => {
    const measured = [take('a', 'cap_x', 0, 29), take('b', 'cap_x', 29, 29)];
    expect(spreadSays(measured, 48000)).toBe('0.6 ms apart');
  });

  /* A wide spread is rounded, because a tenth of 400 ms is noise. */
  it('rounds a spread nobody needs a tenth of', () => {
    expect(spreadSays([take('a', 'cap_x', 0, 19200)], 48000)).toBe('400 ms apart');
  });

  /*
   * AND SAYS NOTHING WHERE THERE IS NOTHING TO SAY. An attempt has
   * no spread; neither does a capture whose angles all started on
   * the same sample, and printing "0.0 ms apart" would be furniture
   * explaining an absence.
   */
  it('says nothing for an attempt, or for angles that started together', () => {
    expect(spreadSays([take('solo')], 48000)).toBe('');
    expect(spreadSays([take('a', 'cap_x', 0, 0), take('b', 'cap_x', 0, 0)], 48000))
      .toBe('');
  });

  /* A rate of zero is a bad reading, not a division. */
  it('says nothing rather than dividing by a rate it was not given', () => {
    expect(spreadSays([take('a', 'cap_x', 0, 29)], 0)).toBe('');
  });
});
