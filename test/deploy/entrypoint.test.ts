/**
 * What the container actually starts.  [Doctrine CHANNEL §11, §18, U-23, D-20]
 *
 * THE BUG THIS EXISTS FOR. The playout engine was written, tested, given a
 * health check and a npm script — and `scripts/serve.sh` never ran it. Every
 * deployment therefore served a correct control room, a resolving schedule
 * and a playlist naming segments that did not exist. Nothing failed. Nothing
 * logged. Online TV simply never transmitted.
 *
 * A process that exists and is never started is the hardest kind of gap to
 * see, because every test of the process passes. So this tests the
 * ENTRYPOINT: not what the engine does, but that the container is told to
 * run it.
 *
 * It reads the shell script as text, which is a blunt instrument and the
 * right one — the alternative is booting a container in a unit test, and
 * the thing being protected is one line in a `case`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const SERVE = readFileSync(join(ROOT, 'scripts', 'serve.sh'), 'utf8');
const CHECK = readFileSync(join(ROOT, 'scripts', 'healthcheck.mjs'), 'utf8');
const DOCKER = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
const HEALTH = readFileSync(join(ROOT, 'src', 'domain', 'health.ts'), 'utf8');
const BEAT = readFileSync(
  join(ROOT, 'src', 'store', 'playoutHealth.ts'), 'utf8');
const PACKAGE = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

/** The `case "$ROLE"` body, which is where a role is either handled or not. */
const roles = SERVE.slice(
  SERVE.indexOf('case "$ROLE"'), SERVE.indexOf('esac'));

describe('the entrypoint runs every process the product needs', () => {
  it('knows all four roles', () => {
    for (const role of ['web', 'worker', 'playout', 'all']) {
      expect(roles, role).toMatch(new RegExp(`^\\s*${role}\\)`, 'm'));
    }
  });

  /*
   * THE ONE THAT WAS MISSING. `all` is the default and the only role most
   * deployments ever set, so a channel that does not transmit under `all`
   * is a channel that does not transmit.
   */
  it('starts the playout engine under the default role', () => {
    const all = roles.split('\n').find((line) => /^\s*all\)/.test(line)) ?? '';
    expect(all).toContain('start_playout');
    expect(all).toContain('start_web');
    expect(all).toContain('start_worker');
  });

  it('starts each of the three by running the file that is really there', () => {
    expect(SERVE).toContain('src/playout/index.ts');
    expect(SERVE).toContain('src/worker/index.ts');
  });

  /*
   * The npm scripts and the entrypoint must name the same programs. A
   * `start:playout` that pointed somewhere else would mean a developer and
   * a container running different code with the same word for it.
   */
  it('agrees with the npm scripts about where those programs live', () => {
    expect(PACKAGE.scripts['start:playout']).toContain('src/playout/index.ts');
    expect(PACKAGE.scripts['start:worker']).toContain('src/worker/index.ts');
  });
});

describe('the volume is ready before anything reads it', () => {
  /*
   * THE BUG THIS WOULD CATCH. Two of the three processes call `ensureDirs`
   * themselves; the playout engine never does — its first act is to ask
   * what is on air. So a layout migration left to the processes would race
   * three readers, and an instance whose work still sat at the old
   * addresses would read an empty one, find no channels, and go off air
   * with the recordings apparently gone. [U-25, D-06]
   */
  it('prepares storage before it starts any process', () => {
    expect(SERVE).toContain('prepare_storage');
    expect(SERVE).toContain('scripts/prepare-storage.ts');
    const start = SERVE.indexOf('\nprepare_storage\n');
    expect(start, 'prepare_storage is never called').toBeGreaterThan(-1);
    expect(start).toBeLessThan(SERVE.indexOf('case "$ROLE"'));
  });

  it('agrees with the npm script about where that program lives', () => {
    expect(PACKAGE.scripts['prepare-storage'])
      .toContain('scripts/prepare-storage.ts');
  });

  /*
   * It runs in the FOREGROUND, unlike every other step here: the processes
   * must not start until it has finished, and a `&` would be the whole
   * point missed.
   */
  it('waits for it rather than starting it alongside', () => {
    const line = SERVE.split('\n').find((l) => l.trim() === 'prepare_storage');
    expect(line).toBeDefined();
    expect(line).not.toContain('&');
    expect(SERVE).not.toMatch(/prepare_storage\s*&/);
  });
});

