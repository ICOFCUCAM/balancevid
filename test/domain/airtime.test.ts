/**
 * Two things the author saw and nobody had measured.
 * [Doctrine CHANNEL §4, §5, §18, D-04, D-22, C-31]
 *
 * The audit listed both under *"Two inconsistencies worth verifying"*
 * and refused to diagnose either: *"Each needs one reading of
 * `/api/channels/{id}` while the state is live to settle. Neither
 * should be guessed at from a screenshot, including by me."*
 *
 * They turned out to be one fault wearing two coats. A surface was
 * showing the answer to one question beside the answer to another,
 * with nothing saying they were different questions — which is the
 * shape `controlRoomNote` exists to prevent one level down.
 */

import { describe, expect, it } from 'vitest';

import type { Channel, OnAir } from '../../src/domain/channel.js';
import { newChannel, addToRotation, goLive, takeLive }
  from '../../src/domain/channelEdit.js';
import { STEP_MS, airtime, ends, endsAt, joinable }
  from '../../src/domain/airtime.js';
import { airMeans, airSays, airState } from '../../src/domain/health.js';

const AT = '2026-10-02T09:00:00.000Z';
const NOW = Date.parse(AT);
const HOUR = 60 * 60_000;

const bare = (): Channel => newChannel('BalanceVid TV', 'UTC', AT);
const withLoop = (): Channel => {
  const channel = bare();
  addToRotation(channel, {
    source: { kind: 'media', assetId: 'ast_film', form: 'video' },
    title: 'A Film', durationMs: 30 * 60_000,
  }, AT);
  return channel;
};

describe('a quiet afternoon is one quiet afternoon (C-31)', () => {
  /*
   * THE BUG. Only a programme and a turn of the loop know when they
   * END, so the walk advanced by five minutes for everything else and
   * pushed a block each time. An empty channel drew a day of
   * five-minute items, every one of them nothing, beside a footer
   * correctly reporting that nothing was scheduled.
   */
  it('draws an empty channel as one stretch, not a run of blocks', () => {
    const drawn = airtime(bare(), NOW, NOW + 6 * HOUR);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.on.kind).toBe('off');
    expect(drawn[0]!.fromMs).toBe(NOW);
    expect(drawn[0]!.toMs).toBe(NOW + 6 * HOUR);
  });

  it('would have drawn dozens before, which is what the step is', () => {
    /* The sampling rate is still five minutes — the fix is the
       joining, not a coarser walk, because a programme starting at
       10:03 must not be drawn from 10:00. */
    expect(STEP_MS).toBe(5 * 60_000);
    expect(6 * HOUR / STEP_MS).toBeGreaterThan(70);
  });

  /*
   * AND THE LINE THAT MAKES THIS A FIX RATHER THAN A SMOOTHING. A
   * programme and a rotation entry each have an `untilMs`, so where
   * they end is a fact about the schedule. Joining those would hide
   * the loop point, which is the one thing an operator looks at a
   * rotation lane to find.
   */
  it('never joins two turns of the same loop', () => {
    const drawn = airtime(withLoop(), NOW, NOW + 3 * HOUR);
    expect(drawn.length).toBeGreaterThan(3);
    for (const stretch of drawn) {
      expect(stretch.on.kind).toBe('rotation');
      /* Each turn is its own length, not a merged blur. */
      expect(stretch.toMs - stretch.fromMs).toBeLessThanOrEqual(30 * 60_000);
    }
  });

  it('knows which answers carry their own end', () => {
    const drawn = airtime(withLoop(), NOW, NOW + HOUR);
    expect(ends(drawn[0]!.on)).toBe(true);
    expect(endsAt(drawn[0]!.on)).toBe(drawn[0]!.toMs);
    expect(ends({ kind: 'off' } as OnAir)).toBe(false);
    expect(endsAt({ kind: 'off' } as OnAir)).toBe(null);
  });

  it('joins only where neither side knows its own end', () => {
    const off = { kind: 'off' } as unknown as OnAir;
    const live = { kind: 'live', source: { kind: 'live', ingestId: 'i' } } as unknown as OnAir;
    expect(joinable(off, off)).toBe(true);
    expect(joinable(off, live)).toBe(false);
  });

  /*
   * A LIVE FEED THAT WAS COVERED AND UNCOVERED IS TWO STRETCHES.
   * `whatIsOn` answers `live` with whatever is rolled in over the
   * room (§7, C-27), so joining on the kind alone would join a film
   * to the room it covered.
   */
  /*
   * AND NOT ACROSS TWO KINDS THAT HAPPEN TO NAME ONE SOURCE. The
   * emergency cut-away and the backup can be the same file, and
   * joining them would draw one stretch over the moment an operator
   * pressed EMERGENCY — which is the moment a timeline exists to
   * show. The source key alone cannot tell them apart.
   */
  it('does not join an emergency to a backup that names the same file', () => {
    const same = { kind: 'media', assetId: 'ast_slate', form: 'image' };
    const emergency = { kind: 'emergency', source: same } as unknown as OnAir;
    const backup = { kind: 'backup', source: same } as unknown as OnAir;
    expect(joinable(emergency, backup)).toBe(false);
    expect(joinable(emergency, emergency)).toBe(true);
  });

  /*
   * EVERY STRETCH HAS WIDTH. A document with a malformed turn — one
   * whose end is not after its start — would otherwise walk on the
   * spot and draw a row of nothing, 240 times. The floor is why the
   * guard above is a backstop rather than the thing doing the work.
   */
  it('draws nothing with zero width, whatever the document says', () => {
    const broken = {
      ...withLoop(),
      rotation: [{ id: 'rot_bad', source: {
        kind: 'media', assetId: 'ast_film', form: 'video',
      }, durationMs: 0, title: 'Zero', createdAt: AT }],
    } as unknown as Channel;
    const drawn = airtime(broken, NOW, NOW + HOUR);
    for (const stretch of drawn) {
      expect(stretch.toMs, JSON.stringify(stretch))
        .toBeGreaterThan(stretch.fromMs);
    }
    expect(drawn.length).toBeLessThan(250);
  });

  it('does not join two different things that both read live', () => {
    const room = { kind: 'live',
      source: { kind: 'live', ingestId: 'ing_1' } } as unknown as OnAir;
    const film = { kind: 'live',
      source: { kind: 'media', assetId: 'ast_f', form: 'video' } } as unknown as OnAir;
    expect(joinable(room, film)).toBe(false);
    expect(joinable(room, room)).toBe(true);
  });

  it('stops at the end of the window and does not run away', () => {
    const drawn = airtime(bare(), NOW, NOW + 48 * HOUR);
    expect(drawn[drawn.length - 1]!.toMs).toBeLessThanOrEqual(NOW + 48 * HOUR);
    expect(drawn.length).toBeLessThan(250);
  });

  it('draws nothing for a window with no width', () => {
    expect(airtime(bare(), NOW, NOW)).toEqual([]);
  });
});

