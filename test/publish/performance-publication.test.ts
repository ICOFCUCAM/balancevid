/**
 * A performance with an audience.  [Doctrine STUDIO-TWO §14, U-31, INV-15, D-03]
 *
 * The rules a link has to obey, tested where they are decided rather than
 * where they are drawn: what may be published, what a stranger may reach, and
 * what an unpublished performance says about itself (nothing).
 */
import { describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import {
  PerformanceEditError, newPerformance, publishPerformance, setScene,
  unpublishPerformance,
} from '../../src/domain/performanceEdit.js';
import { isPubliclyVisible, mayBePublic } from '../../src/auth/policy.js';
import { secondsToSamples } from '../../src/domain/time.js';

const SONG = secondsToSamples(20);
const AT = '2026-09-24T12:00:00.000Z';

function take(id: string): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: id as AssetId,
    label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    createdAt: AT,
  };
}

function master(over: Partial<MasterTrack> = {}): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'The Long Way Round',
    class: 'own', durationSamples: SONG, ...over,
  };
}

function performance(over: Partial<MasterTrack> = {}): Performance {
  const p = newPerformance('A Performance', master(over), AT);
  p.takes = [take('take_one')];
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  return p;
}

describe('publishing a performance', () => {
  it('records the render that was published, not the document', () => {
    const p = performance();
    publishPerformance(p, { planHash: 'abc123', publishedAt: AT });
    expect(p.publication?.planHash).toBe('abc123');
    expect(isPubliclyVisible(p)).toBe(true);
  });

  /*
   * U-31's "anyone can open it and respond to it" is about a conversation,
   * where responding is the product. There is no mechanism to answer a
   * performance with, and an option that promised one would be a lie in a
   * checkbox.
   */
  it('and never offers responses, because there is nothing to respond with', () => {
    const p = performance();
    publishPerformance(p, { planHash: 'abc123', publishedAt: AT });
    expect(p.publication?.respondable).toBe(false);
  });

  it('refuses music the author has not said they may publish (INV-15)', () => {
    const p = performance({ class: 'third_party' });
    expect(() => publishPerformance(p, { planHash: 'abc123', publishedAt: AT }))
      .toThrow(PerformanceEditError);
    expect(() => publishPerformance(p, { planHash: 'abc123', publishedAt: AT }))
      .toThrow(/private export is still yours/);
    expect(isPubliclyVisible(p)).toBe(false);
  });

  it('refuses a performance with nothing on screen', () => {
    const p = newPerformance('Empty', master(), AT);
    expect(() => publishPerformance(p, { planHash: 'abc', publishedAt: AT }))
      .toThrow(/nothing here to publish/);
  });

  it('withdrawing stops the link without unmaking the video', () => {
    const p = performance();
    publishPerformance(p, { planHash: 'abc123', publishedAt: AT });
    unpublishPerformance(p, '2026-09-25T12:00:00.000Z');
    expect(isPubliclyVisible(p)).toBe(false);
    // The record of what was published survives being withdrawn.
    expect(p.publication?.planHash).toBe('abc123');
    expect(() => unpublishPerformance(newPerformance('x', master(), AT), AT))
      .toThrow(/not published/);
  });
});

