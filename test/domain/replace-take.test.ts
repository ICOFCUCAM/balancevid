/**
 * "Replace" — the one row of the take menu that could not mean what
 * it looks like.  [TIMELINE B1a; §4, D-23, U-25]
 *
 * The brief puts it between *Adjust timing* and *Rename*, and the
 * record has argued since §4 that swapping the file under a take is
 * not something this product can honestly do: a take IS a recording,
 * and the document holds five measured facts ABOUT that recording —
 * its offset, its rate ratio, its colour reading, its sound reading
 * and the plate its matte is cut against. Change the file and all
 * five describe something else, silently.
 *
 * What an author actually wants when they reach for it is this: the
 * beach take is better, put it wherever this one is on screen. By
 * hand that is one press per scene, and the scene they forget is the
 * one that ships.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Ask } from '../../app/Confirm.js';
import type { MenuItem } from '../../app/Menu.js';
import { takeMenuItems, type TakeMenuHost } from '../../app/p/[id]/takeMenu.js';
import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import {
  PerformanceEditError, addTake, newPerformance, replaceTake, setScene,
  trimTake,
} from '../../src/domain/performanceEdit.js';
import { secondsToSamples } from '../../src/domain/time.js';

const SONG = secondsToSamples(240);
const AT = '2026-09-30T00:00:00.000Z';
const s = (seconds: number) => secondsToSamples(seconds);

function master(): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId, title: 'The Ancient of Days',
    class: 'own', durationSamples: SONG,
  };
}

function take(id: string, over: Partial<PerformanceTake> = {}): PerformanceTake {
  return {
    id: id as TakeId, assetId: `asset_${id}` as AssetId, label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG, hasAudio: true, createdAt: AT, ...over,
  };
}

function performance(): Performance {
  const p = newPerformance('A Performance', master(), AT);
  addTake(p, take('take_living'));
  addTake(p, take('take_beach'));
  addTake(p, take('take_stage'));
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_living'] });
  setScene(p, s(120), { layoutId: 'performance_full', takeIds: ['take_beach'] });
  setScene(p, s(180), { layoutId: 'performance_full', takeIds: ['take_living'] });
  return p;
}

const usedBy = (p: Performance) =>
  p.scenes.map((scene) => `${scene.fromSample}:${scene.takeIds.join(',')}`).sort();

describe('showing a different take everywhere this one is', () => {
  it('swaps every scene it is on, and no others', () => {
    const p = performance();
    replaceTake(p, 'take_living', 'take_stage');
    expect(usedBy(p)).toEqual([
      `${0}:take_stage`,
      `${s(120)}:take_beach`,
      `${s(180)}:take_stage`,
    ].sort());
  });

  /* NOTHING IS DELETED, which is what makes this safe to offer as a
     single press: doing it the other way round puts it back. */
  it('leaves the old take in the rail', () => {
    const p = performance();
    replaceTake(p, 'take_living', 'take_stage');
    expect(p.takes.map((one) => one.id)).toContain('take_living');
    replaceTake(p, 'take_stage', 'take_living');
    expect(usedBy(p)).toEqual(usedBy(performance()));
  });

  /*
   * REFUSED WHEN THE REPLACEMENT DOES NOT REACH. A swap that leaves a
   * scene with a take that runs out halfway has moved the fault
   * rather than fixed it, and the author would find out at the
   * export. [INV-03]
   */
  it('refuses a take that does not reach across every scene', () => {
    const p = performance();
    /* Reaches the first scene, not the one at 03:00. */
    trimTake(p, 'take_stage', 0, s(150));
    expect(() => replaceTake(p, 'take_living', 'take_stage'))
      .toThrow(PerformanceEditError);
    expect(() => replaceTake(p, 'take_living', 'take_stage'))
      .toThrow(/no picture across the scene at 03:00.000/);
    /* And it changed nothing on its way to refusing. */
    expect(usedBy(p)).toEqual(usedBy(performance()));
  });

  it('refuses a take that is not on screen anywhere', () => {
    const p = performance();
    expect(() => replaceTake(p, 'take_stage', 'take_beach'))
      .toThrow(/not on screen anywhere/);
  });

  it('refuses swapping a take for itself, and one that does not exist', () => {
    const p = performance();
    expect(() => replaceTake(p, 'take_living', 'take_living'))
      .toThrow(/the same take/);
    expect(() => replaceTake(p, 'take_living', 'take_nothing'))
      .toThrow(PerformanceEditError);
  });

  /* A scene showing two performers keeps the other one. */
  it('replaces only its own place in a scene that shows two', () => {
    const p = performance();
    setScene(p, s(60), {
      layoutId: 'performance_half', takeIds: ['take_living', 'take_beach'],
    });
    replaceTake(p, 'take_living', 'take_stage');
    const pair = p.scenes.find((one) => one.fromSample === s(60));
    expect(pair?.takeIds).toEqual(['take_stage', 'take_beach']);
  });
});

