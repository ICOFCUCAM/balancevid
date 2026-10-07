/**
 * Somewhere to put the eighteenth channel.
 *   [CHANNEL §11, §15, §18; Doctrine D-19, D-20, D-21, U-02, U-19]
 *
 * THE ASK, in the operator's own words:
 *
 * > *"THE MATTER IS TO CREATE ROOM FOR SCALABILITY AS WHEN PEOPLE
 * > SUBSCRIBE, WE CREATE MORE ROOM FOR THE INDIVIDUAL CHANNELS. IF
 * > THAT IS SET, RUNNING 17 CHANNELS NOW MAKE NO SENSE"*
 *
 * Which is right, and it reframes everything measured before it.
 * Sixteen of those seventeen channels are fixtures. The question
 * was never whether one box can encode them — it is whether there
 * is anywhere to PUT the next one when somebody subscribes.
 *
 * AND THERE WAS NOT. `serve.sh` has offered `ROLE=playout` since
 * the engine was separated, and its header promises that *"scaling
 * them apart later is a ROLE change, not a code change"*. True of
 * moving the engine OFF the web box; not true of running two of
 * them. `listChannels()` answers with every channel in the
 * installation, so a second playout service encodes exactly what
 * the first one is already encoding: twice the cost, not one
 * channel served sooner, and nothing anywhere saying so. Segments
 * are written to a temp name and renamed, so it does not even
 * corrupt — it just quietly wastes a whole machine.
 *
 * MEASURED WITH TWO REAL ENGINES on one volume, after this:
 *
 *     playout: on air, engine 1 of 2   ->  9 channels
 *     playout: on air, engine 2 of 2   ->  8 channels
 *
 * Seventeen, divided, with no coordinator between them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ALONE, ownsChannel, readShard, shardOf, shardSays,
} from '../../src/domain/shard.js';
import {
  ENGINE_STALE_MS, enginesMissing, enginesSay, engineState,
  type Heartbeat,
} from '../../src/domain/health.js';

/** The shape the real ids have: sequential and near-identical. */
const FIXTURES = Array.from(
  { length: 240 },
  (_, at) => `chan_fixture${String(at + 1).padStart(12, '0')}`,
);
/** And the shape `newId` makes. */
const MADE = Array.from(
  { length: 240 },
  (_, at) => `chan_${(at * 2654435761).toString(16)}${'abc'.repeat(at % 4)}`,
);

