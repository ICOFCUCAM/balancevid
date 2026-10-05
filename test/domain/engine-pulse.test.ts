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
  ENGINE_PULSE_MS, ENGINE_STALE_MS, engineExpected, engineState,
  healthSentence,
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
    expect(engineState(NOW - A_MEASURED_PASS_MS, NOW, NOW - 600_000))
      .not.toBe('running');

    /* The new one: a beat every pulse, whatever the pass is doing. */
    for (let late = 0; late <= ENGINE_PULSE_MS * 2; late += 500) {
      expect(engineState(NOW - late, NOW, NOW - 600_000),
        `a beat ${late}ms old`).toBe('running');
    }
  });

  /*
   * AND THE WORST SENTENCE OF THE TWO is the one that fires in the
   * first seconds after a restart, when the only beat on disk is
   * from the container before: it does not say "stopped responding",
   * it says the engine was never started, and sends the operator to
   * check `ROLE`. With seventeen channels the first pass took forty
   * seconds, so that is forty seconds of confident, wrong advice.
   */
  it('no longer accuses a just-started engine of never having started', () => {
    const booted = NOW - 2_000;
    const beforeTheFix = engineState(NOW - A_MEASURED_PASS_MS, NOW, booted);
    expect(beforeTheFix).toBe('earlier');
    expect(healthSentence(beforeTheFix, 'transmitting', 'operator'))
      .toMatch(/has run since this instance started/);

    /* A pulse lands within `ENGINE_PULSE_MS` of the process starting,
       before any channel has been looked at. */
    expect(engineState(NOW - ENGINE_PULSE_MS, NOW, booted)).toBe('running');
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
    const left = (await readFile(join(root, 'playout.json'), 'utf8')).trim();
    expect(left.startsWith('{')).toBe(true);
    expect(left.endsWith('}')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 *  "Why is this channel not broadcasting when I have corrected
 *  everything?"  [D-21, U-19, §18]
 * ------------------------------------------------------------------ */

describe('a container that was never going to transmit', () => {
  /*
   * THE ADVICE WAS SOMETHING THE PROCESS COULD HAVE TAKEN ITSELF.
   * The room said *"check that it is started (ROLE=all or
   * ROLE=playout)"* — and `ROLE` is an environment variable that
   * very process can read. It sent somebody to a terminal to look
   * up a fact it was sitting on, and the same sentence covered two
   * situations only one of which has anything to correct.
   */
  it('knows which roles start an engine', () => {
    expect(engineExpected('all')).toBe(true);
    expect(engineExpected('playout')).toBe(true);
    expect(engineExpected('web')).toBe(false);
    expect(engineExpected('worker')).toBe(false);
    /* Absent means nobody set one, which `serve.sh` treats as `all`.
       This must not be a second opinion about that. */
    expect(engineExpected(undefined)).toBe(true);
    expect(engineExpected('')).toBe(true);
    expect(engineExpected('  ')).toBe(true);
  });

  /*
   * AND IT OUTRANKS EVERY OTHER SENTENCE, because none of them can
   * be acted on until this one is settled: an operator correcting
   * the schedule on a web-only container is correcting a thing that
   * was never the problem.
   */
  it('says so plainly instead of sending somebody to check', () => {
    for (const state of ['stopped', 'earlier', 'stale'] as const) {
      const says = healthSentence(state, 'silent', 'operator', 'web')!;
      expect(says, state).toMatch(/Nothing here was ever going to transmit/);
      expect(says, state).toMatch(/ROLE=web/);
      /* It does not send them hunting through the channel. */
      expect(says, state).toMatch(/not the problem/);
    }
  });

  /*
   * WHERE THE ENGINE WAS MEANT TO RUN HERE, the opposite: it did
   * start, by `serve.sh`, and it stopped — so the sentence points
   * at the log rather than at the configuration.
   */
  it('points at the log when the engine was started here', () => {
    const says = healthSentence('earlier', 'silent', 'operator', 'all')!;
    expect(says).toMatch(/ROLE=all/);
    expect(says).toMatch(/It stopped/);
    expect(says).toMatch(/log/);
    expect(says).not.toMatch(/check that it is started/);
  });

  /* And a caller that does not know keeps the sentence that does
     not claim to. */
  it('claims nothing when the caller cannot say', () => {
    expect(healthSentence('earlier', 'silent', 'operator'))
      .toMatch(/check that it is started/);
  });

  /* A viewer is told nothing about roles: they cannot act on any
     of it, and a deployment detail is not theirs to read. [D-03] */
  it('tells a viewer none of this', () => {
    expect(healthSentence('earlier', 'silent', 'viewer', 'web'))
      .toBe('This channel is not transmitting right now.');
  });

  /*
   * AND THE WEB TIER CAN ONLY READ IT BECAUSE THE ENTRYPOINT
   * EXPORTS IT. `ROLE="${ROLE:-all}"` is a plain shell variable:
   * the platform's own setting would be visible, the default would
   * not, and the one process that can show an operator anything
   * could not tell "nobody set a role" from "somebody set web".
   */
  it('is exported by the entrypoint so the processes can read it', () => {
    const serve = readFileSync('scripts/serve.sh', 'utf8');
    expect(serve).toMatch(/^export ROLE="\$\{ROLE:-all\}"$/m);
  });

  it('is read by the room that shows the sentence', () => {
    const route = readFileSync('app/api/channels/[id]/route.ts', 'utf8');
    expect(route).toMatch(/healthSentence\(engine, stream, 'operator', process\.env\['ROLE'\]\)/);
  });
});
