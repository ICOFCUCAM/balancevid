/**
 * 111% of real time, and the advice named every remedy but ours.
 *   [CHANNEL §7, §11, §15, §17; Doctrine D-13, D-20, D-21, U-02, U-16]
 *
 * WHAT THE CONTROL ROOM SAID, on a real installation:
 *
 * > *"The engine is taking longer to make the broadcast than the
 * > broadcast lasts (111% of real time). The picture will start
 * > arriving late and players will stall. Fewer channels, a
 * > simpler source, or a bigger box."*
 *
 * THREE REMEDIES, ALL OF THEM THE OPERATOR'S, AND NOT ONE OF THEM
 * THE PRODUCT'S OWN. `PLAYOUT_SHARDS` exists for exactly this and
 * was measured on exactly this shape of installation: seventeen
 * channels on one engine ran at **2.36 of real time** and every
 * channel ran out of playlist; a third of them on one engine ran
 * at **0.66** and none did. The sentence did not mention it.
 *
 * AND ONE LINE OF THE ADVICE WAS WORSE THAN SILENT. `reachSays`,
 * for a starving channel on an engine that is also behind, said
 * *"this is not a matter of rearranging: fewer channels, a simpler
 * source, or a bigger box."* Rearranging is precisely what fixes
 * it — an engine's load is the work of the channels it was GIVEN,
 * so handing half of them to a second service halves it. That
 * sentence sent an operator at 111% to buy a bigger box for
 * something an environment variable solves.
 *
 * A capability built, measured, documented and pointed at by
 * nothing is the mistake this codebase keeps making — it is
 * `RotationEntry.loop` again, in the advice this time. [D-13]
 */

import { describe, expect, it } from 'vitest';

import {
  COMFORTABLE, enginesNeeded, engineNote, paceSays, reachSays,
} from '../../src/domain/pace.js';

