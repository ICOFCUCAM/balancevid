/**
 * Does what the engine wrote last until it comes back?
 *   [CHANNEL §15, §18, §7; Doctrine D-19, D-20, D-21, U-02, C-41]
 *
 * THE FAULT THESE ANSWER, measured on a live seventeen-channel
 * installation with a healthy engine and every signal green:
 *
 *     segments written for one channel, seconds apart:
 *       0.4   0.4   [ 20.1 ]   0.4   0.5
 *
 *     heartbeat at the same moment:
 *       { channels: 17, made: 51, pacing: "easy", load: 0.18 }
 *
 * Twelve seconds of television written in about a second, then a
 * twenty-second wait. Every one of the seventeen channels had the
 * playhead pass its newest segment, several times a minute, and the
 * engine called itself `easy` throughout.
 *
 * `load` IS NOT WRONG — IT IS ANSWERING ANOTHER QUESTION. A pass
 * visits every channel in turn, so one wall-clock period produces
 * seventeen channels' worth of broadcast: 51 segments, 204 seconds
 * of television, in 20 seconds of clock. 0.18 is an honest answer
 * about the ENGINE and says nothing about any one CHANNEL, which is
 * the only thing a viewer is watching. Averaging over every channel
 * is structurally unable to see one channel starve. [U-02]
 *
 * AND NO CONSTANT CAN FIX IT, which is the part that matters for
 * whatever this installation grows into. The round trip is a
 * function of how many channels there are; a fixed lead is right at
 * one size and wrong at every other. So the lead is derived from
 * the round trip, and the leftover case — a round trip too long for
 * any sane lead — is reported rather than absorbed.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  CROWDED, LEAST_LEAD, MOST_LEAD, covered, engineNote, leadSegments, load,
  pacing, reach, reachSays,
} from '../../src/domain/pace.js';
import { SEGMENT_MS } from '../../src/domain/playout.js';

/** What the engine was measured doing, so these are about this product. */
const MEASURED_ROUND_TRIP_MS = 20_100;
/** What it used to write, as a constant, whatever the round trip was. */
const THE_OLD_CONSTANT = 2;