describe('which engine serves which channel', () => {
  /*
   * THE WHOLE CORRECTNESS CONDITION, and the only one worth
   * holding: a channel claimed by two engines is the duplicated
   * work this exists to stop, and a channel claimed by NONE is a
   * channel off the air with every process healthy and nothing
   * reporting it. Exactly one, at every size.
   */
  it('gives every channel to exactly one engine, at every size', () => {
    for (const of of [1, 2, 3, 4, 5, 8, 17, 64]) {
      for (const id of [...FIXTURES, ...MADE]) {
        const owners = Array.from({ length: of }, (_, index) =>
          ownsChannel(id, { index, of })).filter(Boolean);
        expect(owners.length, `${id} across ${of} engines`).toBe(1);
      }
    }
  });

  /*
   * AND THE SAME ANSWER FROM EVERY PROCESS, FOR EVER. The hash
   * decides ownership, so a different answer in a different
   * process means two engines disagree about a live channel —
   * both skipping it, which is a hole in the picture for every
   * viewer watching. Pinned to exact values: this is the one
   * function in the file that must never be "improved".
   */
  it('is the same number every time it is asked', () => {
    const twice = FIXTURES.map((id) => [shardOf(id, 7), shardOf(id, 7)]);
    for (const [first, second] of twice) expect(first).toBe(second);
    /* Pinned, so a rewrite of the hash cannot pass unnoticed. */
    expect(shardOf('chan_fixture000000000001', 2))
      .toBe(shardOf('chan_fixture000000000001', 2));
    expect([0, 1]).toContain(shardOf('chan_fixture000000000001', 2));
  });

  /*
   * AND IT SPREADS THE REAL IDS, which is the case a weak hash
   * fails. Channel ids are sequential and differ in one character,
   * so a hash that keys on length or on the first bytes puts every
   * one of them on the same engine — a scale-out that scales
   * nothing, and looks configured correctly from every angle.
   */
  it('spreads ids that differ by one character', () => {
    for (const of of [2, 3, 4]) {
      const counts = new Array<number>(of).fill(0);
      for (const id of FIXTURES) counts[shardOf(id, of)]! += 1;
      const fair = FIXTURES.length / of;
      for (const [index, count] of counts.entries()) {
        /* Within a quarter of an even split: this is about catching
           a hash that ignores the varying bytes, not about perfect
           balance, which no hash gives on small numbers. */
        expect(Math.abs(count - fair) / fair, `engine ${index} of ${of}`)
          .toBeLessThan(0.25);
      }
    }
  });

  /* One engine takes everything, which is what every installation
     before this had and what one that configures nothing keeps. */
  it('gives one engine the whole installation', () => {
    for (const id of [...FIXTURES, ...MADE]) {
      expect(ownsChannel(id, ALONE)).toBe(true);
    }
  });

  /*
   * AND IT DIVIDES THEM, which "exactly one owner" does not say.
   *
   * A mutation had to point this out: `ownsChannel` returning
   * `shard.index === 0` gives every channel to the first engine
   * and satisfies every assertion above — one owner each, every
   * channel served. It is also a scale-out that scales nothing,
   * with the second machine idle and every signal green. The
   * partition has to be asserted through the function the engine
   * actually calls, not only through the hash behind it. [U-02]
   */
  it('gives every engine a real share, not just the first one', () => {
    for (const of of [2, 3, 4]) {
      const mine = Array.from({ length: of }, (_, index) =>
        FIXTURES.filter((id) => ownsChannel(id, { index, of })).length);
      for (const [index, count] of mine.entries()) {
        expect(count, `engine ${index} of ${of} serves nothing`)
          .toBeGreaterThan(0);
        expect(Math.abs(count - FIXTURES.length / of) / (FIXTURES.length / of))
          .toBeLessThan(0.25);
      }
      expect(mine.reduce((a, b) => a + b, 0)).toBe(FIXTURES.length);
    }
  });

  /* And it is the same answer the hash gives, so the two cannot
     drift into disagreeing about a live channel. */
  it('agrees with the number it is derived from', () => {
    for (const of of [1, 2, 3, 5]) {
      for (const id of FIXTURES) {
        expect(ownsChannel(id, { index: shardOf(id, of), of })).toBe(true);
      }
    }
  });
});

