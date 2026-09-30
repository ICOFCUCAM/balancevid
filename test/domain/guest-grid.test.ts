/**
 * Four guests in one tile, and the reading behind each quarter.
 *   [CHANNEL §24, §29, C-14; ROOM §4; D-19]
 *
 * *"Each guest tile should show: video, microphone state, connection
 * state, small audio meter, speaking indicator, LIVE/selected tally when
 * applicable, NO VIDEO when camera is unavailable."*
 *
 * The grid is drawn from this function and from nothing else, so every
 * claim the operator reads off a quarter is a claim tested here. The two
 * that matter most are the ones a multi-view must never get wrong: a
 * monitor that says LIVE while showing black, and a tally that claims the
 * air while nothing is going out.
 */

import { describe, expect, it } from 'vitest';

import {
  type GuestFeed, GUEST_SLOTS, guestCount, readGuests,
} from '../../src/domain/guestGrid.js';
import { DEFAULT_POLICY } from '../../src/domain/stage.js';

/** A guest with everything working, so each test changes one thing. */
function well(over: Partial<GuestFeed> = {}): GuestFeed {
  return {
    id: 'g1', label: 'Sarah', link: 'connected',
    hasVideo: true, hasAudio: true, energy: 0, speech: 0,
    ...over,
  };
}

describe('the grid is always four', () => {
  it('reads four quarters from nobody', () => {
    const grid = readGuests([]);
    expect(grid).toHaveLength(GUEST_SLOTS);
    expect(grid.map((one) => one.slot)).toEqual([1, 2, 3, 4]);
    expect(grid.every((one) => one.health === 'empty')).toBe(true);
    expect(grid.map((one) => one.label))
      .toEqual(['Guest 1', 'Guest 2', 'Guest 3', 'Guest 4']);
    expect(grid.every((one) => one.says === 'NO GUEST')).toBe(true);
    expect(grid.every((one) => one.id === null)).toBe(true);
  });

  it('reads four quarters from one guest', () => {
    const grid = readGuests([well()]);
    expect(grid).toHaveLength(GUEST_SLOTS);
    expect(grid[0]!.label).toBe('Sarah');
    expect(grid[1]!.health).toBe('empty');
  });

  it('keeps the Room’s order and shows the first four', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f']
      .map((id) => well({ id, label: id.toUpperCase() }));
    const grid = readGuests(many);
    expect(grid).toHaveLength(GUEST_SLOTS);
    expect(grid.map((one) => one.id)).toEqual(['a', 'b', 'c', 'd']);
    /* The fifth and sixth are staged, mixed and audible — not monitored. */
    expect(guestCount(many)).toBe('4 of 6');
    expect(guestCount(many.slice(0, 3))).toBe('3');
    expect(guestCount(many.slice(0, 4))).toBe('4');
  });
});

describe('the connection state', () => {
  const cases: [GuestFeed['link'], string][] = [
    ['connected', 'live'],
    ['connecting', 'connecting'],
    ['new', 'connecting'],
    ['disconnected', 'unstable'],
    ['failed', 'lost'],
    ['closed', 'lost'],
  ];
  for (const [link, health] of cases) {
    it(`reads ${link} as ${health}`, () => {
      expect(readGuests([well({ link })])[0]!.health).toBe(health);
    });
  }

  it('treats no link at all as the picture’s business', () => {
    /* The host's own camera has no peer connection and never will. */
    const grid = readGuests([{
      id: 'me', label: 'You', hasVideo: true, hasAudio: true,
    }]);
    expect(grid[0]!.health).toBe('live');
  });

  it('never says LIVE while nothing is arriving', () => {
    /* A connected link with no tracks is the one lie a multi-view
       must not tell. */
    const grid = readGuests([
      well({ hasVideo: false, hasAudio: false })]);
    expect(grid[0]!.health).toBe('unstable');
    expect(grid[0]!.says).toBe('NO VIDEO');
  });
});

describe('what the quarter says', () => {
  it('says nothing when the picture is the answer', () => {
    expect(readGuests([well()])[0]!.says).toBe('');
  });

  it('says NO VIDEO for a camera that is off', () => {
    expect(readGuests([well({ hasVideo: false })])[0]!.says).toBe('NO VIDEO');
    expect(readGuests([well({ videoDark: true })])[0]!.says).toBe('NO VIDEO');
    expect(readGuests([well({ videoDark: true })])[0]!.eye).toBe('dark');
    expect(readGuests([well({ hasVideo: false })])[0]!.eye).toBe('none');
  });

  it('says the worst thing, not every thing', () => {
    /* A failed link also has no picture. Two labels for one fault is
       two jobs for an operator who has one. */
    const lost = readGuests([well({ link: 'failed', hasVideo: false })])[0]!;
    expect(lost.says).toBe('LOST');
    const late = readGuests([well({ link: 'connecting', hasVideo: false })])[0]!;
    expect(late.says).toBe('CONNECTING');
  });

  it('says UNSTABLE for a link that lost its path but has a picture', () => {
    expect(readGuests([well({ link: 'disconnected' })])[0]!.says)
      .toBe('UNSTABLE');
  });
});

