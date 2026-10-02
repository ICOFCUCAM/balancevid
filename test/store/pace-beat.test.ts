/**
 * The pace survives the round trip.  [CHANNEL §18, C-41]
 *
 * The judgement is tested next door; this is the wire between the
 * engine that measures and the page that shows it. A number computed
 * and not written down is the fault this stage exists for, so the
 * writing down is worth one test of its own.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let root: string;
let beat: typeof import('../../src/store/playoutHealth.js').beat;
let readBeat: typeof import('../../src/store/playoutHealth.js').readBeat;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-pace-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ beat, readBeat } = await import('../../src/store/playoutHealth.js'));
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe('what the engine says about keeping up (C-41)', () => {
  it('writes the pace down and reads it back', async () => {
    await beat({ channels: 1, made: 2, pacing: 'behind', load: 1.4 });
    const said = await readBeat();
    expect(said?.pacing).toBe('behind');
    expect(said?.load).toBe(1.4);
  });

  /*
   * AND LEAVES IT OUT WHEN THERE IS NOTHING TO SAY. A pass that
   * produced nothing is the healthy idle state, not a measurement,
   * and a heartbeat carrying a stale verdict would be the engine
   * reporting last minute's trouble for ever.
   */
  it('says nothing about a pass that measured nothing', async () => {
    await beat({ channels: 1, made: 0 });
    const said = await readBeat();
    expect(said).not.toBeNull();
    expect('pacing' in said!).toBe(false);
    expect('load' in said!).toBe(false);
  });
});
