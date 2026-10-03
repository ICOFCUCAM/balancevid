/**
 * One capture, and how far apart its angles started.
 *   [U-06, U-08; S-3; TAKE-DESKTOP T-4, B-1]
 *
 * PART THREE measured the spread at under a millisecond across
 * eight recorders in a container. This is where it becomes a
 * recorded number per session rather than an assumption.
 */

import { describe, expect, it } from 'vitest';

import {
  type SourceStart, agreement, captureOf, earliestOf, offsetSamples,
  spreadMs, spreadSays, startedAt, startedTogether,
} from '../../shared/src/capture.js';
import { HOUSE_SAMPLE_RATE, SYNC_TOLERANCE_SAMPLES } from '../../shared/src/time.js';

const at = (id: string, called: number, first?: number): SourceStart => ({
  id, calledAtMs: called, ...(first === undefined ? {} : { firstChunkAtMs: first }),
});

describe('when a recorder actually began (T-4)', () => {
  /*
   * THE FIRST CHUNK WHERE THERE IS ONE. `MediaRecorder.start()`
   * does not begin capturing at the moment it is called — the
   * first line of `useMasterRecording`'s own list of errors in
   * play — so the call is when it was ASKED and the first chunk
   * closing is when capture demonstrably EXISTED.
   */
  it('prefers the chunk that closed to the call that was made', () => {
    expect(startedAt(at('a', 100, 140))).toBe(140);
  });

  /*
   * AND FALLS BACK TO THE CALL, because a recorder that has been
   * asked and not yet delivered is still a recorder somebody
   * started — the grid shows it as OPENING and the capture has
   * to say something about it.
   */
  it('falls back to the call where no chunk has closed', () => {
    expect(startedAt(at('a', 100))).toBe(100);
  });
});

describe('the spread (T-4)', () => {
  it('is the distance between the first and the last', () => {
    expect(spreadMs([at('a', 0, 100), at('b', 0, 100.4), at('c', 0, 100.9)]))
      .toBeCloseTo(0.9, 6);
  });

  /* One recorder cannot disagree with itself. */
  it('is nothing for one source, and for none', () => {
    expect(spreadMs([at('a', 0, 100)])).toBe(0);
    expect(spreadMs([])).toBe(0);
    expect(earliestOf([])).toBe(0);
  });

  it('measures from the chunks, not the calls', () => {
    /* Called in a tight loop, delivering far apart. */
    expect(spreadMs([at('a', 10, 100), at('b', 10.1, 180)])).toBeCloseTo(80, 6);
  });

  /*
   * AGAINST THE PRODUCT'S OWN TOLERANCE, which is twenty
   * milliseconds and which every other synchronisation question
   * here is judged by. A second threshold would be a second
   * answer to "are these in sync".
   */
  it('judges synchrony by the tolerance the product already holds', () => {
    const inside = SYNC_TOLERANCE_SAMPLES / HOUSE_SAMPLE_RATE * 1000;
    expect(startedTogether([at('a', 0, 0), at('b', 0, inside)])).toBe(true);
    expect(startedTogether([at('a', 0, 0), at('b', 0, inside + 1)])).toBe(false);
  });

  it('says the spread in a unit somebody reads', () => {
    expect(spreadSays([at('a', 0, 0)])).toBe('one source');
    expect(spreadSays([at('a', 0, 0), at('b', 0, 0.0009)]))
      .toMatch(/2 sources started within 1 µs/);
    expect(spreadSays([at('a', 0, 0), at('b', 0, 4.2)]))
      .toMatch(/within 4\.2 ms/);
    expect(spreadSays([at('a', 0, 0), at('b', 0, 90)]))
      .toMatch(/90\.0 ms apart, which is wider/);
  });
});

describe('where each angle begins (T-4)', () => {
  /*
   * SAMPLES, NOT MILLISECONDS, because that is the unit the
   * installation places takes in. A number handed over in
   * milliseconds would be converted by whoever read it, which is
   * where the two ends come to disagree. [U-08]
   */
  it('is measured from the earliest, in samples', () => {
    const starts = [at('a', 0, 100), at('b', 0, 100 + 1000 / HOUSE_SAMPLE_RATE * 48)];
    expect(offsetSamples(starts, 'a')).toBe(0);
    expect(offsetSamples(starts, 'b')).toBe(48);
  });

  it('is nothing for a source nobody recorded', () => {
    expect(offsetSamples([at('a', 0, 100)], 'nobody')).toBe(0);
  });

  it('takes the rate it is given', () => {
    const starts = [at('a', 0, 0), at('b', 0, 1000)];
    expect(offsetSamples(starts, 'b', 1000)).toBe(1000);
    expect(offsetSamples(starts, 'b', HOUSE_SAMPLE_RATE))
      .toBe(HOUSE_SAMPLE_RATE);
  });
});

