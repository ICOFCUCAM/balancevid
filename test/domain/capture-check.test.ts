/**
 * Asking the room whether the clock was right.  [TAKE-DESKTOP T-4]
 *
 * > *"correlation is offered as a check on the measured start,
 * > stored beside it, never silently replacing it."*
 */

import { describe, expect, it } from 'vitest';

import { HEARD_THRESHOLD, checkAgainstRoom } from '../../desktop/src/check.js';
import { MASTER_AUDIBLE_THRESHOLD } from '../../shared/src/align.js';
import { HOUSE_SAMPLE_RATE, SYNC_TOLERANCE_SAMPLES } from '../../shared/src/time.js';

const RATE = 48_000;

/** A few seconds of room: transients a correlation can find. */
function room(seconds: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  let x = seed;
  for (let i = 0; i < out.length; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    /* Claps rather than noise: an onset envelope is about change. */
    const beat = i % Math.round(RATE * 0.25);
    out[i] = beat < 400 ? (x / 2147483648 - 0.5) * 2 : (x / 2147483648 - 0.5) * 0.02;
  }
  return out;
}

/**
 * The same room, recorded by a camera that started `by` later.
 *
 * TRIMMED, NOT PADDED, AND THE FIRST VERSION OF THIS WAS PADDED.
 * A camera that starts late does not record silence and then the
 * room; it records the room FROM `by` onward. Padding models a
 * recording that began EARLY, which `align.ts` clamps to zero —
 * *"where the take's first sample sits on the master clock"*
 * cannot be negative — so the fixture correlated at 1.000 and
 * reported an offset of 0, and the test failed for the right
 * reason on the wrong signal.
 */
function startedLate(source: Float32Array, by: number): Float32Array {
  return source.subarray(by);
}

