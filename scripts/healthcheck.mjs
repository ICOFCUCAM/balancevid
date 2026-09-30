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

import { readFile } from 'node:fs/promises';
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
 * The same file the control room reads, for the same reason: the encoder is
 * a separate process by design and the only thing it shares with anybody is
 * the filesystem. [§18, U-23]
 */
async function playout() {
  const root = process.env['BALANCEVID_VAR'] ?? join(process.cwd(), 'var');
  const beat = JSON.parse(await readFile(join(root, 'playout.json'), 'utf8'));
  const at = Date.parse(beat.at);
  return Number.isFinite(at) && Date.now() - at <= PLAYOUT_STALE_MS;
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

const role = (process.env['ROLE'] ?? 'all').trim() || 'all';
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