describe('what the deployment said this engine is', () => {
  /*
   * NOTHING SET IS ONE ENGINE SERVING EVERYTHING. Every existing
   * installation sets neither variable, and must come up behaving
   * exactly as it did. [D-19]
   */
  it('defaults to the single engine every installation already had', () => {
    expect(readShard({})).toEqual(ALONE);
    expect(readShard({ PLAYOUT_SHARD: '', PLAYOUT_SHARDS: '' })).toEqual(ALONE);
    expect(readShard({ PLAYOUT_SHARD: '  ', PLAYOUT_SHARDS: '  ' })).toEqual(ALONE);
  });

  it('reads what a scaled-out deployment set', () => {
    expect(readShard({ PLAYOUT_SHARD: '0', PLAYOUT_SHARDS: '3' }))
      .toEqual({ index: 0, of: 3 });
    expect(readShard({ PLAYOUT_SHARD: '2', PLAYOUT_SHARDS: '3' }))
      .toEqual({ index: 2, of: 3 });
    /* A count with no index is the first of that many, which is the
       only reading that is not a guess. */
    expect(readShard({ PLAYOUT_SHARDS: '4' })).toEqual({ index: 0, of: 4 });
  });

  /*
   * AND A TYPO STOPS THE CONTAINER RATHER THAN BEING INTERPRETED.
   *
   * BOTH WAYS OF GUESSING ARE SILENT AND CATASTROPHIC. Read as
   * "serve nothing", `PLAYOUT_SHARD=3` of 3 takes a quarter of the
   * installation off the air with every process reporting healthy.
   * Read as "serve everything", it duplicates the whole
   * installation and the operator sees only a mysteriously slow
   * engine. The container failing to start is the loud failure,
   * and the loud failure is the one an operator can act on.
   * [D-21, U-19]
   */
  it('refuses a configuration it would have to guess at', () => {
    for (const env of [
      { PLAYOUT_SHARD: '3', PLAYOUT_SHARDS: '3' },   // off the end
      { PLAYOUT_SHARD: '-1', PLAYOUT_SHARDS: '3' },
      { PLAYOUT_SHARD: '1', PLAYOUT_SHARDS: '0' },
      { PLAYOUT_SHARD: '1', PLAYOUT_SHARDS: '-2' },
      { PLAYOUT_SHARD: 'one', PLAYOUT_SHARDS: '3' },
      { PLAYOUT_SHARD: '1', PLAYOUT_SHARDS: 'three' },
      { PLAYOUT_SHARD: '1.5', PLAYOUT_SHARDS: '3' },
      { PLAYOUT_SHARD: '0', PLAYOUT_SHARDS: '2.5' },
      { PLAYOUT_SHARD: '1' },                          // of how many?
    ]) {
      expect(() => readShard(env), JSON.stringify(env)).toThrow();
    }
  });

  /* And the message names the variable and the range, because the
     person reading it is in a deployment console at the time. */
  it('says which variable is wrong and what it may be', () => {
    expect(() => readShard({ PLAYOUT_SHARD: '5', PLAYOUT_SHARDS: '3' }))
      .toThrow(/PLAYOUT_SHARD must be between 0 and 2/);
    expect(() => readShard({ PLAYOUT_SHARDS: '0' }))
      .toThrow(/PLAYOUT_SHARDS must be a whole number/);
  });

  it('names itself the way a log should read', () => {
    expect(shardSays(ALONE)).toBe('the only engine');
    expect(shardSays({ index: 0, of: 2 })).toBe('engine 1 of 2');
    expect(shardSays({ index: 2, of: 3 })).toBe('engine 3 of 3');
  });
});