describe('how far ahead to write', () => {
  /*
   * THE CASE THAT WAS BROKEN, and the one number that proves the
   * fix: eight seconds of lead against a twenty-second round trip
   * is twelve seconds of nothing, every cycle.
   */
  it('covers the round trip that starved seventeen channels', () => {
    const lead = leadSegments(MEASURED_ROUND_TRIP_MS, SEGMENT_MS);
    expect(lead * SEGMENT_MS).toBeGreaterThan(MEASURED_ROUND_TRIP_MS);
    /* And the old constant did not, which is why they starved. */
    expect(THE_OLD_CONSTANT * SEGMENT_MS)
      .toBeLessThan(MEASURED_ROUND_TRIP_MS);
  });

  /*
   * AT EVERY SIZE, not at the one that was measured. The round trip
   * grows with every channel added, and an installation that works
   * at seventeen and starves at forty has not been fixed.
   */
  it('covers the round trip at any size the cap allows', () => {
    for (let trip = 0; trip <= MOST_LEAD * SEGMENT_MS; trip += 500) {
      const lead = leadSegments(trip, SEGMENT_MS);
      expect(lead * SEGMENT_MS, `round trip ${trip}ms`)
        .toBeGreaterThanOrEqual(trip);
    }
  });

  /*
   * AND ONE CHANNEL IS UNCHANGED. An idle engine with a single
   * channel comes back almost at once, and a lead derived from that
   * alone would be a lead of nothing — so the floor is exactly the
   * constant this replaced, and a small installation behaves as it
   * always did. [D-19]
   */
  it('is what it always was on an installation that never had the fault', () => {
    expect(LEAST_LEAD).toBe(THE_OLD_CONSTANT);
    for (const trip of [0, 1, 100, 1000, 2000]) {
      expect(leadSegments(trip, SEGMENT_MS), `round trip ${trip}ms`)
        .toBe(LEAST_LEAD);
    }
  });

  /*
   * AND IT IS CAPPED, because lead is COMMITTED television: segments
   * already written are not rewritten, so a correction made at 20:59
   * for a programme at 21:00 cannot reach anything already on disk.
   * The engine's own note made that argument about a minute, and the
   * cap is where it bites.
   */
  it('never commits more television than the cap', () => {
    for (const trip of [60_000, 120_000, 600_000, 86_400_000]) {
      expect(leadSegments(trip, SEGMENT_MS), `round trip ${trip}ms`)
        .toBe(MOST_LEAD);
    }
    expect(MOST_LEAD * SEGMENT_MS).toBeLessThanOrEqual(60_000);
  });

  /*
   * AND NEVER BELOW THE FLOOR, FOR ANY INPUT AT ALL. The contract
   * rather than the arithmetic: `ceil` of a positive is at least
   * one today, so the clamp that used to say this was unreachable
   * and was deleted. What must stay true is the promise, which is
   * what this asserts — if the formula ever changes shape, this is
   * what notices.
   */
  it('never writes less lead than it did before any of this', () => {
    for (let trip = 0; trip <= 120_000; trip += 250) {
      expect(leadSegments(trip, SEGMENT_MS), `round trip ${trip}ms`)
        .toBeGreaterThanOrEqual(LEAST_LEAD);
    }
    for (const odd of [NaN, Infinity, -1, 0.5]) {
      expect(leadSegments(odd, SEGMENT_MS), String(odd))
        .toBeGreaterThanOrEqual(LEAST_LEAD);
    }
  });

  /* A number that is not a number is not a measurement. */
  it('falls back to the floor rather than inventing a lead', () => {
    for (const trip of [NaN, Infinity, -1, -20_000]) {
      expect(leadSegments(trip, SEGMENT_MS), String(trip)).toBe(LEAST_LEAD);
    }
    for (const seg of [0, -1, NaN, Infinity]) {
      expect(leadSegments(MEASURED_ROUND_TRIP_MS, seg), String(seg))
        .toBe(LEAST_LEAD);
    }
  });
});

describe('whether the lead lasts', () => {
  const lead = (segments: number) => segments * SEGMENT_MS;

  /*
   * THE STATE THE WHOLE INSTALLATION WAS IN while reporting `easy`.
   * This is the assertion that would have caught it.
   */
  it('calls the measured installation starving', () => {
    expect(reach({
      roundTripMs: MEASURED_ROUND_TRIP_MS, leadMs: lead(THE_OLD_CONSTANT),
    })).toBe('starving');
  });

  it('calls the same installation covered once the lead follows the trip', () => {
    expect(reach({
      roundTripMs: MEASURED_ROUND_TRIP_MS,
      leadMs: lead(leadSegments(MEASURED_ROUND_TRIP_MS, SEGMENT_MS)),
    })).toBe('covered');
  });

  /*
   * THE CLIFF IS AT EQUALITY AND NOT NEAR IT. A lead exactly as long
   * as the round trip runs out at the instant the engine returns,
   * which on any real machine means a frame short.
   */
  it('is starving the moment the round trip reaches the lead', () => {
    expect(reach({ roundTripMs: lead(4), leadMs: lead(4) })).toBe('starving');
    expect(reach({ roundTripMs: lead(4) - 1, leadMs: lead(4) }))
      .not.toBe('starving');
  });

  /*
   * AND THERE IS A BAND BEFORE THE CLIFF, which is the same headroom
   * argument `CROWDED` makes about load: a lead with nothing to
   * spare is one slow pass from a stall, and an operator is owed the
   * warning before the picture stops rather than after.
   */
  it('warns while it still lasts, not once it has failed', () => {
    const leadMs = lead(10);
    expect(reach({ roundTripMs: leadMs * CROWDED * 0.5, leadMs })).toBe('covered');
    expect(reach({ roundTripMs: leadMs * CROWDED + 1, leadMs })).toBe('thin');
    expect(reach({ roundTripMs: leadMs * 0.99, leadMs })).toBe('thin');
    expect(reach({ roundTripMs: leadMs, leadMs })).toBe('starving');
  });

  it('claims nothing before a pass has been timed', () => {
    expect(reach(null)).toBe('unknown');
    expect(reach(undefined)).toBe('unknown');
    expect(reach({ roundTripMs: 0, leadMs: lead(2) })).toBe('unknown');
    expect(reach({ roundTripMs: NaN, leadMs: lead(2) })).toBe('unknown');
  });

  /*
   * AND A CAPPED LEAD THAT STILL DOES NOT COVER THE TRIP IS THE
   * ANSWER, NOT AN EMBARRASSMENT. An engine that cannot get round
   * inside a minute needs fewer channels or a second service, and
   * silently committing two minutes of television would hide that.
   * [D-21]
   */
  it('still says starving when even the cap is not enough', () => {
    const trip = 5 * 60_000;
    const capped = leadSegments(trip, SEGMENT_MS);
    expect(capped).toBe(MOST_LEAD);
    expect(reach({ roundTripMs: trip, leadMs: lead(capped) })).toBe('starving');
  });
});

