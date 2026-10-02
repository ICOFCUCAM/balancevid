/**
 * Is the channel keeping up?  [CHANNEL §18, §7, D-20, D-21, C-41]
 *
 * THE ENGINE ALREADY KNEW AND THREW IT AWAY. `index.ts` has computed
 * `const spent = Date.now() - started` at the end of every pass since
 * it was written, and used it only to decide how long to sleep. The
 * number that says whether this product is a television station or a
 * slideshow was measured four times a second, for the life of every
 * broadcast, and never written down.
 *
 * So the only way to ask the question was a stopwatch somewhere else,
 * which is exactly how this stage started.
 */

import { describe, expect, it } from 'vitest';

import {
  type Pace, CROWDED, KEPT, keep, load, pacing, paceSays, worstLoad,
} from '../../src/domain/pace.js';
import { controlRoomNote } from '../../src/domain/health.js';

const pace = (spentMs: number, coveredMs = 4000): Pace => ({ spentMs, coveredMs });

describe('spent over produced (C-41)', () => {
  /* One is the edge of the cliff: there is no equilibrium above it. */
  it('is a ratio against what the pass actually produced', () => {
    expect(load(pace(2000, 4000))).toBe(0.5);
    expect(load(pace(4000, 4000))).toBe(1);
    /* Three segments is twelve seconds of television and twelve
       seconds of grace to make it in. */
    expect(load(pace(6000, 12_000))).toBe(0.5);
  });

  /*
   * A PASS THAT PRODUCED NOTHING HAS NO RATIO. The engine idles when
   * a channel is up to date, and calling that infinitely slow would
   * alarm on the healthiest state there is.
   */
  it('has no opinion about a pass that made nothing', () => {
    expect(load(pace(900, 0))).toBe(null);
    expect(load(pace(900, -1))).toBe(null);
  });
});

describe('what the last few passes say (C-41)', () => {
  /*
   * THE WORST RECENT PASS, NOT THE AVERAGE. Nineteen passes at 0.3s
   * and one at 5s has already dropped a segment, and a mean of 0.5
   * would call it healthy. Each time it runs out of time the picture
   * arrives late and nothing catches it up.
   */
  it('judges by the worst pass, not the mean', () => {
    const mostly = Array.from({ length: 19 }, () => pace(1200));
    expect(pacing([...mostly, pace(5000)])).toBe('behind');
    expect(worstLoad([...mostly, pace(5000)])).toBe(1.25);
  });

  it('calls a channel with room easy', () => {
    expect(pacing([pace(800), pace(1200), pace(900)])).toBe('easy');
  });

  /*
   * NOT 1.0. A channel at 95% of real time has no room for a longer
   * programme or the minute the operating system spends elsewhere,
   * and the first anybody knows is a stall.
   */
  it('warns before the cliff rather than at it', () => {
    expect(CROWDED).toBeGreaterThan(0.5);
    expect(CROWDED).toBeLessThan(1);
    expect(pacing([pace(CROWDED * 4000)])).toBe('crowded');
    expect(pacing([pace(CROWDED * 4000 - 1)])).toBe('easy');
    expect(pacing([pace(4000)])).toBe('behind');
  });

  it('says nothing about a channel that has produced nothing', () => {
    expect(pacing([])).toBe('unknown');
    expect(pacing([pace(900, 0)])).toBe('unknown');
    expect(worstLoad([])).toBe(null);
  });
});

describe('a rolling window, not a log (C-41)', () => {
  it('keeps the last few and forgets the rest', () => {
    let seen: Pace[] = [];
    for (let i = 0; i < KEPT + 10; i += 1) seen = keep(seen, pace(i));
    expect(seen).toHaveLength(KEPT);
    expect(seen[0]!.spentMs).toBe(10);
    expect(seen.at(-1)!.spentMs).toBe(KEPT + 9);
  });

  /* A bad minute that is over must stop being the verdict. */
  it('lets a channel recover', () => {
    let seen: Pace[] = [pace(9000)];
    expect(pacing(seen)).toBe('behind');
    for (let i = 0; i < KEPT; i += 1) seen = keep(seen, pace(600));
    expect(pacing(seen)).toBe('easy');
  });
});

describe('what the operator is told (C-41)', () => {
  /* "Slow" is not a thing anybody acts on. */
  it('names the consequence, not the measurement', () => {
    const says = paceSays('behind', 1.25);
    expect(says).toContain('arriving late');
    expect(says).toContain('125%');
  });

  it('says what to do about it', () => {
    expect(paceSays('behind', 1.1)).toMatch(/Fewer channels|bigger box/);
  });

  it('is quieter when there is merely no headroom', () => {
    const says = paceSays('crowded', 0.8);
    expect(says).toContain('keeping up');
    expect(says).not.toContain('stall');
  });
});

describe('where it sits in the control room (C-41)', () => {
  const behind = { says: 'The engine is taking longer…' };

  /*
   * BELOW A BLACK RENDER AND ABOVE EVERYTHING ELSE. A channel
   * falling behind is still transmitting, still green and still
   * producing segments — nothing else in the file can reveal it,
   * which is the same argument that puts a black render first.
   */
  it('speaks after a render that is putting out black', () => {
    const note = controlRoomNote('running', 'transmitting', null,
      { says: 'drawtext not found' }, behind);
    expect(note?.says).toContain('black');
  });

  it('speaks before an ordinary dark stretch', () => {
    const note = controlRoomNote('running', 'transmitting',
      'Nothing is scheduled.', null, behind);
    expect(note?.says).toBe(behind.says);
    expect(note?.tone).toBe('fault');
  });

  /* And a stopped engine is still the bigger fact. */
  it('does not speak over an engine that is not running', () => {
    const note = controlRoomNote('stopped', 'silent', null, null, behind);
    expect(note?.says).not.toBe(behind.says);
  });

  it('changes nothing when the channel is keeping up', () => {
    expect(controlRoomNote('running', 'transmitting', 'Nothing is scheduled.',
      null, null)?.says).toBe('Nothing is scheduled.');
  });
});