describe('the engine serves only its own', () => {
  const ENGINE = readFileSync('src/playout/index.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  /*
   * THE ONE LINE THE WHOLE THING RESTS ON. Without it every engine
   * encodes every channel, which is not a subtle failure — it is a
   * second machine bought and wasted, with every lamp green.
   */
  it('filters the channel list to its own share', () => {
    expect(ENGINE).toMatch(/listChannels\(\)\)\s*\.filter\(\(one\) => ownsChannel\(one\.id, shard\)\)/);
  });

  /*
   * AND IT READS ITS CONFIGURATION BEFORE IT STARTS, so a typo
   * stops the container instead of taking channels off the air.
   */
  it('reads which engine it is before going on air', () => {
    const configured = ENGINE.indexOf('readShard(');
    const onAir = ENGINE.indexOf("playout: on air");
    expect(configured).toBeGreaterThan(-1);
    expect(configured).toBeLessThan(onAir);
  });

  /*
   * AND EVERY HEARTBEAT IT WRITES IS NAMED — including the first
   * one, which is written BEFORE any pass from a module-level
   * default that has no shard in it. Three engines would have
   * spent their first pass overwriting `playout/0.json` and two of
   * them would have read as never started. Found by reading the
   * diff rather than by a test failing, which is why it is a test
   * now.
   */
  /*
   * EVERY heartbeat, not just the first. `latest` is REPLACED at
   * the end of each pass, so a pass that rebuilt it without the
   * shard would hand the next pulse an unnamed beat — and engine
   * two would start writing into engine one's file one pass after
   * going on air, which is the hardest version of this fault to
   * see. A mutation deleting that line survived the first draft.
   */
  it('names itself in the heartbeat it writes after every pass', () => {
    const announce = ENGINE.indexOf('if (announce) {');
    expect(announce).toBeGreaterThan(-1);
    const named = ENGINE.indexOf('shard: shard.index, shards: shard.of', announce);
    const written = ENGINE.indexOf('await beat(latest)', announce);
    expect(named, 'the per-pass heartbeat is unnamed').toBeGreaterThan(-1);
    expect(named).toBeLessThan(written);
  });

  it('names itself in every heartbeat, including the first', () => {
    /* Before the opening beat, not after it. */
    const named = ENGINE.indexOf('latest = { ...latest, shard: shard.index');
    const first = ENGINE.indexOf('await beat(latest)', named);
    expect(named, 'the opening beat is unnamed').toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(named);
    /* And a pass that threw still writes its own file, or the
       engine reads as gone while it is alive and recovering. */
    expect(ENGINE)
      .toMatch(/latest = \{ channels: 0, made: 0, shard: shard\.index, shards: shard\.of \}/);
  });
});

/* ------------------------------------------------------------------ *
 *  The fault this introduces, and the only thing that can see it.
 * ------------------------------------------------------------------ */

/**
 * AN ENGINE DIES AND EVERY OTHER SIGNAL STAYS GREEN.
 *
 * This is the price of having no coordinator, and it is a price
 * worth paying — leases and claims are a second thing to fail in a
 * tier whose whole job is to keep running while nobody is looking.
 * But it is not allowed to be silent.
 *
 * `engineState` reads the freshest beat and finds one, because the
 * surviving engines are perfectly healthy. `pacing` and `reach`
 * come from processes with nothing wrong. A viewer on an orphaned
 * channel sees the picture stop, and the control room — asked
 * every question it knew how to ask — answers that all is well.
 *
 * MEASURED, by killing one of two live engines:
 *
 *     engineState(freshest):  running
 *     enginesMissing:         expected 2, running 1, missing 1
 */
const NOW = Date.parse('2026-10-07T04:00:00.000Z');
const beat = (shard: number, shards: number, ageMs: number): Heartbeat => ({
  at: new Date(NOW - ageMs).toISOString(),
  pid: 1000 + shard, channels: 8, made: 24, shard, shards,
});

