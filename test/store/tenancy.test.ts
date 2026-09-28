/**
 * What an account owns lives underneath it.  [Doctrine D-06, U-24, U-25]
 *
 * D-06: "Tenant isolation is enforced at the data layer, not in application
 * code alone. One user reaching another's unpublished recordings is the
 * worst incident this product can have." On a filesystem store the data
 * layer is the path, so this is where that sentence either becomes true or
 * stays an intention.
 *
 * THE RISKY HALF IS THE MOVE, not the layout. Every deployment made before
 * accounts existed holds its work at `var/conversations` and three siblings,
 * and those directories are hours of recorded speech that exist nowhere
 * else. So most of what is tested here is the migration refusing to do
 * anything clever.
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OWNER_ACCOUNT_ID } from '../../src/domain/account.js';

let root: string;
let paths: typeof import('../../src/store/paths.js').paths;
let owned: typeof import('../../src/store/paths.js').owned;
let ensureDirs: typeof import('../../src/store/paths.js').ensureDirs;
let forget: typeof import('../../src/store/paths.js').forgetStorageMigration;

beforeAll(async () => {
  root = await mkdtempRoot();
  process.env['BALANCEVID_VAR'] = root;
  ({
    paths, owned, ensureDirs, forgetStorageMigration: forget,
  } = await import('../../src/store/paths.js'));
});

async function mkdtempRoot(): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(join(tmpdir(), 'bv-tenancy-'));
}

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  /* Each test is a process that has just come up onto this volume. */
  forget();
  for (const entry of await readdir(root).catch(() => [])) {
    await rm(join(root, entry), { recursive: true, force: true });
  }
});

/** A document at the address a pre-accounts instance used. */
async function oldWork(root_: string, kind: string, id: string): Promise<void> {
  await mkdir(join(root_, kind, id), { recursive: true });
  await writeFile(join(root_, kind, id, 'thing.json'), '{"real":true}', 'utf8');
}

describe('where the work lives', () => {
  it('puts everything an account owns underneath it', () => {
    const under = `accounts/${OWNER_ACCOUNT_ID}`;
    expect(paths.conversations()).toContain(under);
    expect(paths.performances()).toContain(under);
    expect(paths.channels()).toContain(under);
    expect(paths.library()).toContain(under);
    /* And the things composed from them follow without being told. */
    expect(paths.document('conv_1')).toContain(under);
    expect(paths.channelSegment('chan_1', 4)).toContain(under);
    expect(paths.deck('deck_1')).toContain(under);
  });

  /*
   * THE INSTANCE'S OWN THINGS ARE NOT THE ACCOUNT'S. A job queue belongs to
   * the worker pool that drains it, speech models are versioned with the
   * code, and the playout heartbeat is about a process. Filing those under
   * whoever happens to be the first account would be wrong the day there is
   * a second one.
   */
  it('leaves what belongs to the instance at the top', () => {
    const under = `accounts/${OWNER_ACCOUNT_ID}`;
    expect(paths.queue()).not.toContain(under);
    expect(paths.accounts()).not.toContain(under);
  });

  /*
   * The isolation claim itself: an id cannot climb out of its account's
   * tree, because `safe()` refuses anything with a separator in it. This is
   * what makes the path a boundary rather than a convention. [D-06]
   */
  it('cannot be walked out of with a hostile id', () => {
    for (const nasty of ['../../other', 'a/b', '..', 'x\u0000y']) {
      expect(() => paths.conversation(nasty), nasty).toThrow(/unsafe/);
    }
    expect(() => owned('../elsewhere')).toThrow(/unsafe/);
  });
});

describe('moving an instance that already has work', () => {
  it('carries all four roots underneath the account', async () => {
    await oldWork(root, 'conversations', 'conv_old');
    await oldWork(root, 'performances', 'perf_old');
    await oldWork(root, 'channels', 'chan_old');
    await mkdir(join(root, 'library', 'decks'), { recursive: true });
    await writeFile(join(root, 'library', 'ident.png'), 'x', 'utf8');

    await ensureDirs();

    expect(await readdir(paths.conversations())).toContain('conv_old');
    expect(await readdir(paths.performances())).toContain('perf_old');
    expect(await readdir(paths.channels())).toContain('chan_old');
    expect(await readdir(paths.library())).toContain('ident.png');
    /* And nothing is left behind at the old address. */
    expect(await readdir(root)).not.toContain('conversations');
  });

  /*
   * The worker, the web tier and the playout engine all start together.
   * Whichever loses is told the source is gone, which is the answer and not
   * a failure.
   */
  it('is safe when three processes do it at once', async () => {
    await oldWork(root, 'conversations', 'conv_race');
    const { ensureDirs: a } = await import('../../src/store/paths.js');
    await Promise.all([a(), a(), a()]);
    expect(await readdir(paths.conversations())).toContain('conv_race');
  });

  it('does nothing the second time', async () => {
    await oldWork(root, 'conversations', 'conv_twice');
    await ensureDirs();
    await ensureDirs();
    expect(await readdir(paths.conversations())).toEqual(['conv_twice']);
  });

  it('is content when there was never anything to move', async () => {
    await ensureDirs();
    expect(await readdir(paths.conversations())).toEqual([]);
  });

  /*
   * TWO SETS OF WORK IS NOT A THING TO GUESS AT. If both addresses hold
   * something, merging or overwriting would destroy one of them, and which
   * one is not a decision a startup script gets to make silently. Both are
   * left exactly as they are.
   */
  it('refuses to choose when both addresses hold work', async () => {
    await oldWork(root, 'conversations', 'conv_old');
    await mkdir(paths.conversations(), { recursive: true });
    await writeFile(join(paths.conversations(), 'marker'), 'new', 'utf8');

    await ensureDirs();

    /* Nothing was deleted, on either side. */
    expect(await readdir(join(root, 'conversations'))).toContain('conv_old');
    expect(await readdir(paths.conversations())).toContain('marker');
  });
});