describe('what the operator is told', () => {
  /*
   * NAMING THE CONSEQUENCE AND THE REMEDY, which is the rule
   * `paceSays` already follows. The remedy here is the one thing an
   * operator would never guess: the engine is NOT slow. Every
   * instinct on seeing a stuttering channel is to look for a
   * bottleneck, and `load` will confirm there is none — so the
   * sentence has to say so and point at the channel count instead.
   */
  it('says the engine is not slow, because every instinct says it is', () => {
    const what = {
      roundTripMs: MEASURED_ROUND_TRIP_MS, leadMs: 2 * SEGMENT_MS,
    };
    const says = reachSays(reach(what), what);
    expect(says).toMatch(/not slow/);
    expect(says).toMatch(/too many channels/);
    /* And the numbers behind it, so it is a measurement and not an
       opinion. */
    expect(says).toContain('8s');
    expect(says).toContain('20s');
  });

  /*
   * AND IT DOES NOT SAY THAT WHEN IT IS NOT TRUE. The two faults
   * look identical from a viewer's chair and have opposite
   * remedies: one needs the channels split up, the other needs a
   * bigger box. An operator told "the engine is not slow" about an
   * engine that is slow goes and rearranges the thing that was not
   * the problem.
   */
  it('stops saying that once the engine really is over capacity', () => {
    const what = {
      roundTripMs: MEASURED_ROUND_TRIP_MS, leadMs: 2 * SEGMENT_MS,
    };
    const says = reachSays(reach(what), what, true);
    expect(says).not.toMatch(/not slow/);
    expect(says).toMatch(/bigger box|fewer channels/);
    /* The symptom is the same, so the first half still is. */
    expect(says).toMatch(/runs out of playlist/);
  });

  it('gives each state its own sentence', () => {
    const said = (['covered', 'thin', 'starving', 'unknown'] as const)
      .map((state) => reachSays(state, null));
    expect(said.every((one) => one.length > 0)).toBe(true);
    expect(new Set(said).size).toBe(said.length);
  });

  /* A sentence with no measurement behind it does not pretend to
     have one. */
  it('quotes no numbers it was not given', () => {
    for (const state of ['covered', 'thin', 'starving', 'unknown'] as const) {
      expect(reachSays(state, null), state).not.toMatch(/\d+s\b/);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  The gauge that was understated by the channel count.
 * ------------------------------------------------------------------ */

/**
 * `load` WAS WRONG BY A FACTOR OF SEVENTEEN, and it is the gauge
 * built to catch exactly this.
 *
 * The engine handed it `made * SEGMENT_MS` — every channel's
 * television added together as if one channel had produced it. A
 * pass visits every channel in turn, so that number is the SUM
 * across channels and what each one actually got is a seventeenth
 * of it. Measured on a live installation:
 *
 *     17 channels, round trip 73.6s, 272 segments made
 *       summed:      272 x 4s = 1088s  -> load 0.11, "easy"
 *       per channel: 1088s / 17 = 64s  -> load 1.15, BEHIND
 *
 * Each channel gained 64 seconds of television while 73.6 seconds
 * of clock went by. Every one of them fell further behind on every
 * cycle — the condition `pace.ts` opens by calling *"the number
 * that says whether this product is a television station or a
 * slideshow"* — and the gauge said there was 89% of the clock
 * spare.
 */
describe('television made for many channels is not many channels of television', () => {
  /** What was measured on the installation that reported `easy`. */
  const LIVE = { channels: 17, made: 272, roundTripMs: 73_588, segmentMs: 4000 };

  it('divides by the channels, and so changes the verdict', () => {
    const summed = LIVE.made * LIVE.segmentMs;
    const perChannel = covered(LIVE.made, LIVE.channels, LIVE.segmentMs);
    expect(perChannel).toBeCloseTo(summed / LIVE.channels, 6);

    const wrong = { spentMs: LIVE.roundTripMs, coveredMs: summed };
    const right = { spentMs: LIVE.roundTripMs, coveredMs: perChannel };
    expect(load(wrong)!).toBeLessThan(0.2);
    expect(load(right)!).toBeGreaterThan(1);
    /* Not a rounding difference — the channel count, exactly. */
    expect(load(right)! / load(wrong)!).toBeCloseTo(LIVE.channels, 6);
  });

  it('calls the installation behind, where it called it easy', () => {
    expect(pacing([{ spentMs: LIVE.roundTripMs, coveredMs: LIVE.made * LIVE.segmentMs }]))
      .toBe('easy');
    expect(pacing([{
      spentMs: LIVE.roundTripMs,
      coveredMs: covered(LIVE.made, LIVE.channels, LIVE.segmentMs),
    }])).toBe('behind');
  });

  /* One channel is the case the old arithmetic was right for, and it
     must stay right: a single-channel installation's numbers do not
     move at all. [D-19] */
  it('is unchanged for the one-channel case it was written against', () => {
    expect(covered(3, 1, 4000)).toBe(3 * 4000);
  });

  it('claims nothing from a pass that produced nothing', () => {
    expect(covered(0, 17, 4000)).toBe(0);
    expect(covered(10, 0, 4000)).toBe(0);
    expect(covered(10, -1, 4000)).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 *  Lead is latency, not capacity.
 * ------------------------------------------------------------------ */

/**
 * AN ENGINE THAT CANNOT KEEP UP MUST NOT BE ASKED FOR MORE.
 *
 * This was measured the hard way. Deriving the lead from the round
 * trip is right, and applying it to an engine that was ALREADY over
 * capacity made everything worse: the round trip went from 20
 * seconds to 74, because a pass that writes ten segments for the
 * first channel leaves the seventeenth with none for that much
 * longer.
 *
 * Lead buys latency — how long a channel survives between visits —
 * and it is paid for out of capacity. An engine with none to spare
 * holds the floor and lets `reach` and `pacing` say what is wrong,
 * because the honest answer to "it cannot keep up" is not "then ask
 * it for more".
 */
describe('a lead the engine cannot afford', () => {
  it('holds the floor while the engine is behind', () => {
    const trip = 20_100;
    expect(leadSegments(trip, SEGMENT_MS)).toBeGreaterThan(LEAST_LEAD);
    expect(leadSegments(trip, SEGMENT_MS, { behind: true })).toBe(LEAST_LEAD);
  });

  it('holds it however long the round trip grows', () => {
    for (const trip of [5_000, 20_000, 74_000, 600_000]) {
      expect(leadSegments(trip, SEGMENT_MS, { behind: true }), String(trip))
        .toBe(LEAST_LEAD);
    }
  });

  /* And takes the lead back up once there is room for it again, or
     the first slow minute would pin the channel to the floor for
     the rest of the broadcast. */
  it('extends again as soon as the engine is keeping up', () => {
    const trip = 20_100;
    expect(leadSegments(trip, SEGMENT_MS, { behind: false }))
      .toBe(leadSegments(trip, SEGMENT_MS));
  });
});

/* ------------------------------------------------------------------ *
 *  And the engine actually does it.
 * ------------------------------------------------------------------ */

/**
 * THE DOMAIN CAN BE PERFECT AND THE LOOP CAN IGNORE IT.
 *
 * Every function above was right and green while five mutations to
 * `src/playout/index.ts` — summing television again, never passing
 * the lead to `advance`, never measuring the round trip, taking the
 * best cycle instead of the worst, dropping the round trip from the
 * heartbeat — passed the whole suite. A pure module with nobody
 * calling it correctly is the shape of this product's recurring
 * fault: *"capabilities built and never reached"*.
 *
 * Read from the source, which is how `engine-pulse.test.ts` holds
 * the same loop to its own pulse: there is no DOM and no way to run
 * a broadcast inside a unit test. Comments are stripped, because a
 * file that EXPLAINS a mistake must not satisfy a search for it.
 */
describe('the loop uses what the domain worked out', () => {
  const ENGINE = readFileSync('src/playout/index.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  /*
   * THE HEADLINE. `made * SEGMENT_MS` is every channel's television
   * added together, and handing that to `load` is what let a box at
   * 1.73 of real time report 0.11 and `easy`.
   */
  it('measures television per channel and not in total', () => {
    expect(ENGINE).toMatch(/coveredMs: covered\(made, latest\.channels, SEGMENT_MS\)/);
    expect(ENGINE).not.toMatch(/coveredMs: made \* SEGMENT_MS/);
  });

  /* The lead is worked out once per pass and handed to every
     channel, or `advance` quietly keeps its own default. */
  it('hands the worked-out lead to every channel', () => {
    expect(ENGINE).toMatch(/const lead = leadSegments\(/);
    expect(ENGINE).toMatch(/advance\(fresh, nowMs, lead\)/);
    /* And the window swept behind matches the lead written ahead,
       or the sweeper deletes what the writer still counts. */
    expect(ENGINE).toMatch(/current - WINDOW_SEGMENTS - lead/);
    expect(ENGINE).not.toMatch(/AHEAD_SEGMENTS/);
  });

  /*
   * AND THE LEAD IS NOT RAISED ON AN ENGINE THAT CANNOT AFFORD IT.
   * Measured: applying a derived lead to an over-capacity engine
   * took the round trip from 20 seconds to 74.
   */
  it('holds the lead down while the engine is behind', () => {
    expect(ENGINE).toMatch(/behind: how\.pacing === 'behind'/);
  });

  /*
   * THE ROUND TRIP IS THE WHOLE NEW FACT, and it is measured across
   * the sleep as well as the work: an idle engine waits a second
   * between passes and a channel waits with it.
   */
  it('times the whole cycle, and keeps the worst of them', () => {
    expect(ENGINE).toMatch(/cycles = keep\(cycles, \{ spentMs: ended - cycleStarted/);
    expect(ENGINE).toMatch(/roundTripMs = Math\.max\(\.\.\.cycles\.map/);
    /* The worst, not the best: a lead sized by a lucky fast cycle
       starves on the next ordinary one. */
    expect(ENGINE).not.toMatch(/roundTripMs = Math\.min/);
  });

  /* And it reaches the web tier, which has no other way to learn
     it. [health.ts streamPatience] */
  it('puts the round trip and the verdict in the heartbeat', () => {
    expect(ENGINE).toMatch(/roundTripMs \}/);
    expect(ENGINE).toMatch(/reach: reach\(what\)/);
    const store = readFileSync('src/store/playoutHealth.ts', 'utf8');
    expect(store).toMatch(/roundTripMs: what\.roundTripMs/);
    expect(store).toMatch(/reach: what\.reach/);
  });

  /*
   * AND THE WEB TIER READS IT. A heartbeat carrying the round trip
   * that nothing asks for is the same fault one layer along: every
   * surface that judges a stream must use the engine's cadence
   * rather than the three-segment floor.
   */
  it('is read by every surface that judges a stream', () => {
    for (const file of [
      'app/api/channels/[id]/route.ts',
      'app/api/channels/[id]/now/route.ts',
      'app/t/page.tsx',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toMatch(/streamState\([^;]*roundTripMs/);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  And somebody is actually told.
 * ------------------------------------------------------------------ */

/**
 * `paceSays` HAD NO CALLERS, in a product that had been running
 * over capacity.
 *
 * The heartbeat carried `pacing` and `load` to the web tier and no
 * surface turned either into a sentence, so the engine knew it was
 * at 1.73 of real time and said so to nobody. Everything above is
 * worth nothing if this stays true. [D-13]
 */
describe('the one line the control room shows about the engine', () => {
  const LIVE = { roundTripMs: 20_729, leadMs: 8000 };

  /* The measured installation, with both faults at once. */
  it('tells a starving over-capacity engine both things, in one line', () => {
    const says = engineNote({
      ...LIVE, reach: 'starving', pacing: 'behind', load: 1.73,
    })!;
    expect(says).toMatch(/runs out of playlist/);
    expect(says).toMatch(/bigger box|fewer channels/);
    expect(says).not.toMatch(/not slow/);
  });

  /*
   * AND STARVING OUTRANKS BEHIND, because `reachSays` is the only
   * sentence that holds both facts. Showing `paceSays` here would
   * send an operator to buy a bigger box without mentioning that
   * their channels also never get visited in time.
   */
  it('prefers the sentence that knows about both', () => {
    const both = engineNote({ ...LIVE, reach: 'starving', pacing: 'behind' });
    const paceOnly = engineNote({ ...LIVE, pacing: 'behind', load: 1.73 });
    expect(both).not.toBe(paceOnly);
    expect(both).toMatch(/runs out of playlist/);
    expect(paceOnly).toMatch(/longer to make the broadcast/);
  });

  /* An engine with capacity whose channels still starve gets the
     remedy that fits: split them up, do not buy a bigger box. */
  it('sends an idle engine with too many channels somewhere else', () => {
    const says = engineNote({ ...LIVE, reach: 'starving', pacing: 'easy' })!;
    expect(says).toMatch(/not slow/);
    expect(says).toMatch(/second playout service|run fewer/);
  });

  /*
   * AND IT IS SILENT WHEN THERE IS NOTHING TO SAY. A control room
   * that prints "keeping up comfortably" on every healthy channel
   * is one more line to read past, and the next real one is read
   * past with it. [D-04]
   */
  it('says nothing at all about a healthy engine', () => {
    expect(engineNote({ ...LIVE, reach: 'covered', pacing: 'easy', load: 0.2 }))
      .toBeNull();
    expect(engineNote({ reach: 'unknown', pacing: 'unknown' })).toBeNull();
    expect(engineNote(null)).toBeNull();
    expect(engineNote(undefined)).toBeNull();
    expect(engineNote({})).toBeNull();
  });

  /* The warnings before the faults, or the first anybody knows is a
     stall. */
  it('warns on the near misses too', () => {
    expect(engineNote({ ...LIVE, reach: 'thin', pacing: 'easy' }))
      .toMatch(/only just lasts/);
    expect(engineNote({ ...LIVE, reach: 'covered', pacing: 'crowded' }))
      .toMatch(/headroom/);
  });

  /* And it reaches the room. A sentence with no caller is what this
     whole section exists because of. */
  it('is read by the control room', () => {
    const route = readFileSync('app/api/channels/[id]/route.ts', 'utf8');
    expect(route).toMatch(/engineNote\(heartbeat\)/);
    expect(route).toMatch(/controlRoomNote\(engine, stream, dark,/);
  });
});