describe('the microphone', () => {
  it('is open, muted, or absent', () => {
    expect(readGuests([well()])[0]!.mic).toBe('open');
    expect(readGuests([well({ audioDark: true })])[0]!.mic).toBe('muted');
    expect(readGuests([well({ hasAudio: false })])[0]!.mic).toBe('none');
  });

  it('meters nothing when the microphone is not open', () => {
    const loud = { energy: 0.9, speech: 0.9 };
    expect(readGuests([well({ ...loud, audioDark: true })])[0]!.energy).toBe(0);
    expect(readGuests([well({ ...loud, hasAudio: false })])[0]!.energy).toBe(0);
    expect(readGuests([well(loud)])[0]!.energy).toBeCloseTo(0.9);
  });

  it('keeps the meter inside 0..1', () => {
    expect(readGuests([well({ energy: 4 })])[0]!.energy).toBe(1);
    expect(readGuests([well({ energy: -2 })])[0]!.energy).toBe(0);
  });
});

describe('the speaking indicator uses the Room’s own thresholds', () => {
  const over = DEFAULT_POLICY.energyThreshold + 0.05;
  const under = DEFAULT_POLICY.energyThreshold - 0.02;
  const voice = DEFAULT_POLICY.confidenceThreshold + 0.05;
  const noise = DEFAULT_POLICY.confidenceThreshold - 0.05;

  it('lights for speech above the energy threshold', () => {
    expect(readGuests([well({ energy: over, speech: voice })])[0]!.speaking)
      .toBe(true);
  });

  it('does not light below the energy threshold', () => {
    expect(readGuests([well({ energy: under, speech: voice })])[0]!.speaking)
      .toBe(false);
  });

  it('does not light for a door slam', () => {
    /* Energy 0.9 and confidence near zero is the case `stage.ts` exists
       for. The multi-view must agree with the speaker switching. */
    expect(readGuests([well({ energy: 0.9, speech: noise })])[0]!.speaking)
      .toBe(false);
  });

  it('judges a person above their own room', () => {
    /* 0.17 of energy is speech in a quiet room and is the kitchen
       itself in a kitchen measured at 0.10. */
    const kitchen = { energy: over, speech: voice, noiseFloor: 0.1 };
    expect(readGuests([well(kitchen)])[0]!.speaking).toBe(false);
    expect(readGuests([well({ ...kitchen, noiseFloor: 0 })])[0]!.speaking)
      .toBe(true);
  });

  it('never lights a muted microphone, however loud the room', () => {
    expect(readGuests([
      well({ energy: 1, speech: 1, audioDark: true })])[0]!.speaking)
      .toBe(false);
    expect(readGuests([
      well({ energy: 1, speech: 1, hasAudio: false })])[0]!.speaking)
      .toBe(false);
  });

  it('does not light an empty quarter', () => {
    expect(readGuests([])[0]!.speaking).toBe(false);
  });
});

describe('the tally', () => {
  it('claims nothing while nothing is going out', () => {
    const grid = readGuests([well(), well({ id: 'g2' })]);
    expect(grid.every((one) => !one.onAir)).toBe(true);
  });

  it('puts every staged guest on air when the mix is going out', () => {
    const grid = readGuests(
      [well(), well({ id: 'g2' })], { transmitting: true });
    expect(grid[0]!.onAir).toBe(true);
    expect(grid[1]!.onAir).toBe(true);
    /* An empty quarter is never on air. */
    expect(grid[2]!.onAir).toBe(false);
  });

  it('gives the air to the soloed guest alone', () => {
    const grid = readGuests(
      [well(), well({ id: 'g2' })], { solo: 'g2', transmitting: true });
    expect(grid[0]!.onAir).toBe(false);
    expect(grid[0]!.soloed).toBe(false);
    expect(grid[1]!.onAir).toBe(true);
    expect(grid[1]!.soloed).toBe(true);
  });

  it('does not put a soloed guest on air off air', () => {
    const grid = readGuests([well()], { solo: 'g1' });
    expect(grid[0]!.soloed).toBe(true);
    expect(grid[0]!.onAir).toBe(false);
  });

  it('solos nobody when the soloed guest has left', () => {
    const grid = readGuests([well()], { solo: 'gone', transmitting: true });
    expect(grid.every((one) => !one.soloed)).toBe(true);
    /* And the air does not silently fall back to everybody: the operator
       chose one source, and the one they chose is not here. */
    expect(grid[0]!.onAir).toBe(false);
  });
});