describe('what correlation is allowed to say (T-4)', () => {
  /*
   * A CHECK IS NOT A CORRECTION. `align.ts`'s own caution is why:
   * a confident correlation against the wrong part of a recording
   * lands on the second chorus. The measured start came from the
   * machine that did the recording; the correlation came from a
   * search.
   */
  it('agrees inside the product tolerance and not outside it', () => {
    expect(agreement('a', 1000, 1000 + SYNC_TOLERANCE_SAMPLES, 0.9).agrees)
      .toBe(true);
    expect(agreement('a', 1000, 1000 + SYNC_TOLERANCE_SAMPLES + 1, 0.9).agrees)
      .toBe(false);
    /* In both directions: early is as wrong as late. */
    expect(agreement('a', 1000, 1000 - SYNC_TOLERANCE_SAMPLES - 1, 0.9).agrees)
      .toBe(false);
  });

  it('keeps both numbers, so the disagreement is readable', () => {
    const said = agreement('a', 1000, 5000, 0.8);
    expect(said.measuredSamples).toBe(1000);
    expect(said.heardSamples).toBe(5000);
    expect(said.confidence).toBe(0.8);
  });
});

describe('what is written down (T-4)', () => {
  const angles = [
    { sourceId: 'a', label: 'Front', file: 'a.webm', calledAtMs: 10,
      firstChunkAtMs: 100, bytes: 1_000, hasAudio: true,
      width: 1920, height: 1080, frameRate: 30 },
    { sourceId: 'b', label: 'Wide', file: 'b.webm', calledAtMs: 10,
      firstChunkAtMs: 100.5, bytes: 900, hasAudio: false },
  ];
  const starts = [at('a', 10, 100), at('b', 10, 100.5)];

  it('places every angle against the earliest', () => {
    const made = captureOf({
      id: 'cap_1', label: 'Take 1', beganAt: '2026-10-03T10:00:00.000Z',
      starts, angles,
    });
    expect(made.angles.map((one) => one.offsetSamples))
      .toEqual([0, Math.round(0.5 * HOUSE_SAMPLE_RATE / 1000)]);
    expect(made.spreadMs).toBeCloseTo(0.5, 6);
    expect(made.startedTogether).toBe(true);
    expect(made.sampleRate).toBe(HOUSE_SAMPLE_RATE);
  });

  it('keeps everything the offset was derived from', () => {
    const made = captureOf({
      id: 'cap_1', label: 'Take 1', beganAt: '2026-10-03T10:00:00.000Z',
      starts, angles,
    });
    /* A number with no measurement behind it is a number somebody
       has to trust. */
    expect(made.angles[0]).toMatchObject({
      calledAtMs: 10, firstChunkAtMs: 100, bytes: 1000, file: 'a.webm',
    });
  });

  it('carries the checks only where there are any', () => {
    const bare = captureOf({
      id: 'c', label: 'T', beganAt: 'x', starts, angles,
    });
    expect(bare.checks).toBeUndefined();
    const checked = captureOf({
      id: 'c', label: 'T', beganAt: 'x', starts, angles,
      checks: [agreement('b', 24, 25, 0.9)],
    });
    expect(checked.checks!.length).toBe(1);
    /* And beside the offset, never instead of it. */
    expect(checked.angles[1]!.offsetSamples).toBe(24);
  });

  /*
   * AND A CAPTURE THAT IS NOT SYNCHRONISED SAYS SO IN ITS OWN
   * RECORD. This is the whole point of writing the number down:
   * a submission arriving at the installation with four angles
   * ninety milliseconds apart must carry that fact, not a flag
   * that always reads true. The mutation that hardcoded it
   * survived until this existed.
   */
  it('records that angles did not start together, when they did not', () => {
    const apart = [at('a', 10, 100), at('b', 10, 190)];
    const made = captureOf({
      id: 'cap_2', label: 'Take 2', beganAt: 'x', starts: apart,
      angles: [
        { ...angles[0]!, firstChunkAtMs: 100 },
        { ...angles[1]!, firstChunkAtMs: 190 },
      ],
    });
    expect(made.startedTogether).toBe(false);
    expect(made.spreadMs).toBeCloseTo(90, 6);
    /* And the angles are still placed, because a capture that is
       out of sync is a capture somebody still has to work with. */
    expect(made.angles[1]!.offsetSamples)
      .toBe(Math.round(90 * HOUSE_SAMPLE_RATE / 1000));
  });

  it('leaves out an end that has not happened', () => {
    const made = captureOf({ id: 'c', label: 'T', beganAt: 'x', starts, angles });
    expect(made.endedAt).toBeUndefined();
    expect(captureOf({
      id: 'c', label: 'T', beganAt: 'x', endedAt: 'y', starts, angles,
    }).endedAt).toBe('y');
  });
});