describe('what waits for what', () => {
  /*
   * `ensure_models` fetches ~600 MB on first boot, and only the worker
   * transcribes. Written the obvious way — models, then the processes — it
   * holds the channel off air and the web tier unreachable for the length
   * of a download neither of them needs.
   */
  it('puts the channel on air before the speech models are fetched', () => {
    const all = roles.split('\n').find((line) => /^\s*all\)/.test(line)) ?? '';
    expect(all).toContain('ensure_models');
    expect(all.indexOf('start_playout')).toBeLessThan(all.indexOf('ensure_models'));
    expect(all.indexOf('start_web')).toBeLessThan(all.indexOf('ensure_models'));
    /* And the worker, which is the one that needs them, waits. */
    expect(all.indexOf('ensure_models')).toBeLessThan(all.indexOf('start_worker'));
  });

  it('does not make the playout-only role wait for models it never reads', () => {
    const only = roles.split('\n').find((line) => /^\s*playout\)/.test(line)) ?? '';
    expect(only).toContain('start_playout');
    expect(only).not.toContain('ensure_models');
  });
});

describe('stopping', () => {
  /*
   * Every child leads its own process group, so a stop signal reaches the
   * grandchildren — `next start` spawns `next-server`, and ffmpeg outlives
   * a redeploy otherwise. [D-07]
   */
  it('gives every process its own group, so a stop reaches its children', () => {
    const starts = SERVE.match(/^start_\w+\(\) \{[\s\S]*?\n\}/gm) ?? [];
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (const body of starts) {
      expect(body, body.split('\n')[0]).toContain('setsid');
    }
  });

  it('exits when any one of them dies rather than looking healthy', () => {
    expect(SERVE).toContain('wait -n');
    expect(SERVE).toContain('stop_all');
  });
});

/**
 * And the same bug wearing a different hat.
 *
 * The image asked ONE question of every container — does `/api/health`
 * answer on this port — and three of the four roles run no web tier. A
 * `ROLE=playout` container came up, said `playout: on air`, encoded
 * correctly, and was reported unhealthy for ever, because it was asked the
 * one question that role can never answer. A platform that restarts
 * unhealthy containers restarts a working broadcast encoder on the
 * strength of it, and the control room's lamp — which reads a heartbeat,
 * not a process list — says `Engine: not responding` in the gaps.
 *
 * Measured on a real deployment: `deploypro-balancevid-playout-0  Up 6
 * minutes (unhealthy)`, with `serve: playout engine` and `playout: on air`
 * in its log and no web tier line at all.
 */
describe('the health check asks each role what it can answer', () => {
  it('knows the same four roles the entrypoint does', () => {
    for (const role of ['web', 'worker', 'playout', 'all']) {
      expect(CHECK, role).toMatch(new RegExp(`^\\s*${role}:`, 'm'));
    }
  });

  it('asks a role with no web tier something other than the web tier', () => {
    /* The whole fault: `playout` and `worker` never serve a port, so a
       question about a port is a question they fail by existing. */
    const asks = CHECK.slice(CHECK.indexOf('const ASKS'), CHECK.indexOf('};',
      CHECK.indexOf('const ASKS')));
    expect(/playout:\s*\[playout\]/.test(asks)).toBe(true);
    expect(/worker:\s*\[\]/.test(asks)).toBe(true);
  });

  it('checks the engine as well as the web tier under the default role', () => {
    /* `serve.sh` says it in its own header: "one with no playout looks
       healthy and transmits nothing". Until this existed, that is exactly
       what a ROLE=all container did. */
    const asks = CHECK.slice(CHECK.indexOf('const ASKS'), CHECK.indexOf('};',
      CHECK.indexOf('const ASKS')));
    expect(/all:\s*\[web, playout\]/.test(asks)).toBe(true);
  });

  it('is the file the image actually runs', () => {
    /* A health check written and not wired up is the fault above. */
    expect(DOCKER).toMatch(/HEALTHCHECK[\s\S]{0,400}scripts\/healthcheck\.mjs/);
    expect(DOCKER).not.toMatch(/HEALTHCHECK[\s\S]{0,200}api\/health/);
  });

  it('is copied into the image it is run from', () => {
    expect(DOCKER).toMatch(/COPY[^\n]*\/app\/scripts \.\/scripts/);
  });

  it('reads the pulse where the engine writes it', () => {
    /* The engine is a separate process and the filesystem is all they
       share, so this must agree with `playoutHealth.ts` about the name. */
    expect(BEAT).toContain("'playout.json'");
    expect(CHECK).toContain("'playout.json'");
    expect(CHECK).toContain('BALANCEVID_VAR');
  });

  it('gives the engine far longer than the operator\u2019s lamp does', () => {
    /* Fifteen seconds is right for a lamp telling somebody to go and look
       and wrong for a check that gets a live broadcast restarted. */
    const mine = Number(/PLAYOUT_STALE_MS = ([\d_]+)/.exec(CHECK)![1]!
      .replace(/_/g, ''));
    const lamp = Number(/ENGINE_STALE_MS = ([\d_]+)/.exec(HEALTH)![1]!
      .replace(/_/g, ''));
    expect(mine).toBeGreaterThan(lamp * 4);
  });
});

