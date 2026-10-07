/**
 * Is THIS container healthy?  [Doctrine CHANNEL §11, §18, D-20, U-23]
 *
 * THE BUG THIS EXISTS FOR, which is the same bug `entrypoint.test.ts` was
 * written for wearing a different hat. The image's health check asked one
 * question — *does `/api/health` answer on this port* — of every container,
 * and three of the four roles do not run a web tier. A container started
 * with `ROLE=playout` is therefore UNHEALTHY BY CONSTRUCTION: the engine
 * comes up, says `playout: on air`, encodes perfectly, and Docker reports
 * it as failing for ever because it asked the one question that role can
 * never answer.
 *
 * That is not cosmetic. A platform that restarts unhealthy containers will
 * restart a working broadcast encoder every few minutes, and the control
 * room's lamp — which reads a heartbeat, not a process list — will show
 * `Engine: not responding` in the gaps. The station looks broken because
 * the health check was wrong, not because anything it measures was.
 *
 * SO THE QUESTION FOLLOWS THE ROLE. `scripts/serve.sh` decides what a
 * container runs; this decides what "working" means for exactly that, and
 * the two are kept in step by a test rather than by memory.
 *
 * ROLE=all IS CHECKED ON BOTH, deliberately. `serve.sh` says it in its own
 * header — *"one with no playout looks healthy and transmits nothing"* —
 * and until now that is precisely what it did.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * How stale the engine's pulse may be before the container is failing.
 *
 * NOT `ENGINE_STALE_MS`, AND DELIBERATELY MUCH LARGER. Fifteen seconds is
 * the right threshold for a lamp that tells an operator to go and look; it
 * is the wrong one for a check that gets a live broadcast RESTARTED. The
 * heartbeat is written at the END of a pass, a pass encodes real video, and
 * a busy one on a slow core is allowed to take a while without anybody
 * killing it.
 *
 * With Docker's own `--retries=3` at a thirty-second interval this is about
 * three minutes of genuine silence before a container is called unhealthy,
 * which no pass reaches and no dead engine survives.
 */
const PLAYOUT_STALE_MS = 120_000;

/** The web tier answers for itself. */
async function web() {
  const port = process.env['PORT'] || '3000';
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  return response.ok;
}

/**
 * The engine does not answer, so its pulse is read instead.
 *
 * The same files the control room reads, for the same reason: the encoder is
 * a separate process by design and the only thing it shares with anybody is
 * the filesystem. [§18, U-23, playoutHealth.ts]
 *
 * A FILE PER ENGINE, AND THIS READ THE ONE THAT NO LONGER EXISTS.
 * `playoutHealth.beat()` has written `var/playout/<shard>.json` since
 * sharding arrived; `var/playout.json` is a legacy address that the store
 * still READS for an installation mid-upgrade and never WRITES. This asked
 * for the legacy file, got ENOENT every time, and reported a perfectly
 * healthy broadcast encoder as failing — for ever.
 *
 * THAT IS NOT COSMETIC, and it is the same fault this file was written to
 * fix, committed again one layer down. A platform that restarts unhealthy
 * containers restarts the engine every few minutes; the control room shows
 * `Engine: not responding` in the gaps, and the channel the operator is
 * watching stops. The whole file exists because a wrong question made a
 * working container look broken.
 *
 * ITS OWN SHARD, NOT THE FRESHEST. On a sharded deployment each container
 * runs one engine, and "is SOMETHING beating" is the wrong question: shard
 * 0 can be dead with its channels off the air while shard 1 beats happily,
 * and a check that took the newest file would call the dead one healthy.
 * Each container is judged by its own pulse. [shard.ts]
 */