describe('ON AIR has to mean something (§18, D-04, C-31)', () => {
  /*
   * THE OTHER HALF OF THE AUTHOR'S OBSERVATION: *"'ON AIR' and
   * 'Nothing currently on air' in the same card."* Both were true.
   * `transmitting` asks the transmitter; `showing` asks the
   * schedule; and an off-air channel with the engine running
   * satisfies the first and not the second, because segment.ts keeps
   * writing black so that players do not treat the gap as the end of
   * the stream.
   */
  it('does not call a channel with nothing on it ON AIR', () => {
    expect(airState('transmitting', false)).toBe('blank');
    expect(airSays('blank')).not.toBe('ON AIR');
    expect(airSays('blank')).toContain('BLANK');
  });

  it('still calls a channel with something on it ON AIR', () => {
    expect(airState('transmitting', true)).toBe('on');
    expect(airSays('on')).toBe('ON AIR');
  });

  /* The fault worth a red lamp: something is due and nothing is
     arriving. That one has always been reported and stays. */
  it('keeps the fault the badge already had', () => {
    expect(airState('stalled', true)).toBe('due');
    expect(airState('silent', true)).toBe('due');
    expect(airMeans('due')).toContain('NOT TRANSMITTING');
  });

  it('calls a channel with neither off air', () => {
    expect(airState('silent', false)).toBe('off');
    expect(airSays('off')).toBe('OFF AIR');
  });

  /*
   * BLANK IS NOT OFF, and the distinction is the point: a channel
   * putting black out is on the air with nothing on it, and an
   * operator who cannot tell that from a dead encoder cannot tell a
   * quiet afternoon from a fault.
   */
  it('separates a quiet channel from a dead one', () => {
    expect(airState('transmitting', false))
      .not.toBe(airState('silent', false));
    expect(airMeans('blank')).not.toBe(airMeans('off'));
    expect(airMeans('blank')).toContain('NOTHING SCHEDULED');
  });

  it('says something for every state', () => {
    for (const state of ['on', 'blank', 'due', 'off'] as const) {
      expect(airSays(state).length, state).toBeGreaterThan(3);
      expect(airMeans(state).length, state).toBeGreaterThan(3);
    }
  });
});

describe('the two agree on a live channel (C-31)', () => {
  it('reads ON AIR with the feed named, not BLANK', () => {
    const channel = bare();
    goLive(channel, 'Studio', AT);
    takeLive(channel, AT);
    const drawn = airtime(channel, NOW, NOW + HOUR);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.on.kind).toBe('live');
    expect(airState('transmitting', drawn[0]!.on.kind !== 'off')).toBe('on');
  });
});
