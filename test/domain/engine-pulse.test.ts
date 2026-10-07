/**
 * A pass is not a tick.  [CHANNEL §18, §11; Doctrine D-19, U-02, D-21]
 *
 * THE FAULT THESE ANSWER, reported from a running installation:
 *
 * > *"the online tv reads No playout engine has run since this
 * > instance started — the heartbeat on disk is from an earlier one.
 * > The engine is a separate process: check that it is started
 * > (ROLE=all or ROLE=playout)."*
 *
 * The engine was running. It was encoding seventeen channels and
 * making fifty-one segments a pass, with `pacing: 'easy'` and a load
 * of 0.15. The control room said it had never started.
 *
 * THE HEARTBEAT WAS WRITTEN AT THE END OF EACH PASS, for a reason
 * that reads well — *"at the start it would say 'alive' and then
 * spend thirty seconds wedged on a broken encode"* — and the hole in
 * it is that a pass LEGITIMATELY takes thirty seconds. Measured:
 * beats at 31, 31, 31 and 34 seconds apart, against an
 * `ENGINE_STALE_MS` of fifteen. So the room alternated, every few
 * seconds, between a clean board and two different obituaries:
 *
 *     19:37:24  beat  4s old | (healthy)
 *     19:37:37  beat 16s old | No playout engine has run since this instance started…
 *     19:37:55  beat  5s old | (healthy)
 *     19:38:07  beat 17s old | The playout engine stopped responding. It may have crashed…
 *
 * A LIVENESS SIGNAL CANNOT BE GATED ON THE WORK FINISHING, because
 * then it measures the work and not the life. These hold the two
 * numbers apart, and hold the one thing the old arrangement could
 * not do at all: say "alive" before the first pass has finished.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ENGINE_PULSE_MS, ENGINE_STALE_MS, engineState, healthSentence,
} from '../../src/domain/health.js';

/**
 * HOW LONG A PASS ACTUALLY TOOK, measured rather than assumed — four
 * consecutive beats 31, 31, 31 and 34 seconds apart while encoding
 * seventeen channels on one container. The number is here so the
 * tests below are about the engine this product has rather than an
 * engine somebody imagined.
 */
const A_MEASURED_PASS_MS = 34_000;

const NOW = Date.parse('2026-10-05T19:38:00.000Z');

describe('the pulse and the reader’s patience', () => {
  /*
   * THE INVARIANT THE WHOLE FIX RESTS ON. The engine must say it is
   * alive more often than the reader gives up — and with room to
   * lose a few, because a pulse competing with seventeen ffmpeg
   * children for a timer slot is a pulse that will sometimes be
   * late.
   */
  it('lets three pulses go missing before the engine is called dead', () => {
    expect(ENGINE_PULSE_MS * 3).toBeLessThanOrEqual(ENGINE_STALE_MS);
    expect(ENGINE_PULSE_MS).toBeGreaterThan(0);
  });

  it('keeps a healthy engine running right across a pass', () => {
    /* The old cadence: one beat per pass. This is what the room saw. */
    expect(engineState(NOW - A_MEASURED_PASS_MS, NOW)).not.toBe('running');

    /* The new one: a beat every pulse, whatever the pass is doing. */
    for (let late = 0; late <= ENGINE_PULSE_MS * 2; late += 500) {
      expect(engineState(NOW - late, NOW), `a beat ${late}ms old`)
        .toBe('running');
    }
  });

  /*
   * AND THE ONE IT USED TO SAY IN THE FIRST SECONDS AFTER A
   * RESTART, when the only beat on disk was from the pass before:
   * not "stopped responding" but "never started", with instructions
   * to go and check `ROLE`. With seventeen channels the first pass
   * took forty seconds, so that was forty seconds of confident,
   * wrong advice — and the engine is judged by its pulse now, which
   * lands within `ENGINE_PULSE_MS` of the process starting, before
   * any channel has been looked at.
   */
  it('calls an engine alive from its first pulse, before any work', () => {
    expect(engineState(NOW - ENGINE_PULSE_MS, NOW)).toBe('running');
    /* And nothing it can say mentions this instance's own lifetime:
       the sentence has no way to know it, and on a split deployment
       the engine routinely predates the tier reading the beat. */
    for (const state of ['stopped', 'stale'] as const) {
      expect(healthSentence(state, 'silent', 'operator'), state)
        .not.toMatch(/since this instance started/);
    }
  });

  /*
   * THE TRADE, TAKEN DELIBERATELY AND NOT HIDDEN. A wedged engine
   * now keeps beating, so `engineState` alone will not catch it.
   * What catches it is the channel's own stream going stale — which
   * is measured per channel, and which already has the better
   * sentence, because "the engine is running and this channel is
   * not" is something an operator can act on and "it crashed" was
   * not true. [streamState, healthSentence]
   */
  it('still has something to say about an engine that is alive and stuck', () => {
    const says = healthSentence('running', 'stalled', 'operator');
    expect(says).toMatch(/engine is running/);
    expect(says).not.toMatch(/crash/i);
  });
});

