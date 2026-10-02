/**
 * A stream key is not in the document, and not in a backup.
 * [Doctrine CHANNEL §15, D-21, D-06, U-25, C-29]
 *
 * D-21: *"No credentials in the document… A conversation directory is
 * a portable archive (U-25), and a stream key in one is a stream key
 * in somebody's backup."*
 *
 * A live stream key lets anybody broadcast as the account that owns
 * it. These are tested as security properties rather than as
 * behaviour: where the file is, who can read it, and that deleting
 * the destination deletes the credential.
 */

import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let root: string;
let keys: typeof import('../../src/store/streamKeys.js');

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-keys-'));
  process.env['BALANCEVID_VAR'] = root;
  keys = await import('../../src/store/streamKeys.js');
});

afterAll(async () => { await rm(root, { recursive: true, force: true }); });

const SECRET = 'xk7Qv2Lm9ZpR4tWn8aBcDgHj';
const target = { server: 'rtmp://live.example.com/app', key: SECRET };

describe('where a key is kept (D-21, C-29)', () => {
  it('gives it back to the one caller that may have it', async () => {
    await keys.putKey('dest_1', target);
    expect(await keys.getKey('dest_1')).toEqual(target);
  });

  /*
   * OUTSIDE THE ACCOUNT TREE. `var/accounts/…` is the thing a backup
   * walks and an export copies; a key in there travels with every
   * copy of the channel anybody ever makes.
   */
  it('keeps it out of the account tree entirely', async () => {
    await keys.putKey('dest_2', target);
    const walk = async (at: string): Promise<string[]> => {
      const out: string[] = [];
      for (const entry of await readdir(at, { withFileTypes: true })) {
        const path = join(at, entry.name);
        if (entry.isDirectory()) out.push(...await walk(path));
        else out.push(path);
      }
      return out;
    };
    const everything = await walk(root);
    const accounts = everything.filter((p) => p.includes('/accounts/'));
    for (const path of accounts) {
      expect(await readFile(path, 'utf8'), `${path} holds a key`)
        .not.toContain(SECRET);
    }
    /* And it IS somewhere — the test above would pass if nothing had
       been written at all. */
    expect(everything.some((p) => p.includes('/keys/'))).toBe(true);
  });

  /*
   * 0600, AND NOT BECAUSE THE BOX HAS OTHER USERS TODAY. The day it
   * does is not the day anybody will remember to come back and set
   * this.
   */
  it('is readable by nobody else', async () => {
    await keys.putKey('dest_3', target);
    const file = join(root, 'keys', 'dest_3.json');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, 'keys'))).mode & 0o777).toBe(0o700);
  });

  /*
   * AND THE DIRECTORY IS TIGHTENED EVERY TIME, not just created
   * tight. The loose directory is the one from before anybody
   * thought about this, or the one a restore recreated with whatever
   * permissions the archive happened to carry.
   */
  it('tightens a keys directory that was already there and loose', async () => {
    const { chmod, mkdir } = await import('node:fs/promises');
    const dir = join(root, 'keys');
    await mkdir(dir, { recursive: true });
    await chmod(dir, 0o755);
    expect((await stat(dir)).mode & 0o777).toBe(0o755);
    await keys.putKey('dest_tight', target);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  it('leaves no temp file behind with looser permissions', async () => {
    await keys.putKey('dest_4', target);
    const left = await readdir(join(root, 'keys'));
    expect(left.filter((name) => name.includes('.tmp'))).toEqual([]);
  });

  it('replaces a key rather than keeping both', async () => {
    await keys.putKey('dest_5', target);
    await keys.putKey('dest_5', { ...target, key: 'second' });
    expect((await keys.getKey('dest_5'))?.key).toBe('second');
    const file = join(root, 'keys', 'dest_5.json');
    expect(await readFile(file, 'utf8')).not.toContain(SECRET);
  });

  it('trims what somebody pasted', async () => {
    await keys.putKey('dest_6', { server: `  ${target.server} `, key: `\n${SECRET}\n` });
    expect(await keys.getKey('dest_6')).toEqual(target);
  });
});

describe('what may be known about a key (D-21, C-29)', () => {
  /*
   * THE CONTROL ROOM IS TOLD THERE IS ONE AND WHERE IT POINTS, and
   * never what it is. There is nothing you can do with a key on
   * screen that you cannot do by pasting a new one, and a product
   * that can show you yours can show it to whoever is behind you.
   */
  it('says that there is one, and the address, and nothing else', async () => {
    await keys.putKey('dest_7', target);
    const note = await keys.keyNote('dest_7');
    expect(note).toEqual({ server: target.server, has: true });
    expect(JSON.stringify(note)).not.toContain(SECRET);
  });

  it('says nothing about a destination that has none', async () => {
    expect(await keys.keyNote('dest_nope')).toBe(null);
    expect(await keys.keyNote(undefined)).toBe(null);
    expect(await keys.getKey('dest_nope')).toBe(null);
  });

  it('does not mistake a damaged file for a key', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(root, 'keys', 'dest_8.json'), '{ not json', 'utf8');
    expect(await keys.getKey('dest_8')).toBe(null);
    await writeFile(join(root, 'keys', 'dest_9.json'), '{"server":1}', 'utf8');
    expect(await keys.getKey('dest_9')).toBe(null);
  });
});

describe('forgetting one (D-21, C-29)', () => {
  /*
   * THE PART THAT IS EASY TO LEAVE OUT. A key whose destination was
   * deleted is a live credential in a file nothing references, and
   * nothing will ever remove it because nothing remembers it is
   * there.
   */
  it('removes the credential, not just the reference', async () => {
    await keys.putKey('dest_10', target);
    await keys.forgetKey('dest_10');
    expect(await keys.getKey('dest_10')).toBe(null);
    const left = await readdir(join(root, 'keys'));
    expect(left).not.toContain('dest_10.json');
  });

  it('does not complain about one that was never there', async () => {
    await expect(keys.forgetKey('dest_never')).resolves.toBeUndefined();
  });
});