describe('the row it is offered by', () => {
  function host(p = performance()): {
    host: TakeMenuHost; sent: Record<string, unknown>[]; asked: Ask[];
  } {
    const sent: Record<string, unknown>[] = [];
    const asked: Ask[] = [];
    return {
      sent,
      asked,
      host: {
        performance: p,
        patch: (body) => { sent.push(body); },
        confirm: (ask) => { asked.push(ask); },
        at: () => 0,
        place: () => undefined,
        keyOf: () => 1,
        solo: null,
        onSolo: () => undefined,
      },
    };
  }
  const items = (p?: Performance, id = 'take_living') => {
    const built = host(p);
    const one = built.host.performance.takes.find((t) => t.id === id)!;
    return takeMenuItems(one, built.host)
      .filter((item): item is MenuItem => Boolean(item));
  };
  const entry = (label: string, p?: Performance, id?: string) => {
    const found = items(p, id).find((item) => item.label === label);
    expect(found, label).toBeTruthy();
    return found as MenuItem;
  };

  it('offers every other take, and not this one', () => {
    const labels = items().map((item) => item.label);
    expect(labels).toContain('Replace with take_beach');
    expect(labels).toContain('Replace with take_stage');
    expect(labels).not.toContain('Replace with take_living');
  });

  /* Footage is not a performance of the song, and offering it here
     would be offering to put waves where somebody was singing. [§5] */
  it('does not offer footage', () => {
    const p = performance();
    addTake(p, take('take_waves', {
      kind: 'footage', hasAudio: false,
      alignment: { offsetSamples: 0, rateRatio: 1, method: 'unplaced' },
    } as Partial<PerformanceTake>));
    expect(items(p).map((item) => item.label))
      .not.toContain('Replace with take_waves');
  });

  it('says how many scenes it changes, and asks before changing them', () => {
    const row = entry('Replace with take_stage');
    expect(row.hint).toBe(
      '2 scene(s) cut from take_living would show take_stage instead');
    const built = host();
    const one = built.host.performance.takes.find((t) => t.id === 'take_living')!;
    const found = takeMenuItems(one, built.host)
      .find((item) => item && item.label === 'Replace with take_stage')!;
    (found as MenuItem).onSelect?.();
    expect(built.sent).toEqual([]);
    expect(built.asked[0]?.question).toMatch(/2 scene\(s\)/);
    expect(built.asked[0]?.question).toMatch(/stays in the rail/);
    built.asked[0]!.go?.('');
    expect(built.sent).toEqual([{
      action: 'replace-take', takeId: 'take_living', withTakeId: 'take_stage',
    }]);
  });

  /* Greyed with the reason, never hidden: the menu's own convention
     for a row that cannot be pressed here. [U-04] */
  it('is greyed when the replacement does not reach', () => {
    const p = performance();
    trimTake(p, 'take_stage', 0, s(150));
    expect(entry('Replace with take_stage', p).disabled)
      .toBe('take_stage does not reach across all of them');
  });

  it('is greyed when the take is not on screen', () => {
    expect(entry('Replace with take_living', undefined, 'take_stage').disabled)
      .toBe('it is not on screen anywhere');
  });

  /* Behind "More": it changes several scenes at once. [B9] */
  it('is behind one press', () => {
    expect(entry('Replace with take_stage').advanced).toBe(true);
  });

  /*
   * AND IT SENDS SOMETHING THE API HAS. The song's menu once shipped
   * a row that sent an action the route had no case for.
   */
  it('sends an action the API actually has', () => {
    const route = readFileSync(
      join(import.meta.dirname, '..', '..',
        'app', 'api', 'performances', '[id]', 'route.ts'), 'utf8');
    expect(route).toContain("case 'replace-take':");
    expect(route).toContain("replaceTake(draft, body['takeId'], body['withTakeId'])");
  });
});
