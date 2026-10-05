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
  controlRoomNote, engineState, healthSentence, streamState, whyDark,
} from '../../src/domain/health.js';
import { SEGMENT_MS } from '../../src/domain/playout.js';

const NOW = Date.parse('2026-04-20T20:00:00.000Z');

/*
 * WHEN THIS WEB TIER BOOTED, which is the other half of the
 * heartbeat question: a beat says an engine was alive at some
 * instant, and only this says whether that instant was in the
 * life of the process reading it. An hour ago, so a beat can be
 * placed on either side of it.
 */
const BOOTED = NOW - 60 * 60_000;

describe('the engine', () => {
  it('is running while its heartbeat is fresh', () => {
    expect(engineState(NOW, NOW, BOOTED)).toBe('running');
    expect(engineState(NOW - ENGINE_STALE_MS, NOW, BOOTED)).toBe('running');
  });

  /*
   * STALE MEANS IT DIED BESIDE US, which is what the word was
   * always taken to mean and what the advice under it assumes:
   * *check its output and restart it*. That only holds for an
   * engine that beat during the life of this process.
   */
  it('is stale once a heartbeat of ours has aged past the threshold', () => {
    expect(engineState(NOW - ENGINE_STALE_MS - 1, NOW, BOOTED)).toBe('stale');
    expect(engineState(NOW - 10 * 60_000, NOW, BOOTED)).toBe('stale');
  });

  /*
   * AND A BEAT FROM BEFORE WE BOOTED IS A DIFFERENT FAULT.
   *   [§18, D-20]
   *
   * The heartbeat lives on the data VOLUME, which outlives the
   * container. A deployment that once ran the engine leaves a
   * file behind, and every later one that does not run it
   * inherits that file — so the room reported a crashed engine,
   * with advice to check output that does not exist, in
   * deployments where the engine had never been started.
   *
   * The two are a millisecond apart and they are not the same
   * question, which is the whole of why this state exists.
   */
  it('is earlier when nothing has beaten since this instance started', () => {
    expect(engineState(BOOTED - 1, NOW, BOOTED)).toBe('earlier');
    expect(engineState(NOW - 78 * 60 * 60_000, NOW, BOOTED)).toBe('earlier');
  });

  it('is stale, not earlier, for a beat from the moment we booted', () => {
    expect(engineState(BOOTED, NOW, BOOTED)).toBe('stale');
  });

  /*
   * AND FRESHNESS WINS OVER BOTH. An engine beating now is
   * running, whenever this web tier happened to start — a
   * container restarted a second ago beside a healthy engine
   * must not report it missing.
   */
  it('is running even when the web tier booted after the engine', () => {
    expect(engineState(NOW, NOW, NOW + 5_000)).toBe('running');
  });

  /*
   * No file is not a crashed process. It is a var directory that has never
   * had an engine pointed at it, which needs different advice.
   */
  it('is stopped when there has never been a heartbeat', () => {
    expect(engineState(null, NOW, BOOTED)).toBe('stopped');
    expect(engineState(undefined, NOW, BOOTED)).toBe('stopped');
  });

  /*
   * Two machines a few seconds apart is exactly what D-20 leaves room for.
   * Reading a future heartbeat as stale would take a healthy channel off the
   * board for a clock disagreement.
   */
  it('accepts a heartbeat from slightly in the future', () => {
    expect(engineState(NOW + 4000, NOW, BOOTED)).toBe('running');
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

/**
 * And why a channel with nothing wrong with it is still dark.
 * [Doctrine CHANNEL §6, §9]
 *
 * *"Why is this channel not showing when I am live?"*
 *
 * `healthSentence` above answers *is the machinery working*, and every one
 * of its six answers is about a PROCESS. It has no word for the two states
 * where every process is healthy and the screen is still black — the
 * operator pressed GO LIVE and not TAKE LIVE, and the channel has nothing
 * to play. Both are correct behaviour, which is exactly why they need
 * saying: a fault announces itself, and a correct state that looks like a
 * fault does not.
 *
 * `whyDark` was written, cited a doctrine section that did not exist, had
 * no test, and was called by nothing. This is the test; the control room's
 * channel API is the caller.
 */
describe('why a channel is dark (§6, §9)', () => {
  const dark = (over: Partial<Parameters<typeof whyDark>[0]> = {}) =>
    whyDark({ offAir: true, armed: false, hasSchedule: true, ...over });

  it('says nothing at all when something is on air', () => {
    /* The first thing it must never do is warn over a working channel. */
    for (const armed of [true, false]) {
      for (const hasSchedule of [true, false]) {
        expect(dark({ offAir: false, armed, hasSchedule })).toBeNull();
      }
    }
  });

  it('names the press when the operator armed and stopped there', () => {
    const said = dark({ armed: true });
    expect(said).toMatch(/TAKE LIVE/);
    expect(said).toMatch(/PREVIEW/);
  });

  it('names the press even with nothing scheduled behind it', () => {
    /* Armed wins: the operator is standing at the desk waiting to go, and
       telling them about an empty loop answers a question nobody asked. */
    expect(dark({ armed: true, hasSchedule: false })).toMatch(/TAKE LIVE/);
  });

  it('says the loop is empty when nobody is armed and nothing is booked', () => {
    const said = dark({ hasSchedule: false });
    expect(said).toMatch(/[Nn]othing is scheduled/);
    expect(said).not.toMatch(/TAKE LIVE/);
  });

  it('says nothing in the gap between two programmes', () => {
    /*
     * OFF AIR, WITH A SCHEDULE, AND NOBODY ARMED is a thing a channel is
     * allowed to be. Saying anything here would be a warning about the
     * clock. [§5]
     */
    expect(dark({ offAir: true, armed: false, hasSchedule: true })).toBeNull();
  });

  it('never tells an operator to fix a thing that is not broken', () => {
    /* Every sentence here is about a decision, never about a process:
       the process answers belong to `healthSentence` and saying them
       twice in two voices is how a control room starts lying. */
    for (const armed of [true, false]) {
      for (const hasSchedule of [true, false]) {
        const said = whyDark({ offAir: true, armed, hasSchedule });
        if (said) expect(said).not.toMatch(/npm|crash|restart|engine/i);
      }
    }
  });
});

/**
 * And which of the two the control room actually says.
 * [Doctrine CHANNEL §6, §9, §18; D-04]
 *
 * THE BUG THIS EXISTS FOR, found by wiring `whyDark` up and watching it
 * never appear. `healthSentence` returns a sentence for every state except
 * *running and transmitting*, so on any channel that is off air it is
 * non-null — and a component that showed it first would show it always.
 * The operator's reason would have been computed, returned, and never once
 * displayed.
 *
 * Worse, the sentence it would have shown is the unhelpful one: *"the
 * engine is running but has not written a segment for this channel yet"*
 * is true of a channel with an empty loop, sounds like a fault, and tells
 * the operator nothing they can act on.
 */
describe('the one line the control room shows (§6, §18)', () => {
  const ARMED = 'Your camera is up in PREVIEW and nothing is on the wire yet. '
    + 'TAKE LIVE is what puts it out.';

  it('says nothing when the channel is transmitting and nothing is dark', () => {
    expect(controlRoomNote('running', 'transmitting', null)).toBeNull();
  });

  it('puts a dead engine above anything the operator did', () => {
    /* While nothing is being written, which button was pressed cannot
       matter. Fix the transmitter first. */
    for (const engine of ['stopped', 'stale'] as const) {
      const note = controlRoomNote(engine, 'silent', ARMED);
      expect(note?.tone).toBe('fault');
      expect(note?.says).not.toBe(ARMED);
      expect(note?.says).toMatch(/engine/i);
    }
  });

  it('lets the operator\u2019s reason win once the engine is up', () => {
    /* The whole point. Before this, "has not written a segment yet" won
       here — true, alarming, and no use to anybody. */
    const note = controlRoomNote('running', 'silent', ARMED);
    expect(note?.says).toBe(ARMED);
    expect(note?.tone).toBe('note');
  });

  it('calls a correct state a note and a broken one a fault', () => {
    expect(controlRoomNote('running', 'silent', ARMED)?.tone).toBe('note');
    expect(controlRoomNote('running', 'silent', null)?.tone).toBe('fault');
    expect(controlRoomNote('stopped', 'silent', null)?.tone).toBe('fault');
  });

  it('falls back to the transmitter when the channel is dark for no reason', () => {
    /* A gap between two programmes: `whyDark` says nothing, and a stream
       that has stopped is still worth reporting. */
    const note = controlRoomNote('running', 'stalled', null);
    expect(note?.tone).toBe('fault');
    expect(note?.says).toMatch(/stream has stopped/);
  });

  it('never shows both sentences at once', () => {
    /* A desk that says two things says neither. */
    for (const engine of ['running', 'stale', 'stopped'] as const) {
      for (const stream of ['transmitting', 'stalled', 'silent'] as const) {
        for (const dark of [ARMED, null]) {
          const note = controlRoomNote(engine, stream, dark);
          if (!note) continue;
          const other = healthSentence(engine, stream, 'operator');
          expect(note.says === dark || note.says === other).toBe(true);
        }
      }
    }
  });
});

/**
 * THE FOUR FAULTS ARE FOUR SENTENCES.  [§18, D-20, D-21]
 *
 * The point of separating `earlier` from `stale` is that the
 * advice differs: one says restart the process you can see, the
 * other says start a process that was never there. A state with
 * no sentence of its own would have been a rename.
 */
describe('the operator is told which fault it is', () => {
  const NOTHING = 'silent' as const;

  it('gives each engine state its own advice', () => {
    const said = (['running', 'stale', 'earlier', 'stopped'] as const)
      .map((engine) => healthSentence(engine, NOTHING, 'operator'));
    /* Every one is a sentence, and no two are the same one. */
    expect(said.every((one) => typeof one === 'string' && one.length > 0))
      .toBe(true);
    expect(new Set(said).size).toBe(said.length);
  });

  /*
   * AND EACH NAMES ITS OWN REMEDY. `stale` sends an operator to
   * the engine's output; `earlier` sends them to whether it is
   * started at all. Told the wrong one, they go looking for logs
   * that do not exist.
   */
  it('sends a crashed engine to its output and a missing one to its start', () => {
    expect(healthSentence('stale', NOTHING, 'operator')).toMatch(/output/i);
    expect(healthSentence('earlier', NOTHING, 'operator')).toMatch(/ROLE|start/i);
    expect(healthSentence('stopped', NOTHING, 'operator')).toMatch(/start/i);
  });

  /*
   * THE VIEWER IS TOLD NONE OF IT. A stranger is owed an honest
   * "not transmitting", not a diagnosis of somebody's server —
   * and a new engine state must not leak a ROLE variable onto a
   * public page. [D-21]
   */
  it('tells a viewer nothing about the server', () => {
    for (const engine of ['running', 'stale', 'earlier', 'stopped'] as const) {
      const said = healthSentence(engine, NOTHING, 'viewer');
      expect(said).toBe('This channel is not transmitting right now.');
      expect(said).not.toMatch(/ROLE|engine|heartbeat/i);
    }
  });
});