async function playout() {
  const root = process.env['BALANCEVID_VAR'] ?? join(process.cwd(), 'var');
  const mine = (await serving()).shard;
  const beats = join(root, 'playout');

  /** The freshest `at` among the files we are allowed to look at. */
  const freshest = async (files) => {
    let newest = null;
    for (const file of files) {
      try {
        const at = Date.parse(JSON.parse(await readFile(file, 'utf8')).at);
        if (Number.isFinite(at) && (newest === null || at > newest)) newest = at;
      } catch { /* A file mid-rename, or not ours. The others still answer. */ }
    }
    return newest;
  };

  let at = await freshest([join(beats, `${mine}.json`)]);
  /*
   * AND THE LEGACY FILE IS STILL ACCEPTED, because an upgrade is not
   * instantaneous: a container running the new image beside an engine still
   * running the old one must not call that engine dead. The store reads it
   * for the same reason. It is a fallback and never the first question.
   */
  if (at === null) at = await freshest([join(root, 'playout.json')]);
  /*
   * A SHARD THAT CANNOT BE DETERMINED FALLS BACK TO ANY PULSE. Better a
   * check that is too forgiving than one that restarts a working encoder
   * because it could not work out which engine it was. [D-21]
   */
  if (at === null && process.env['PLAYOUT_SHARD'] === undefined) {
    const found = await readdir(beats).catch(() => []);
    at = await freshest(found
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(beats, name)));
  }
  return at !== null && Date.now() - at <= PLAYOUT_STALE_MS;
}

/**
 * What each role has to be able to say before it is called healthy.
 *
 * THE WORKER IS CHECKED BY ITS ABSENCE. `serve.sh` ends on `wait -n` and
 * stops the container the moment any child exits, so a dead worker is
 * already a dead container and Docker's restart policy has it. A health
 * check here would be a second, weaker opinion about a question already
 * answered — and a wrong answer from it would restart a container that was
 * working.
 */
const ASKS = {
  web: [web],
  worker: [],
  playout: [playout],
  all: [web, playout],
};

/**
 * WHAT THIS CONTAINER IS ACTUALLY RUNNING.  [serve.sh, D-21, U-02]
 *
 * READ FROM WHAT `serve.sh` STARTED, NOT FROM THE ENVIRONMENT. This file's
 * own header says *"the question follows the role"*, and it took the role
 * from `process.env.ROLE` — which is the container's environment, and on a
 * platform that sets the role in the COMMAND those are two different
 * things. On DeployPro the workers run `env ROLE=playout ./scripts/serve.sh`
 * inside a container whose environment still says `ROLE=web`. The engine
 * starts; the health check asks the web tier's question of a container that
 * has no web tier; it fails for ever, and the platform restarts a working
 * broadcast encoder every few minutes.
 *
 * SO `serve.sh` WRITES DOWN WHAT IT DID, and this reads that. The one
 * process that knows for certain is the one that chose, and a note it
 * leaves cannot disagree with itself the way two copies of an environment
 * variable can.
 *
 * CONTAINER-LOCAL, NEVER THE SHARED VOLUME. Every container mounts the same
 * `/data`, so a role written there would be four containers overwriting one
 * answer — the identical fault in a new place. `/tmp` belongs to this
 * container alone.
 *
 * AND THE ENVIRONMENT IS STILL THE FALLBACK, for anybody running the check
 * by hand before `serve.sh` has written anything, and for the first moment
 * of a container's life.
 */
const SERVING = process.env['BALANCEVID_RUN']
  ?? join(process.env['TMPDIR'] ?? '/tmp', 'balancevid-serving.json');

async function serving() {
  const fromEnv = {
    role: (process.env['ROLE'] ?? 'all').trim() || 'all',
    shard: Number(process.env['PLAYOUT_SHARD'] ?? 0) || 0,
  };
  try {
    const said = JSON.parse(await readFile(SERVING, 'utf8'));
    return {
      role: typeof said.role === 'string' && said.role.trim()
        ? said.role.trim() : fromEnv.role,
      shard: Number.isInteger(said.shard) && said.shard >= 0
        ? said.shard : fromEnv.shard,
    };
  } catch {
    return fromEnv;
  }
}

const role = (await serving()).role;
const asks = ASKS[role];
if (!asks) {
  process.stderr.write(`healthcheck: unknown ROLE '${role}'\n`);
  process.exit(1);
}

try {
  for (const ask of asks) {
    if (!await ask()) {
      process.stderr.write(`healthcheck: ${role} failed ${ask.name}\n`);
      process.exit(1);
    }
  }
  process.exit(0);
} catch (error) {
  process.stderr.write(`healthcheck: ${String(error).slice(0, 200)}\n`);
  process.exit(1);
}