describe('what a stranger may reach (D-03)', () => {
  const id = 'perf_0123456789abcdef';

  it('the page, the picture, the video and the clips', () => {
    for (const path of [
      `/p/${id}/watch`,
      `/api/performances/${id}/card`,
      `/api/performances/${id}/renders/abc123/file`,
      `/api/performances/${id}/clips/abc123/file`,
    ]) {
      expect(mayBePublic(path, 'GET')).toBe(true);
    }
  });

  /*
   * And nothing else. The song somebody performed over, the takes' own media
   * and the document are the raw material: a published performance is a
   * finished video, and handing out the master track would be publishing the
   * record rather than the performance. [INV-15]
   */
  it('and never the song, the takes, the document or the list', () => {
    for (const path of [
      `/api/performances/${id}`,
      `/api/performances/${id}/master`,
      `/api/performances/${id}/takes/take_1/media`,
      `/api/performances/${id}/plates/asset_1/image`,
      `/api/performances/${id}/renders`,
      `/api/performances/${id}/clips`,
      '/api/performances',
      `/p/${id}`,
    ]) {
      expect(mayBePublic(path, 'GET')).toBe(false);
    }
  });

  it('and may never write anything at all', () => {
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      expect(mayBePublic(`/api/performances/${id}/publish`, method)).toBe(false);
      expect(mayBePublic(`/api/performances/${id}`, method)).toBe(false);
      expect(mayBePublic(`/api/performances/${id}/clips`, method)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  The other half of INV-15, which nothing was asking.
 *    [GO-VIRAL V-1, G7]
 * ------------------------------------------------------------------ */

describe('a master that does not say what permits it', () => {
  /*
   * `mayPublish` WAS ENFORCED HERE AND THE LICENCE NOTE WAS NOT —
   * anywhere. `assertPublishable` in `invariants.ts` has carried the
   * rule since INV-15 was written, with nine assertions over it, and
   * a search for its callers turns up that test file and nothing
   * else.
   *
   * SO THIS WAS PUBLISHABLE: a `licensed` master with no word about
   * what permits it, made `respondable: true, access: 'anyone'`, and
   * a thousand people could sing on it. A rule with a test suite and
   * no caller is worse than one with neither — it reads as live.
   */
  it('cannot be given an audience', () => {
    const p = performance({ class: 'licensed' });
    expect(() => publishPerformance(p, { planHash: 'abc123', publishedAt: AT }))
      .toThrow(PerformanceEditError);
    expect(() => publishPerformance(p, { planHash: 'abc123', publishedAt: AT }))
      .toThrow(/Name the licence/);
    expect(isPubliclyVisible(p)).toBe(false);
  });

  it('cannot be opened to anyone either, because it is the same act', () => {
    const p = performance({ class: 'open' });
    expect(() => publishPerformance(p, {
      planHash: 'abc123', publishedAt: AT,
      availability: { respondable: true, access: 'anyone' },
    })).toThrow(/Name the licence/);
    /* Nothing was written: not the publication, not the policy. */
    expect(p.publication).toBeUndefined();
  });

  /* Named, and it publishes. */
  it('publishes once the licence is named', () => {
    const p = performance({ class: 'licensed', licence: 'PRS 12345' });
    publishPerformance(p, { planHash: 'abc123', publishedAt: AT });
    expect(isPubliclyVisible(p)).toBe(true);
  });

  /* And a class that needs no note is unaffected. */
  it('leaves a master the author owns alone', () => {
    const p = performance({ class: 'own' });
    publishPerformance(p, { planHash: 'abc123', publishedAt: AT });
    expect(isPubliclyVisible(p)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 *  The call's own clock, where it is written down.  [GO-VIRAL V-1]
 * ------------------------------------------------------------------ */

describe('a published performance with a window', () => {
  const WINDOW = {
    respondable: true, access: 'anyone' as const,
    opensAt: '2026-10-01T09:00:00.000Z',
    closesAt: '2026-10-08T17:00:00.000Z',
  };

  it('keeps both ends of it', () => {
    const p = performance();
    publishPerformance(p, {
      planHash: 'abc123', publishedAt: AT, availability: WINDOW,
    });
    expect(p.publication?.opensAt).toBe(WINDOW.opensAt);
    expect(p.publication?.closesAt).toBe(WINDOW.closesAt);
  });

  /*
   * ONLY WHERE SOMETHING MAY BE SUBMITTED, which is the condition
   * `access` and `claims` already travel under: a closing time on a
   * performance nobody may take is a value that will later be read
   * as though it said something. [PART FIVE]
   */
  it('keeps neither end on a performance nobody may take', () => {
    const p = performance();
    publishPerformance(p, {
      planHash: 'abc123', publishedAt: AT,
      availability: { ...WINDOW, respondable: false },
    });
    expect(p.publication?.opensAt).toBeUndefined();
    expect(p.publication?.closesAt).toBeUndefined();
  });

  /* And a publication with no window is what every existing one is. */
  it('writes no window where none was asked for', () => {
    const p = performance();
    publishPerformance(p, {
      planHash: 'abc123', publishedAt: AT,
      availability: { respondable: true, access: 'anyone' },
    });
    expect(p.publication?.opensAt).toBeUndefined();
    expect(p.publication?.closesAt).toBeUndefined();
  });
});
