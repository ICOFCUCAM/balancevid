/**
 * Taking the shake out of a take.
 * [MASTER-EDIT §5, §6, §8, §12 P2; Doctrine STUDIO-TWO §4, U-18, INV-02, INV-16]
 *
 * WHAT IS PROVED HERE:
 *
 *   the rows are rows, named for what the take looks like;
 *   a stabilised take and a replaced background are refused TOGETHER, from
 *   BOTH SIDES, so the order the author pressed things in cannot decide
 *   whether the render comes out torn;
 *   the plan carries the transforms only while the field is set, so a take
 *   that was stabilised and is not any more renders as it was shot rather
 *   than quietly picking up a stale file next to it.
 *
 * `test/render/stabilize.test.ts` proves the part no arithmetic can: that
 * the picture actually comes out steadier, and that the frame count did not
 * move while it happened.
 */
import { describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import type { RoomPlate } from '../../src/domain/environment.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import {
  NO_STABILIZER, STABILIZERS, isStabilizer, stabilizerFor, transformArgs,
} from '../../src/domain/stabilize.js';
import {
  PerformanceEditError, addPlate, addTake, newPerformance, setEnvironment,
  setScene, setStabilize,
} from '../../src/domain/performanceEdit.js';
import { secondsToSamples } from '../../src/domain/time.js';

const AT = '2026-09-29T12:00:00.000Z';
const SONG = secondsToSamples(240);

function master(): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId,
    title: 'The Long Way Round', artist: 'The Author',
    class: 'own', durationSamples: SONG,
  };
}

function take(id: string, over: Partial<PerformanceTake> = {}): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: `asset_${id}` as AssetId,
    label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    hasAudio: true,
    createdAt: AT,
    ...over,
  };
}

function plate(): RoomPlate {
  return {
    assetId: 'plate_room' as AssetId,
    noise: 0.01, quality: 0.9, width: 640, height: 360,
    capturedAt: AT,
  };
}

function one(over: Partial<PerformanceTake> = {}): Performance {
  const p = newPerformance('My Performance', master(), AT);
  addTake(p, take('take_1', over));
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_1'] });
  return p;
}

describe('the rows', () => {
  it('are few, and named for what the take looks like', () => {
    const rows = Object.values(STABILIZERS);
    expect(rows.length).toBeLessThanOrEqual(3);
    for (const row of rows) {
      expect(row.hint.length, row.id).toBeGreaterThan(20);
      /* A hint naming a filter parameter is a number wearing a label. */
      expect(row.hint, row.id).not.toMatch(/smoothing|shakiness|optzoom|vidstab/);
    }
  });

  /*
   * THE ONE NUMBER THAT MATTERS, and it has to differ or the two rows are
   * one row with two names.
   */
  it('smooth over different lengths of time', () => {
    expect(STABILIZERS['strong']!.smoothing)
      .toBeGreaterThan(STABILIZERS['gentle']!.smoothing * 2);
  });

  it('resolves by id and answers nothing for none', () => {
    expect(stabilizerFor('gentle')).toBe(STABILIZERS['gentle']);
    expect(stabilizerFor(NO_STABILIZER)).toBeUndefined();
    expect(stabilizerFor(undefined)).toBeUndefined();
    expect(stabilizerFor('nonsense')).toBeUndefined();
    expect(isStabilizer('strong')).toBe(true);
    expect(isStabilizer('nonsense')).toBe(false);
  });

  /*
   * `optzoom=1` IS THE ANSWER TO THE BLACK EDGES. Undoing a shake uncovers
   * the edge of the sensor; the options are to let a black tear show along
   * one side, moving every frame, or to zoom in far enough to hide it.
   * Worked out from the transforms actually measured, so a steady take is
   * barely cropped.
   */
  it('always asks for the zoom that hides the uncovered edge', () => {
    for (const row of Object.values(STABILIZERS)) {
      expect(transformArgs(row, '/tmp/x.trf')).toContain('optzoom=1');
    }
  });
});