/* ------------------------------------------------------------------ *
 *  And it is RUN, not just read.
 * ------------------------------------------------------------------ */

/**
 * THE SAME BUG A THIRD TIME, AND THE TESTS ABOVE COULD NOT SEE IT.
 *   [U-02, D-21]
 *
 * Everything above reads these two files as text, and every one of
 * those assertions still passed while production looked like this:
 *
 *     deploypro-balancevid-playout-0   Up 4 minutes (unhealthy)
 *
 * TWO INDEPENDENT REASONS, both invisible to a source-text test.
 *
 * ONE: the check read `var/playout.json`. `playoutHealth.beat()`
 * has written `var/playout/<shard>.json` since sharding arrived —
 * the legacy path is READ by the store for an installation
 * mid-upgrade and never WRITTEN. So the check opened a file that
 * does not exist, got ENOENT, and called a perfectly healthy
 * encoder dead. For ever.
 *
 * TWO: it took the role from `process.env.ROLE`. On DeployPro the
 * workers run `env ROLE=playout ./scripts/serve.sh` inside a
 * container whose own environment still says `ROLE=web`, so the
 * check asked the web tier's question of a container that has no
 * web tier. Also for ever.
 *
 * Either one restarts a working broadcast encoder every few
 * minutes, which is a channel that stops while every line of code
 * involved is correct in isolation. So these RUN the script. [U-02]
 */
