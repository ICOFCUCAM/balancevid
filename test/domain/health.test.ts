/**
 * Is anything actually transmitting?  [Doctrine CHANNEL §18, §11, D-20]
 *
 * The fault these answer is a control room whose lamps were all green while
 * nothing went out. A resolving schedule is not a transmitting channel, and
 * conflating the two is worse than having no lamp at all — it answers the
 * question wrongly rather than declining to answer it.
 */

import { describe, expect, it } from 'vitest';

import {
  ENGINE_STALE_MS, STREAM_STALE_MS,
  engineState, healthSentence, streamState,
} from '../../src/domain/health.js';
import { SEGMENT_MS } from '../../src/domain/playout.js';

const NOW = Date.parse('2026-04-20T20:00:00.000Z');

describe('the engine', () => {
  it('is running while its heartbeat is fresh', () => {
    expect(engineState(NOW, NOW)).toBe('running');
    expect(engineState(NOW - ENGINE_STALE_MS, NOW)).toBe('running');
  });

  it('is stale once the heartbeat has aged past the threshold', () => {
    expect(engineState(NOW - ENGINE_STALE_MS - 1, NOW)).toBe('stale');
    expect(engineState(NOW - 10 * 60_000, NOW)).toBe('stale');
  });

  /*
   * No file is not a crashed process. It is a var directory that has never
   * had an engine pointed at it, which needs different advice.
   */
  it('is stopped when there has never been a heartbeat', () => {
    expect(engineState(null, NOW)).toBe('stopped');
    expect(engineState(undefined, NOW)).toBe('stopped');
  });

  /*
   * Two machines a few seconds apart is exactly what D-20 leaves room for.
   * Reading a future heartbeat as stale would take a healthy channel off the
   * board for a clock disagreement.
   */
  it('accepts a heartbeat from slightly in the future', () => {
    expect(engineState(NOW + 4000, NOW)).toBe('running');
  });
});

describe('the stream', () => {
  /*
   * The engine keeps two segments AHEAD of the playhead, so the newest file
   * is normally in the future. A check that called that stale would report
   * every healthy channel as dead.
   */
  it('is transmitting while segments are arriving, including from ahead', () => {
    expect(streamState(NOW, NOW)).toBe('transmitting');
    expect(streamState(NOW + 2 * SEGMENT_MS, NOW)).toBe('transmitting');
    expect(streamState(NOW - STREAM_STALE_MS, NOW)).toBe('transmitting');
  });

  it('has stalled once the newest segment is older than the window', () => {
    expect(streamState(NOW - STREAM_STALE_MS - 1, NOW)).toBe('stalled');
  });

  it('is silent when nothing has ever been written', () => {
    expect(streamState(null, NOW)).toBe('silent');
  });
});

describe('what to tell somebody', () => {
  it('says nothing when the channel is on the air', () => {
    expect(healthSentence('running', 'transmitting', 'operator')).toBeNull();
    expect(healthSentence('running', 'transmitting', 'viewer')).toBeNull();
  });

  /*
   * THE GAP THIS CLOSES. A channel whose engine was never started looked
   * perfectly healthy from the control room, and a viewer got a player that
   * spun for ever. The operator is told which command to run.
   */
  it('tells the operator the engine is not running, and how to start it', () => {
    const said = healthSentence('stopped', 'silent', 'operator');
    expect(said).toMatch(/not running/);
    expect(said).toContain('npm run start:playout');
  });

  it('distinguishes a crashed engine from one that was never started', () => {
    expect(healthSentence('stale', 'stalled', 'operator'))
      .toMatch(/stopped responding/);
    expect(healthSentence('stopped', 'silent', 'operator'))
      .not.toMatch(/stopped responding/);
  });

  /*
   * The engine is up and this channel is not going out, which is a different
   * fault with a different cause — most often a reference with no file.
   */
  it('separates a dead engine from one channel that is not going out', () => {
    expect(healthSentence('running', 'stalled', 'operator'))
      .toMatch(/this channel/i);
    expect(healthSentence('running', 'silent', 'operator'))
      .toMatch(/not written a segment/);
  });

  /*
   * A STRANGER IS NOT OWED A DIAGNOSIS. They get the fact about the channel
   * and nothing about the broadcaster's processes — no command, no "engine",
   * no hint that there is a server to go looking at.
   */
  it('tells a viewer the channel is off, and nothing about the server', () => {
    for (const engine of ['running', 'stale', 'stopped'] as const) {
      const said = healthSentence(engine, 'stalled', 'viewer');
      expect(said).toBe('This channel is not transmitting right now.');
      expect(said).not.toMatch(/engine|npm|playout|crash/i);
    }
  });

  /*
   * And a viewer whose picture is arriving is told nothing at all, even if
   * the heartbeat is late — what reaches them is the only thing they can
   * judge, and a warning over a working picture is a warning that trains
   * people to ignore warnings.
   */
  it('says nothing to a viewer whose picture is arriving', () => {
    expect(healthSentence('stale', 'transmitting', 'viewer')).toBeNull();
  });
});