describe('what the room says about a start (T-4)', () => {
  /*
   * THE GATE IS `align.ts`'s OWN QUESTION, not a second one. A
   * lower threshold here was written first and was a false
   * reassurance: `measureAlignment` returns the HINT UNCHANGED
   * below `MASTER_AUDIBLE_THRESHOLD`, so a check gated beneath
   * it would record an agreement between the clock and an echo
   * of itself.
   */
  it('uses the threshold the alignment already decided', () => {
    expect(HEARD_THRESHOLD).toBe(MASTER_AUDIBLE_THRESHOLD);
  });

  /*
   * NOTHING FOR FEWER THAN TWO. One camera has nothing to agree
   * with, and a confident zero there would be a reassurance
   * about a question nobody asked.
   */
  it('says nothing about one source, or none', () => {
    const only = room(1);
    expect(checkAgainstRoom([
      { sourceId: 'a', samples: only, rate: RATE, measuredSamples: 0 },
    ])).toEqual([]);
    expect(checkAgainstRoom([])).toEqual([]);
  });

  it('says nothing where a source recorded no sound at all', () => {
    expect(checkAgainstRoom([
      { sourceId: 'a', samples: new Float32Array(0), rate: RATE, measuredSamples: 0 },
      { sourceId: 'b', samples: room(1), rate: RATE, measuredSamples: 0 },
    ])).toEqual([]);
  });

  /*
   * AND NOTHING WHERE THERE WAS NOTHING IN COMMON. Four cameras
   * in four different rooms share no sound, and a correlation
   * against silence is a confident number about nothing.
   */
  it('says nothing about two sources that heard different rooms', () => {
    const said = checkAgainstRoom([
      { sourceId: 'a', samples: room(2, 1), rate: RATE, measuredSamples: 0 },
      { sourceId: 'b', samples: new Float32Array(2 * RATE), rate: RATE,
        measuredSamples: 0 },
    ]);
    expect(said).toEqual([]);
  });

  /*
   * WHERE THE CLOCK AND THE ROOM AGREE, it says so — and this is
   * the ordinary case: four recorders on one machine start
   * within a millisecond, and the sound confirms it.
   */
  it('agrees with a clock that was right', () => {
    const heard = room(3);
    const said = checkAgainstRoom([
      { sourceId: 'a', samples: heard, rate: RATE, measuredSamples: 0 },
      { sourceId: 'b', samples: heard, rate: RATE, measuredSamples: 0 },
    ]);
    expect(said.length).toBe(1);
    expect(said[0]!.sourceId).toBe('b');
    expect(said[0]!.agrees).toBe(true);
    expect(said[0]!.confidence).toBeGreaterThanOrEqual(MASTER_AUDIBLE_THRESHOLD);
  });

  /*
   * AND WHERE THEY DISAGREE IT SAYS BOTH NUMBERS. This is the
   * whole value of the check: a camera whose stream was buffered
   * somewhere starts later than the clock noticed, and nothing
   * else in the system would ever mention it.
   */
  it('reports a disagreement rather than resolving it', () => {
    const heard = room(3);
    const late = Math.round(RATE * 0.12);
    const said = checkAgainstRoom([
      { sourceId: 'a', samples: heard, rate: RATE, measuredSamples: 0 },
      /* The clock says it started together; the sound says it is
         120 ms late. */
      { sourceId: 'b', samples: startedLate(heard, late), rate: RATE,
        measuredSamples: 0 },
    ]);
    expect(said.length).toBe(1);
    expect(said[0]!.measuredSamples).toBe(0);
    expect(said[0]!.heardSamples).toBeGreaterThan(SYNC_TOLERANCE_SAMPLES);
    /* 120 ms at 48 kHz, within the envelope's own millisecond. */
    expect(said[0]!.heardSamples).toBeCloseTo(late, -2);
    expect(said[0]!.agrees).toBe(false);
  });

  /*
   * AND IT NEVER REPLACES THE MEASUREMENT. `measuredSamples`
   * comes back exactly as it went in, whatever the correlation
   * found — which is what "stored beside it, never silently
   * replacing it" means in code.
   */
  it('hands the measured number back untouched', () => {
    const heard = room(3);
    const said = checkAgainstRoom([
      { sourceId: 'a', samples: heard, rate: RATE, measuredSamples: 0 },
      { sourceId: 'b', samples: startedLate(heard, 4800), rate: RATE,
        measuredSamples: 1234 },
    ]);
    expect(said[0]!.measuredSamples).toBe(1234);
  });

  /*
   * A HINT IN THE WRONG PLACE SENDS THE SEARCH TO THE WRONG
   * PLACE. `measureAlignment` looks only +/-0.75 s around what it
   * is told, which is the whole reason it can be trusted — so a
   * camera more than a search-width late is found only because
   * the clock said roughly where to look. Every other fixture
   * here measures from zero, where a dropped hint costs nothing;
   * this one does not.
   */
  it('searches where the clock said to look', () => {
    const heard = room(4);
    const late = Math.round(RATE * 1.0);
    const said = checkAgainstRoom([
      { sourceId: 'a', samples: heard, rate: RATE, measuredSamples: 0 },
      { sourceId: 'b', samples: startedLate(heard, late), rate: RATE,
        measuredSamples: late },
    ]);
    expect(said.length).toBe(1);
    expect(said[0]!.heardSamples).toBeCloseTo(late, -2);
    /* The clock was right, so they agree. */
    expect(said[0]!.agrees).toBe(true);
  });

  /*
   * THE RATES ARE CONVERTED AT BOTH ENDS. The hint goes in at the
   * samples' own rate and the answer comes back at the house
   * rate, because that is the unit everything downstream places
   * takes in. A number handed over in the wrong rate would send
   * the search to the wrong place and let it answer confidently
   * from there. [U-08]
   */
  it('speaks the house rate outward whatever rate it heard', () => {
    /*
     * A DEVICE AT HALF THE HOUSE RATE, so the conversion is not
     * the identity it is for every other fixture here. A camera
     * at 24 kHz that started 200 ms late is 4800 of its own
     * samples and 9600 of the product's, and handing over the
     * wrong one would place the angle at half the offset. [U-08]
     */
    const slow = 24_000;
    /*
     * AND THE DELAY IS LONGER THAN THE SEARCH IS WIDE. At 200 ms
     * a hint in the wrong rate still lands inside the +/-0.75 s
     * window and the correlation finds the answer anyway, so the
     * conversion was unobservable and a mutation that dropped it
     * survived. At 1.2 s it does not: the wrong hint puts the
     * window at 2.4 s and the truth is nowhere in it.
     */
    const seconds = 6;
    const out = new Float32Array(seconds * slow);
    let x = 7;
    for (let i = 0; i < out.length; i += 1) {
      x = (x * 1103515245 + 12345) % 2147483648;
      out[i] = i % Math.round(slow * 0.25) < 200
        ? (x / 2147483648 - 0.5) * 2 : (x / 2147483648 - 0.5) * 0.02;
    }
    const lateOwn = Math.round(slow * 1.2);
    const lateHouse = Math.round(HOUSE_SAMPLE_RATE * 1.2);
    const said = checkAgainstRoom([
      { sourceId: 'a', samples: out, rate: slow, measuredSamples: 0 },
      { sourceId: 'b', samples: out.subarray(lateOwn), rate: slow,
        measuredSamples: lateHouse },
    ]);
    expect(said.length).toBe(1);
    /* The answer is in the product's samples, not the device's. */
    expect(said[0]!.heardSamples).toBeGreaterThan(lateOwn);
    expect(said[0]!.heardSamples).toBeCloseTo(lateHouse, -2);
  });
});