describe('the health check, run against a real volume', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execFileSync } = require('node:child_process') as
    typeof import('node:child_process');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('node:os') as typeof import('node:os');

  /** A volume with the given engines beating however long ago. */
  function volume(beats: Record<string, number>): string {
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'bv-health-'));
    fs.mkdirSync(join(dir, 'var', 'playout'), { recursive: true });
    for (const [shard, agoMs] of Object.entries(beats)) {
      fs.writeFileSync(
        join(dir, 'var', 'playout', `${shard}.json`),
        JSON.stringify({
          at: new Date(Date.now() - agoMs).toISOString(),
          channels: 1, made: 1, shard: Number(shard),
        }));
    }
    return dir;
  }

  /** What the container would be told it is, by whom. */
  function ran(
    dir: string,
    env: Record<string, string>,
    serving?: { role: string; shard?: number },
  ): number {
    const note = join(dir, 'serving.json');
    if (serving) fs.writeFileSync(note, JSON.stringify(serving));
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts', 'healthcheck.mjs')], {
        env: {
          ...process.env,
          BALANCEVID_VAR: join(dir, 'var'),
          BALANCEVID_RUN: note,
          ...env,
        },
        stdio: 'pipe',
      });
      return 0;
    } catch (error) {
      return (error as { status?: number }).status ?? 1;
    }
  }

  /*
   * THE DEPLOYPRO CASE, EXACTLY. The container's environment says
   * `web` because that is what the image was configured with; the
   * command said `playout` and that is what is running. A healthy
   * engine must come out healthy.
   */
  it('believes what serve.sh started, not what the environment says', () => {
    const dir = volume({ 0: 1_000 });
    expect(ran(dir, { ROLE: 'web' }, { role: 'playout', shard: 0 })).toBe(0);
  });

  /*
   * AND IT READS THE FILE THE ENGINE WRITES. A beat at
   * `var/playout/0.json` and nothing at `var/playout.json`, which
   * is every installation since sharding.
   */
  it('reads the sharded heartbeat the engine actually writes', () => {
    const dir = volume({ 0: 1_000 });
    expect(fs.existsSync(join(dir, 'var', 'playout.json'))).toBe(false);
    expect(ran(dir, { ROLE: 'playout' })).toBe(0);
  });

  /*
   * A DEAD ENGINE IS STILL DEAD. The check must not have become so
   * forgiving that it passes everything — which is the obvious way
   * to "fix" an unhealthy container and the useless one.
   */
  it('still fails when the engine has genuinely stopped', () => {
    const dir = volume({ 0: 30 * 60_000 });
    expect(ran(dir, { ROLE: 'playout' })).toBe(1);
  });

  it('and when there is no heartbeat at all', () => {
    const dir = volume({});
    expect(ran(dir, { ROLE: 'playout' })).toBe(1);
  });

  /*
   * EACH CONTAINER BY ITS OWN PULSE. On a sharded deployment "is
   * SOMETHING beating" is the wrong question: shard 1 can be dead
   * with its channels off the air while shard 0 beats happily, and
   * a check reading the freshest file anywhere would call the dead
   * container healthy and never restart it. [shard.ts]
   */
  it('judges a sharded container by its own engine, not by its neighbour', () => {
    const dir = volume({ 0: 1_000, 1: 30 * 60_000 });
    expect(ran(dir, { ROLE: 'web' }, { role: 'playout', shard: 0 })).toBe(0);
    expect(ran(dir, { ROLE: 'web' }, { role: 'playout', shard: 1 })).toBe(1);
  });

  /*
   * AND AN INSTALLATION MID-UPGRADE IS NOT CALLED DEAD. A new
   * image's health check beside an engine still running the old
   * one must accept the legacy file, exactly as the store does.
   */
  it('still accepts the legacy single heartbeat', () => {
    const dir = volume({});
    fs.writeFileSync(join(dir, 'var', 'playout.json'),
      JSON.stringify({ at: new Date().toISOString(), channels: 1, made: 1 }));
    expect(ran(dir, { ROLE: 'playout' })).toBe(0);
  });

  /* The web tier is unchanged: it answers for itself, and a
     container with no web tier on that port still fails. */
  it('leaves the web tier asking the web tier', () => {
    const dir = volume({ 0: 1_000 });
    expect(ran(dir, { ROLE: 'web', PORT: '59997' }, { role: 'web' })).toBe(1);
  });
});

/**
 * AND `serve.sh` WRITES DOWN WHAT IT STARTED, or the check above
 * has nothing to read and silently falls back to the environment —
 * which is the bug.
 */
describe('the entrypoint records the role it chose', () => {
  it('writes the role and the shard where the health check looks', () => {
    expect(SERVE).toMatch(/SERVING="\$\{BALANCEVID_RUN:-\$\{TMPDIR:-\/tmp\}/);
    expect(CHECK).toMatch(/BALANCEVID_RUN/);
    /*
     * THE WHOLE STATEMENT, not a fragment of it. A first version
     * of this asserted only the argument line, and a mutation
     * that emptied the format string — writing nothing at all —
     * sailed through: the arguments were still there, attached to
     * a `printf ''`. What matters is that a role and a shard are
     * WRITTEN to the file, so that is what is read. [U-02]
     */
    const writes = SERVE.slice(SERVE.indexOf('SERVING='),
      SERVE.indexOf('\n\n', SERVE.indexOf('SERVING=')));
    expect(writes).toMatch(/"role":"%s"/);
    expect(writes).toMatch(/"shard":%s/);
    expect(writes).toMatch(/"\$ROLE" "\$\{PLAYOUT_SHARD:-0\}"/);
    expect(writes).toMatch(/> "\$SERVING"/);
  });

  /*
   * CONTAINER-LOCAL, NEVER THE SHARED VOLUME. Every container
   * mounts the same /data, so a role written there would be four
   * containers overwriting one answer — the same fault in a new
   * place.
   */
  it('and never onto the volume every container shares', () => {
    const line = SERVE.slice(SERVE.indexOf('SERVING='), SERVE.indexOf('\n\n',
      SERVE.indexOf('SERVING=')));
    expect(line).not.toMatch(/\/data|BALANCEVID_VAR|\bvar\b/);
  });

  /* It records it before it starts anything, or a check racing a
     slow boot reads the environment and asks the wrong question. */
  it('and records it before it starts any of them', () => {
    expect(SERVE.indexOf('SERVING=')).toBeLessThan(SERVE.indexOf('case "$ROLE"'));
  });
});