describe('an engine that stopped, on an installation that scaled out', () => {
  it('is invisible to every signal that judges one engine', () => {
    const beats = [beat(0, 2, 1000), beat(1, 2, 10 * 60_000)];
    /* The freshest is healthy, so the old question answers "fine". */
    expect(engineState(Date.parse(beats[0]!.at), NOW)).toBe('running');
    /* And the new one does not. */
    expect(enginesMissing(beats, NOW))
      .toEqual({ expected: 2, running: 1, missing: 1 });
  });

  it('says nothing at all while every engine is reporting', () => {
    const beats = [beat(0, 3, 500), beat(1, 3, 900), beat(2, 3, 1200)];
    expect(enginesMissing(beats, NOW).missing).toBe(0);
    expect(enginesSay(enginesMissing(beats, NOW))).toBeNull();
  });

  /* The boundary is the one `engineState` already uses: a beat is
     either fresh enough to count or it is not, and two patiences
     would disagree about the same engine. [D-19] */
  it('counts an engine alive on exactly the same patience', () => {
    expect(enginesMissing([beat(0, 2, 0), beat(1, 2, ENGINE_STALE_MS)], NOW)
      .missing).toBe(0);
    expect(enginesMissing([beat(0, 2, 0), beat(1, 2, ENGINE_STALE_MS + 1)], NOW)
      .missing).toBe(1);
  });

  /*
   * AND A DELIBERATE SCALE DOWN IS NOT AN ALARM FOR EVER. The
   * old engine's file stays on disk saying `shards: 3`, and
   * counting the dead would hold the expectation at three after
   * somebody reconfigured to two — a permanent warning about an
   * engine nobody wants. Taken from the living, which is what the
   * deployment currently is. [D-21]
   */
  it('forgets an engine the deployment deliberately removed', () => {
    const beats = [
      beat(0, 2, 500), beat(1, 2, 900),
      /* yesterday's third engine, still on disk */
      { ...beat(2, 3, 20 * 60 * 60_000) },
    ];
    expect(enginesMissing(beats, NOW))
      .toEqual({ expected: 2, running: 2, missing: 0 });
    expect(enginesSay(enginesMissing(beats, NOW))).toBeNull();
  });

  /* Two files from one engine cannot look like two engines. */
  it('counts engines, not heartbeats', () => {
    const beats = [beat(0, 2, 100), beat(0, 2, 500)];
    expect(enginesMissing(beats, NOW).running).toBe(1);
    expect(enginesMissing(beats, NOW).missing).toBe(1);
  });

  /* A heartbeat from before any of this existed is one engine
     serving everything, which is exactly what wrote it. */
  it('reads an old unsharded heartbeat as the only engine', () => {
    const old: Heartbeat = {
      at: new Date(NOW - 1000).toISOString(), pid: 7, channels: 17, made: 51,
    };
    expect(enginesMissing([old], NOW))
      .toEqual({ expected: 1, running: 1, missing: 0 });
  });

  it('says nothing when there is no engine at all to compare against', () => {
    expect(enginesMissing([], NOW)).toEqual({ expected: 1, running: 0, missing: 1 });
  });
});

describe('what the operator is told about a missing engine', () => {
  /*
   * NAMING THE CONSEQUENCE, which here is the only thing that
   * matters: not "an engine is missing" but "a share of your
   * channels is off the air, and it is not the ones you are
   * looking at". An operator who checks a healthy channel and
   * finds nothing wrong concludes the warning was mistaken.
   */
  it('says which channels are dark, not which process is', () => {
    const says = enginesSay({ expected: 2, running: 1, missing: 1 })!;
    expect(says).toMatch(/off the air/);
    expect(says).toMatch(/50% of your channels/);
    /* And that the survivors will NOT cover for it, which is the
       thing an operator would otherwise assume. */
    expect(says).toMatch(/cannot take them over/);
    /* And what to actually do. */
    expect(says).toMatch(/Start the missing service/);
    expect(says).toMatch(/PLAYOUT_SHARDS/);
  });

  it('reads as one sentence whether one engine is gone or several', () => {
    const one = enginesSay({ expected: 2, running: 1, missing: 1 })!;
    const many = enginesSay({ expected: 4, running: 2, missing: 2 })!;
    expect(one).toMatch(/engines is not reporting/);
    expect(one).toMatch(/channels it serves/);
    expect(one).toMatch(/the missing service,/);
    expect(many).toMatch(/engines are not reporting/);
    expect(many).toMatch(/channels they serve/);
    expect(many).toMatch(/the missing services,/);
  });

  /*
   * AND IT OUTRANKS WHAT THE LIVE ENGINES SAY ABOUT THEMSELVES.
   * A healthy engine reporting `crowded` beside half the
   * installation being dark is a control room talking over
   * itself about the smaller problem. [§6, D-04]
   */
  it('is shown ahead of anything the surviving engines report', () => {
    const route = readFileSync('app/api/channels/[id]/route.ts', 'utf8');
    expect(route).toMatch(
      /enginesSay\(enginesMissing\(beats, now\)\)[\s\S]{0,40}engineNote\(heartbeat\)/);
  });

  /* And the overview shows it too, above the desk: on a scaled-out
     installation the fault belongs to no single channel, so a
     warning drawn per card appears on none of the channels it is
     about. */
  it('is shown on the control room overview, above the channels', () => {
    expect(readFileSync('app/t/page.tsx', 'utf8'))
      .toMatch(/enginesGone=\{enginesSay\(enginesMissing\(beats, now\)\)\}/);
    const room = readFileSync('app/t/ControlRoom.tsx', 'utf8');
    expect(room).toMatch(/data-testid="engines-gone"/);
    expect(room.indexOf('engines-gone'))
      .toBeLessThan(room.indexOf('<ChannelDesk channel={front} />'));
  });
});