describe('what the engine does with the pulse', () => {
  const ENGINE = readFileSync('src/playout/index.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  /*
   * BEFORE ANY WORK. This is the half the old arrangement could not
   * do: the first pass takes as long as it takes, and until it
   * finished there was nothing on disk from this run at all.
   */
  it('beats once before the loop starts', () => {
    /*
     * SEARCHED INSIDE `main` AND NOT THE WHOLE FILE, which a
     * mutation had to point out: `pass()` also ends with `await
     * beat(latest)` and is written ABOVE `main`, so a scan from the
     * top finds that one and is satisfied no matter where the
     * first beat actually is. The assertion passed with the line
     * deleted. [U-02]
     */
    const main = ENGINE.indexOf("playout: on air");
    expect(main, 'main() not found').toBeGreaterThan(-1);
    const first = ENGINE.indexOf('await beat(latest)', main);
    const loop = ENGINE.indexOf('while (running)', main);
    expect(first, 'main() beats nowhere before its loop').toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(-1);
    expect(first).toBeLessThan(loop);
  });

  it('beats on a timer of its own', () => {
    expect(ENGINE).toMatch(/setInterval\(/);
    expect(ENGINE).toMatch(/ENGINE_PULSE_MS/);
    /* Cleared on the way out, so a stopping engine stops claiming to
       be alive. */
    expect(ENGINE).toMatch(/clearInterval\(pulse\)/);
    /* And never the reason the process stays up. */
    expect(ENGINE).toMatch(/pulse\.unref\(\)/);
  });
});

/* ------------------------------------------------------------------ *
 *  Two writers, one file.
 * ------------------------------------------------------------------ */

describe('a pulse and a pass beating at the same moment', () => {
  let root: string;
  let beat: typeof import('../../src/store/playoutHealth.js').beat;
  let readBeat: typeof import('../../src/store/playoutHealth.js').readBeat;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'bv-pulse-'));
    process.env['BALANCEVID_VAR'] = root;
    ({ beat, readBeat } = await import('../../src/store/playoutHealth.js'));
  });

  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  /*
   * THE HAZARD THE TIMER INTRODUCED. The temp file was named for the
   * PROCESS — `playout.json.<pid>.tmp` — which was safe while one
   * thing wrote it. Now a pulse and the end of a pass can be in
   * flight together from the same pid, and with one name between
   * them the second write lands in the file the first is about to
   * rename. A reader gets whichever half won.
   *
   * THE FILE MOVED AND THE HAZARD DID NOT. An installation can run
   * several engines now, so each writes `playout/<index>.json`
   * rather than one shared `playout.json` — two engines on one
   * file would overwrite each other and the control room would
   * show whichever wrote last. Same atomicity question, asked of
   * the file this engine actually writes. [shard.ts]
   */
  it('never leaves half a heartbeat on disk', async () => {
    for (let round = 0; round < 40; round += 1) {
      await Promise.all([
        beat({ channels: 17, made: 51 }),
        beat({ channels: 17, made: 0 }),
        beat({ channels: 0, made: 0 }),
      ]);
      const got = await readBeat();
      expect(got, `round ${round}`).not.toBeNull();
      expect(typeof got!.at).toBe('string');
      expect(Number.isFinite(Date.parse(got!.at))).toBe(true);
    }
    /* And nothing is left behind: a temp file per write that is
       always renamed away. */
    const left = (await readFile(join(root, 'playout', '0.json'), 'utf8')).trim();
    expect(left.startsWith('{')).toBe(true);
    expect(left.endsWith('}')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 *  The engine is judged by the volume, not by the container.
 *  [D-20, D-21, U-02, §11, §18]
 * ------------------------------------------------------------------ */

/**
 * THE SECOND WRONG DIAGNOSIS, which this product shipped itself.
 *
 * The sentence here used to read the web container's own `ROLE`, and
 * on finding `web` told the operator, with complete confidence, that
 * *"nothing here was ever going to transmit"*. The reasoning was
 * sound in one topology and catastrophic in the other, and BalanceVid
 * runs the other:
 *
 * > *"On DeployPro, BalanceVid runs split: the web containers are
 * > ROLE=web; DeployPro workers run env ROLE=worker ./scripts/serve.sh
 * > and env ROLE=playout ./scripts/serve.sh; all share the /data
 * > volume. The diagnosis must judge the engine by the heartbeat in
 * > /data/playout.json, not by the web container's own ROLE."*
 *
 * So the one surface that exists to tell an operator the truth about
 * their installation told a CORRECTLY configured one that it was
 * broken, and named the environment variable to go and change. A
 * confident wrong diagnosis is worse than a vague one: a vague one
 * sends somebody to look, and this one sent them to break a working
 * deployment.
 *
 * `ROLE=web` MEANS "THIS CONTAINER IS NOT THE ENGINE". It says
 * nothing whatever about whether an engine exists beside it, and the
 * web tier has no way to find out — which is exactly why the pulse is
 * on the shared volume rather than in the container. These hold the
 * diagnosis to the one fact both topologies agree on.
 */
describe('a web tier that is not the engine, and is not supposed to be', () => {
  /** The shape the fault was reported from: web here, engine beside. */
  const SPLIT = { booted: NOW - 2_000, engineUpSince: NOW - 9 * 60 * 60_000 };

  /*
   * THE CASE THAT WAS CALLED BROKEN. A web container two seconds old,
   * a playout service that has been up nine hours, one volume between
   * them. The beat is older than this process has existed and the
   * engine is perfectly alive.
   */
  it('reads a fresh beat from an engine far older than itself as running', () => {
    expect(SPLIT.engineUpSince).toBeLessThan(SPLIT.booted);
    expect(engineState(NOW - 1_000, NOW)).toBe('running');
    /* And says nothing at all, which is the only correct output for a
       healthy split deployment. */
    expect(healthSentence('running', 'transmitting', 'operator')).toBeNull();
  });

  /*
   * AND THE CASE THAT IS GENUINELY BROKEN, read from the same web
   * container: the sentence must still be useful, and must not reach
   * for the one fact it is not allowed to use.
   */
  it('blames the engine and never the container reading the beat', () => {
    const cold = healthSentence(
      engineState(NOW - 10 * 60_000, NOW), 'silent', 'operator')!;
    expect(engineState(NOW - 10 * 60_000, NOW)).toBe('stale');
    expect(cold).toMatch(/engine has stopped/i);
    /* It points at the engine's OWN log, which is where the reason is
       on a split deployment and on a single container alike. */
    expect(cold).toMatch(/log/);
    /* The accusations it is no longer allowed to make. */
    expect(cold).not.toMatch(/Nothing here was ever going to transmit/);
    expect(cold).not.toMatch(/ROLE=web/);
    expect(cold).not.toMatch(/since this instance started/);
  });

  it('says a never-written heartbeat is a never-written heartbeat', () => {
    expect(engineState(null, NOW)).toBe('stopped');
    expect(engineState(undefined, NOW)).toBe('stopped');
    const never = healthSentence('stopped', 'silent', 'operator')!;
    /* ABOUT THE STORAGE, not about this container: the claim it can
       support is that nothing has ever beaten on this volume. */
    expect(never).toMatch(/has ever written to this storage/i);
    expect(never).toMatch(/ROLE=playout/);
    expect(never).not.toMatch(/ROLE=web/);
    expect(never).not.toMatch(/Nothing here was ever going to transmit/);
  });

  /*
   * NEITHER SENTENCE MAY ADVISE A CORRECTLY CONFIGURED DEPLOYMENT TO
   * CHANGE ITSELF. Both are allowed to say where an engine comes from
   * — `ROLE=playout` as its own service, or `ROLE=all` in one
   * container — because an installation with no engine at all needs
   * to be told one exists. Neither may say the container showing the
   * sentence is the thing that is wrong.
   */
  it('offers both topologies and condemns neither', () => {
    for (const state of ['stopped', 'stale'] as const) {
      const says = healthSentence(state, 'silent', 'operator')!;
      expect(says, state).toMatch(/separate process/);
      expect(says, state).toMatch(/ROLE=all/);
      expect(says, state).not.toMatch(/misconfigur/i);
    }
  });

  /* A viewer is told nothing about any of it: they cannot act on a
     deployment topology, and it is not theirs to read. [D-03] */
  it('tells a viewer none of this', () => {
    for (const state of ['stopped', 'stale', 'running'] as const) {
      expect(healthSentence(state, 'silent', 'viewer'), state)
        .toBe('This channel is not transmitting right now.');
    }
  });

  /*
   * AND THE ROOM MUST NOT HAND IT THE FACT BACK. A sentence that
   * cannot read `ROLE` is only half the fix while the caller is still
   * passing one in — the signature would take it as an extra
   * argument and typescript would not care in a `.js` consumer. The
   * call site is asserted because it is the thing that regressed.
   */
  it('is not passed the container’s role by the room that shows it', () => {
    const route = readFileSync('app/api/channels/[id]/route.ts', 'utf8');
    expect(route).toMatch(/healthSentence\(engine, stream, 'operator'\)/);
    expect(route).not.toMatch(/healthSentence\([^)]*process\.env/);
    expect(route).not.toMatch(/INSTANCE_STARTED_AT/);
  });

  /*
   * NOR BY THE LIST. `app/t/page.tsx` asks the same question once for
   * the whole installation, and a second opinion there would have one
   * page calling the engine dead while the other called it alive.
   */
  it('is not passed this process’s boot time by the channel list', () => {
    const page = readFileSync('app/t/page.tsx', 'utf8');
    expect(page).toMatch(/engineState\(beat \? Date\.parse\(beat\.at\) : null, now\)/);
    expect(page).not.toMatch(/INSTANCE_STARTED_AT/);
  });

  /*
   * AND THE LAMP AGREES WITH THE SENTENCE. The control room had a
   * fourth label — `Engine: not started here` — for the state that is
   * gone, and a lamp contradicting the line under it is worse than
   * either being wrong alone. [§6, D-04]
   */
  it('has no label left for a state the diagnosis cannot reach', () => {
    const studio = readFileSync('app/t/[id]/ChannelStudio.tsx', 'utf8');
    expect(studio).not.toMatch(/'Engine: not started here'/);
    expect(studio).not.toMatch(/engine === 'earlier'/);
  });
});
