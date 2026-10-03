/**
 * What each camera on this machine is doing.  [D-19, U-19; T-3]
 *
 * > *"Read `guestGrid.ts` and `SwitchingStage.tsx` first. Two
 * > multiviews exist and a third should not be invented."*
 *
 * Both were read. The words are `guestGrid`'s, and the last
 * describe in this file is what makes that a checked claim rather
 * than a resemblance.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type SourceFeed, formatSays, livePictures, readSources,
} from '../../shared/src/sourceGrid.js';

const ROOT = join(import.meta.dirname, '..', '..');

const cam = (id: string, how: Partial<SourceFeed> = {}): SourceFeed => ({
  id, kind: 'camera', hasVideo: true, hasAudio: true, ...how,
});

describe('one tile per source (T-3)', () => {
  it('reads a camera that is delivering', () => {
    const [one] = readSources([cam('a', {
      label: 'Front', width: 1920, height: 1080, frameRate: 30, energy: 0.4,
    })]);
    expect(one).toMatchObject({
      slot: 1, id: 'a', label: 'Front', kind: 'camera',
      eye: 'live', mic: 'open', health: 'live', says: '',
    });
    expect(one!.format).toBe('1920×1080 · 30 fps');
    expect(one!.energy).toBeCloseTo(0.4);
  });

  /*
   * A TILE THAT IS FINE SAYS NOTHING. Four tiles each shouting
   * LIVE is four tiles saying nothing, which is `guestGrid`'s
   * rule and the reason `says` is empty above.
   */
  it('says nothing over a picture that is the answer', () => {
    expect(readSources([cam('a', { width: 1280, height: 720 })])[0]!.says)
      .toBe('');
  });

  /*
   * AND A SOURCE THAT IS OPEN WITH NOTHING ARRIVING IS NOT LIVE.
   * `guestGrid`'s own rule — "a monitor that read LIVE while
   * showing black would be the one thing a multi-view must never
   * do" — and here it is the commonest real fault: a capture card
   * with no cable opens perfectly and delivers black for ever.
   */
  it('refuses to call a dark source live', () => {
    const [one] = readSources([cam('a', { videoDark: true })]);
    expect(one!.eye).toBe('dark');
    /*
     * UNSTABLE, NOT LOST, AND THE DIFFERENCE IS WHAT THE
     * OPERATOR DOES NEXT. A camera still delivering sound has
     * not gone away — a lens cap, a sleeping capture card, a
     * cable half out — and it usually comes back. One with
     * neither picture nor sound is gone, and the next move is to
     * find out why. `not.toBe('live')` passed for both and let a
     * mutation through.
     */
    expect(one!.health).toBe('unstable');
    expect(one!.says).toBe('NO PICTURE');
  });

  it('reads a source with neither picture nor sound as gone', () => {
    expect(readSources([cam('a', {
      videoDark: true, hasAudio: false,
    })])[0]!.health).toBe('lost');
  });

  it('reads a device being opened', () => {
    const [one] = readSources([cam('a', { opening: true, hasVideo: false })]);
    expect(one!.health).toBe('connecting');
    expect(one!.says).toBe('OPENING');
  });

  /*
   * REFUSED IS OVER. A camera another application has taken does
   * not recover by being looked at again, and the operator's next
   * move is to close that application — a different job from
   * waiting.
   */
  it('reads a device that would not open as lost', () => {
    const [one] = readSources([cam('a', {
      refused: 'in use', hasVideo: false, hasAudio: false,
    })]);
    expect(one!.health).toBe('lost');
    expect(one!.says).toBe('NO SIGNAL');
  });

  /*
   * SILENCE IS NOT A FAULT WORTH A LABEL OVER THE PICTURE. One
   * microphone in a room and four cameras is the usual
   * arrangement.
   */
  it('does not label a camera with no microphone as broken', () => {
    const [one] = readSources([cam('a', {
      hasAudio: false, width: 1920, height: 1080,
    })]);
    expect(one!.mic).toBe('none');
    expect(one!.health).toBe('live');
    expect(one!.says).toBe('');
    expect(one!.energy).toBe(0);
  });

  it('meters nothing through a muted microphone', () => {
    expect(readSources([cam('a', { audioDark: true, energy: 0.9 })])[0]!)
      .toMatchObject({ mic: 'muted', energy: 0 });
  });

  it('holds the meter between zero and one', () => {
    expect(readSources([cam('a', { energy: 4 })])[0]!.energy).toBe(1);
    expect(readSources([cam('a', { energy: -2 })])[0]!.energy).toBe(0);
  });

  /*
   * NO FORMAT WHILE THERE IS NO PICTURE. A track that has stopped
   * delivering still reports the size it last negotiated, and a
   * tile reading `1920×1080` over a black rectangle is the tile
   * lying in a second way.
   */
  it('shows no format for a source showing nothing', () => {
    expect(readSources([cam('a', {
      videoDark: true, width: 1920, height: 1080, frameRate: 30,
    })])[0]!.format).toBe('');
  });

  it('rounds a frame rate a camera reports awkwardly', () => {
    expect(formatSays({ id: 'a', kind: 'camera', hasVideo: true,
      hasAudio: false, width: 1920, height: 1080, frameRate: 29.97 }))
      .toBe('1920×1080 · 30 fps');
  });

  it('says the size alone when the rate is unknown', () => {
    expect(formatSays({ id: 'a', kind: 'camera', hasVideo: true,
      hasAudio: false, width: 640, height: 480 })).toBe('640×480');
    expect(formatSays({ id: 'a', kind: 'camera', hasVideo: true,
      hasAudio: false })).toBe('');
  });
});