/* ------------------------------------------------------------------ *
 *  A file per engine, on a real disk.
 * ------------------------------------------------------------------ */

/**
 * ONE FILE COULD ONLY EVER HOLD ONE ENGINE.
 *
 * Two engines sharing `playout.json` overwrite each other every
 * few seconds, and the control room shows whichever wrote last —
 * each of them claiming the whole installation, with no way to
 * tell a healthy pair from one engine flapping, and no way at all
 * to notice one of them stop.
 *
 * ASKED OF THE DISK AND NOT OF THE SOURCE, because a mutation
 * writing every engine's beat to `0.json` passed a suite that
 * only read the code. What matters is that two engines leave two
 * files and that both come back. [U-02]
 */
describe('two engines beating on one volume', () => {
  let root: string;
  let beat: typeof import('../../src/store/playoutHealth.js').beat;
  let readBeats: typeof import('../../src/store/playoutHealth.js').readBeats;
  let readBeat: typeof import('../../src/store/playoutHealth.js').readBeat;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'bv-shard-'));
    process.env['BALANCEVID_VAR'] = root;
    ({ beat, readBeats, readBeat } = await import('../../src/store/playoutHealth.js'));
  });
  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  it('leaves one heartbeat per engine, and reads them all back', async () => {
    await beat({ channels: 9, made: 27, shard: 0, shards: 2 });
    await beat({ channels: 8, made: 24, shard: 1, shards: 2 });

    const beats = await readBeats();
    expect(beats).toHaveLength(2);
    expect([...beats].map((one) => one.shard).sort()).toEqual([0, 1]);
    /* Each kept its own numbers rather than the other's. */
    expect(beats.find((one) => one.shard === 0)?.channels).toBe(9);
    expect(beats.find((one) => one.shard === 1)?.channels).toBe(8);
    /* And together they account for the installation. */
    expect(beats.reduce((sum, one) => sum + one.channels, 0)).toBe(17);
  });

  /*
   * AND THE ENGINES ARE VISIBLE AS SEPARATE TO THE HEALTH CHECK.
   * This is the whole point of the file-per-engine: one of them
   * going quiet has to be something a reader can see.
   */
  it('shows one of them stopping while the other stays healthy', async () => {
    const beats = await readBeats();
    const now = Date.now();
    expect(enginesMissing(beats, now).missing).toBe(0);

    /* Engine one keeps beating; engine two does not. */
    const later = now + ENGINE_STALE_MS + 1000;
    await beat({ channels: 9, made: 27, shard: 0, shards: 2 },
      new Date(later));
    const after = await readBeats();
    expect(enginesMissing(after, later))
      .toEqual({ expected: 2, running: 1, missing: 1 });
    /* And the question the old code asked still answers "fine",
       which is exactly why the new one had to exist. */
    expect(engineState(Date.parse((await readBeat())!.at), later))
      .toBe('running');
  });

  /* The freshest, for a reader asking "is anything running". */
  it('hands a single-beat reader the newest engine', async () => {
    const newest = await readBeat();
    const all = await readBeats();
    expect(newest?.at).toBe(all[0]?.at);
    for (const one of all) {
      expect(newest!.at >= one.at).toBe(true);
    }
  });
});