describe('how many engines it would take', () => {
  /*
   * THE MEASURED CASE. 111% on one engine: one more engine puts
   * each of them near 55%, which is inside `COMFORTABLE`.
   */
  it('answers the installation that reported 111%', () => {
    expect(enginesNeeded(1.11, 1)).toBe(2);
  });

  it('and scales with how far behind it is', () => {
    /* The 2.36 measured on seventeen channels. */
    expect(enginesNeeded(2.36, 1)).toBe(4);
    expect(enginesNeeded(0.66, 1)).toBe(1);
  });

  /*
   * NEVER FEWER THAN ARE ALREADY RUNNING. This answers "how many
   * would it take", and telling an installation running three to
   * run two would take a third of its channels off the air — an
   * engine that stops is not replaced by its neighbours. [shard.ts]
   */
  it('never advises removing an engine', () => {
    expect(enginesNeeded(0.1, 3)).toBe(3);
    expect(enginesNeeded(null, 4)).toBe(4);
    expect(enginesNeeded(0.9, 3)).toBe(4);
  });

  it('and counts from the engines there are, not from one', () => {
    /* Three engines at 1.2 each is 3.6 engines' worth of work. */
    expect(enginesNeeded(1.2, 3)).toBe(Math.ceil((3 * 1.2) / COMFORTABLE));
  });

  it('says nothing silly about a load that is not a number', () => {
    for (const bad of [null, Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      const answer = enginesNeeded(bad as number | null, 2);
      expect(Number.isInteger(answer), String(bad)).toBe(true);
      expect(answer, String(bad)).toBeGreaterThanOrEqual(2);
    }
  });

  it('and treats a nonsense shard count as one engine', () => {
    expect(enginesNeeded(1.11, 0)).toBe(2);
    expect(enginesNeeded(1.11, Number.NaN)).toBe(2);
  });
});

describe('what the operator is told when the engine is behind', () => {
  /*
   * THE REMEDY THE PRODUCT HAS, NAMED, FIRST, AND WITH THE NUMBER
   * TO TYPE. "Scale out" is not actionable; `PLAYOUT_SHARDS=2` is.
   */
  it('names the split, with the setting and the count', () => {
    const says = paceSays('behind', 1.11, 1);
    expect(says).toContain('111% of real time');
    expect(says).toMatch(/2 playout services/);
    expect(says).toMatch(/PLAYOUT_SHARDS=2/);
    /* And still says what it costs the viewer, which is what makes
       anybody act on it at all. [D-21] */
    expect(says).toMatch(/arriving late/);
  });

  it('and still offers the other three', () => {
    const says = paceSays('behind', 1.11, 1);
    expect(says).toMatch(/fewer channels/);
    expect(says).toMatch(/simpler source/);
    expect(says).toMatch(/bigger box/);
  });

  /*
   * AND SAYS "UP FROM" WHEN THERE ARE ALREADY SEVERAL, so an
   * operator running three is not left wondering whether the
   * advice has noticed.
   */
  it('counts from the engines already running', () => {
    const says = paceSays('behind', 1.2, 3);
    expect(says).toMatch(/PLAYOUT_SHARDS=6, up from 3/);
  });

  /*
   * AND DOES NOT INVENT A NUMBER IT HAS NOT MEASURED. With no
   * load there is no arithmetic, and *"split the channels across
   * 1 playout services"* is the kind of sentence that teaches an
   * operator to stop reading the control room. The other three
   * remedies still stand, because they do not need a measurement.
   *
   * Written first as a test that eight engines at 100% need no
   * more, which is false: eight engines each at their own limit
   * need twelve. The arithmetic was right and the test was wrong.
   */
  it('does not advise a split it has not measured', () => {
    const says = paceSays('behind', null, 1);
    expect(says).not.toMatch(/PLAYOUT_SHARDS/);
    expect(says).not.toMatch(/% of real time/);
    expect(says).toMatch(/bigger box/);
  });

  /*
   * AND IT IS ALWAYS WORTH SPLITTING WHEN IT IS BEHIND, which is
   * the arithmetic rather than an opinion: `pacing` only says
   * `behind` at a load of 1 or more, and one engine at its limit
   * is always more than `COMFORTABLE`. The line the advice used to
   * carry — "this is not a matter of rearranging" — could not have
   * been right for any installation.
   */
  it('always has a split to offer once it is behind, at any scale', () => {
    for (const shards of [1, 2, 8, 17]) {
      const says = paceSays('behind', 1.0, shards);
      expect(says, `${shards} engines`).toMatch(/PLAYOUT_SHARDS=/);
    }
  });
});

describe('a starving channel on an engine that is also behind', () => {
  const what = { roundTripMs: 20_000, leadMs: 8_000 };

  /*
   * THE LINE THAT WAS WRONG. It said "this is not a matter of
   * rearranging", which is the opposite of true: load is the work
   * of the channels an engine was given.
   */
  it('is no longer told that rearranging will not help', () => {
    const says = reachSays('starving', what, true);
    expect(says).not.toMatch(/not a matter of rearranging/);
  });

  it('and is pointed at another playout service', () => {
    const says = reachSays('starving', what, true);
    expect(says).toMatch(/playout service/);
    /* The other remedies stay — they are real, just not first. */
    expect(says).toMatch(/bigger box/);
  });

  /*
   * AND THE OTHER BRANCH IS UNTOUCHED. A starving channel on an
   * engine with capacity to spare has always been told the right
   * thing, and the two cases needing opposite answers is why this
   * argument exists at all.
   */
  it('while an engine with capacity still hears the original', () => {
    const says = reachSays('starving', what, false);
    expect(says).toMatch(/The engine is not slow/);
    expect(says).toMatch(/second playout service/);
  });
});

describe('the sentence the control room actually shows', () => {
  /*
   * THE HEARTBEAT ALREADY CARRIES `shards`, so the advice knows
   * how many engines there are without anybody plumbing it. A
   * capability reached by nothing is the fault above; this is the
   * check that it is reached.
   */
  it('takes the engine count from the heartbeat', () => {
    const says = engineNote({ pacing: 'behind', load: 1.2, shards: 3 });
    expect(says).toMatch(/up from 3/);
  });

  it('and assumes one engine when the heartbeat predates the field', () => {
    const says = engineNote({ pacing: 'behind', load: 1.11 });
    expect(says).toMatch(/PLAYOUT_SHARDS=2/);
    expect(says).not.toMatch(/up from/);
  });

  /* Silence stays silence: a healthy engine says nothing. [D-04] */
  it('still says nothing when it is keeping up', () => {
    expect(engineNote({ pacing: 'easy', load: 0.2, shards: 1 })).toBeNull();
  });
});