describe('the grid does not move under the operator (T-3)', () => {
  /*
   * `guestGrid` fixes four because the Room's tile IS four
   * quarters. A capture station has as many cameras as somebody
   * plugged in — but the REASON for the fixed count carries: "a
   * grid that changed shape when a guest dropped would be a grid
   * that moves under the operator's hand at the worst possible
   * moment."
   */
  it('is as wide as the operator asked for, not as wide as what works', () => {
    const feeds = [cam('a'), cam('b', { refused: 'in use', hasVideo: false })];
    const read = readSources(feeds, 4);
    expect(read.length).toBe(4);
    expect(read.map((one) => one.slot)).toEqual([1, 2, 3, 4]);
    /* The failed camera keeps its tile and says so. */
    expect(read[1]!.says).toBe('NO SIGNAL');
    /* And an empty slot reads as empty rather than closing up. */
    expect(read[3]).toMatchObject({ id: null, health: 'empty', says: 'NO SOURCE' });
  });

  it('is as wide as the sources when nobody said otherwise', () => {
    expect(readSources([cam('a'), cam('b')]).length).toBe(2);
    expect(readSources([]).length).toBe(0);
  });

  it('never answers a negative width', () => {
    expect(readSources([cam('a')], -3)).toEqual([]);
  });

  it('counts what is actually delivering a picture', () => {
    expect(livePictures(readSources([
      cam('a'), cam('b', { videoDark: true }), cam('c'),
      cam('d', { refused: 'x', hasVideo: false }),
    ]))).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 *  No third vocabulary.
 * ------------------------------------------------------------------ */

describe('the words are the ones the room already uses (T-3)', () => {
  /*
   * THIS IS WHAT MAKES "NO THIRD MULTIVIEW" A CHECKED CLAIM.
   *
   * The desktop grid cannot share `guestGrid`'s function — it
   * reads an `RTCPeerConnectionState` and asks the Room's own
   * thresholds about speech, and there is no peer here and no
   * Room. What it CAN share, and what drifts silently if nobody
   * looks, is the words: if one grid starts saying `black` where
   * the other says `dark`, the product has two vocabularies for
   * one question and the second person to read them has to learn
   * both.
   */
  const union = (file: string, name: string): string[] => {
    const body = readFileSync(join(ROOT, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const found = new RegExp(`export type ${name} =([^;]+);`).exec(body);
    expect(found, `${name} in ${file}`).not.toBe(null);
    return [...found![1]!.matchAll(/'([a-z]+)'/g)]
      .map((hit) => hit[1]!).sort();
  };

  for (const name of ['Mic', 'Eye', 'Health']) {
    it(`says ${name} the same way in both grids`, () => {
      expect(union('shared/src/sourceGrid.ts', name))
        .toEqual(union('src/domain/guestGrid.ts', name));
    });
  }
});
