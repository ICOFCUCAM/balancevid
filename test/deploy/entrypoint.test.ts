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