describe('a stabilised take and a replaced background', () => {
  /*
   * REFUSED FROM BOTH SIDES, and that is the whole point of these two
   * tests. Either refusal alone would leave the ORDER THE AUTHOR HAPPENED
   * TO PRESS THINGS IN deciding whether the render comes out torn — a rule
   * that works when you test it and fails for somebody who did it the
   * other way round.
   */
  it('refuses the stabiliser on a take that is already in a space', () => {
    const p = one({ plateAssetId: 'plate_room' as AssetId });
    addPlate(p, plate());
    setEnvironment(p, 'take_1', { kind: 'space', spaceId: 'church' });
    expect(() => setStabilize(p, 'take_1', 'gentle'))
      .toThrow(/replaced background/);
    expect(p.takes[0]!.stabilize).toBeUndefined();
  });

  it('refuses a space on a take that is already stabilised', () => {
    const p = one({ plateAssetId: 'plate_room' as AssetId });
    addPlate(p, plate());
    setStabilize(p, 'take_1', 'gentle');
    expect(() => setEnvironment(p, 'take_1', { kind: 'space', spaceId: 'church' }))
      .toThrow(/stabilised/);
    expect(p.takes[0]!.environment.kind).toBe('original');
  });

  /* And turning the stabiliser off makes the space available again. */
  it('lets the space back in once the stabiliser is off', () => {
    const p = one({ plateAssetId: 'plate_room' as AssetId });
    addPlate(p, plate());
    setStabilize(p, 'take_1', 'gentle');
    setStabilize(p, 'take_1', null);
    expect(() => setEnvironment(p, 'take_1', { kind: 'space', spaceId: 'church' }))
      .not.toThrow();
  });

  /*
   * BLUR IS AN ENVIRONMENT AND DOES NOT NEED A MATTE — it is a statement
   * about the room rather than a replacement of it. Refusing it here would
   * be the rule over-reaching.
   */
  it('does not refuse an environment that needs no matte', () => {
    const p = one();
    setStabilize(p, 'take_1', 'gentle');
    expect(() => setEnvironment(p, 'take_1', { kind: 'original' })).not.toThrow();
    expect(p.takes[0]!.stabilize).toBe('gentle');
  });
});

describe('choosing a stabiliser', () => {
  it('records the row', () => {
    const p = one();
    setStabilize(p, 'take_1', 'strong');
    expect(p.takes[0]!.stabilize).toBe('strong');
  });

  it('takes it off again', () => {
    const p = one();
    setStabilize(p, 'take_1', 'strong');
    setStabilize(p, 'take_1', null);
    expect(p.takes[0]!.stabilize).toBeUndefined();
    setStabilize(p, 'take_1', 'strong');
    setStabilize(p, 'take_1', NO_STABILIZER);
    expect(p.takes[0]!.stabilize).toBeUndefined();
  });

  it('refuses a row nobody wrote', () => {
    const p = one();
    expect(() => setStabilize(p, 'take_1', 'magic')).toThrow(/unknown stabilizer/);
    expect(() => setStabilize(p, 'nope', 'gentle')).toThrow(PerformanceEditError);
  });
});

describe('what reaches the renderer', () => {
  function entryFor(build: (p: Performance) => void) {
    const p = one();
    build(p);
    const plan = buildPerformancePlan(p, { exportProfileId: 'youtube_16x9' });
    const shot = plan.shots.find((s) => s.kind !== 'transition')!;
    return (shot as { takes: { stabilize?: { transformsAssetId: string; smoothing: number } }[] })
      .takes[0]!;
  }

  it('carries which file and how much smoothing, and nothing else', () => {
    const entry = entryFor((p) => setStabilize(p, 'take_1', 'strong'));
    expect(entry.stabilize).toEqual({
      transformsAssetId: 'asset_take_1stab',
      smoothing: STABILIZERS['strong']!.smoothing,
    });
  });

  /*
   * THE FILE OUTLIVES THE DECISION, so the plan must not. A take that was
   * stabilised and is not any more has a transforms file sitting beside it;
   * if the plan carried it regardless, turning the stabiliser off would
   * change nothing and the author would conclude the control is broken.
   */
  it('carries nothing once the stabiliser is off, though the file remains', () => {
    expect(entryFor((p) => {
      setStabilize(p, 'take_1', 'gentle');
      setStabilize(p, 'take_1', null);
    }).stabilize).toBeUndefined();
    expect(entryFor(() => undefined).stabilize).toBeUndefined();
  });

  /*
   * AND THE PLAN CHANGES WHEN THE ROW DOES, or the shot cache serves the
   * old render for the new setting. [U-16]
   */
  it('makes a different plan for a different row', () => {
    const gentle = JSON.stringify(entryFor((p) => setStabilize(p, 'take_1', 'gentle')));
    const strong = JSON.stringify(entryFor((p) => setStabilize(p, 'take_1', 'strong')));
    expect(strong).not.toBe(gentle);
  });
});
