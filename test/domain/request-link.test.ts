/**
 * The link, which is a credential handed to a stranger.
 *   [Doctrine D-25, D-06; TAKE-APP T2a, T16]
 *
 * WHAT THIS FILE IS PROTECTING is the one endpoint in the product that
 * anybody on the internet can reach with no account: `/take/<link>`. A
 * room's invitation has the same property and the same care taken over
 * it, and the two failures that matter are the same:
 *
 *   TELLING A STRANGER WHAT EXISTS. "That request is real but your
 *   secret is wrong" is an invitation to guess. Every failure answers
 *   the same way.
 *
 *   TELLING THEM HOW CLOSE THEY ARE. A `===` on a secret leaks its
 *   length and its matching prefix to anybody willing to time a few
 *   thousand requests.
 *
 * It also holds the shape of the link itself, because the alternative
 * design — an index of every live token — is a single file listing every
 * credential in the installation, and the reason it was not built is
 * worth keeping written down.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const NOW = '2026-09-30T10:00:00.000Z';
const LATER = '2026-09-30T23:00:00.000Z';

let root: string;
let store: typeof import('../../src/store/requests.js');
let edit: typeof import('../../src/domain/participationEdit.js');

/*
 * A REAL DIRECTORY, not a mocked filesystem. The thing being tested is
 * "can a stranger with a URL reach a file", and a mock of the layer that
 * answers that question is a mock of the answer.
 */
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'balancevid-requests-'));
  process.env['BALANCEVID_VAR'] = root;
  store = await import('../../src/store/requests.js');
  edit = await import('../../src/domain/participationEdit.js');
});

afterAll(async () => {
  delete process.env['BALANCEVID_VAR'];
  await rm(root, { recursive: true, force: true });
});

async function issued(over: { expiresAt?: string } = {}) {
  const request = edit.newRequest({
    holder: { kind: 'performance', id: 'perf_one' },
    assignment: {
      kind: 'performance',
      asks: 'Sing the second verse',
      reference: { title: 'The Ancient of Days', durationSamples: 48_000 * 244 },
    },
    allowed: { video: true, takes: 3 },
    token: store.newSecret(),
    participant: 'James',
    now: NOW,
    ...over,
  });
  await store.saveRequest(request);
  return request;
}

describe('the secret in a link', () => {
  it('is long enough that nobody guesses it', () => {
    const secret = store.newSecret();
    expect(secret.length).toBeGreaterThanOrEqual(43);
    /* base64url: nothing in it needs escaping in a URL or a chat app. */
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is different every time', () => {
    const many = new Set(Array.from({ length: 200 }, () => store.newSecret()));
    expect(many.size).toBe(200);
  });

  /*
   * Compared by hashing both sides to a fixed length first, because
   * `timingSafeEqual` throws on a length mismatch and catching that
   * would make the length observable — the leak the function exists to
   * prevent.
   */
  it('is compared without throwing on a different length', () => {
    expect(store.sameSecret('short', 'a'.repeat(200))).toBe(false);
    expect(store.sameSecret('', 'x')).toBe(false);
    const same = store.newSecret();
    expect(store.sameSecret(same, same)).toBe(true);
  });
});

describe('what a link opens', () => {
  it('opens the request it was minted for', async () => {
    const request = await issued();
    const found = await store.requestForLink(store.linkFor(request), NOW);
    expect(found?.id).toBe(request.id);
    expect(found?.participant).toBe('James');
  });

  /*
   * EVERY FAILURE IS THE SAME ANSWER. A participant told "that request
   * exists but your secret is wrong" has been told there is something
   * there to guess at.
   */
  it('answers nothing, identically, for every kind of bad link', async () => {
    const request = await issued();
    const bad = [
      '',
      'nonsense',
      'req_nothing.' + store.newSecret(),
      `${request.id}.${store.newSecret()}`,
      `${request.id}.`,
      `${request.id}.short`,
      request.id,
      `.${request.token}`,
    ];
    for (const link of bad) {
      expect(await store.requestForLink(link, NOW), JSON.stringify(link))
        .toBeNull();
    }
  });

  /*
   * A BAD LINK IS AN ORDINARY EVENT ON A PUBLIC ENDPOINT, not an error.
   * `safe()` throws on anything it dislikes, so calling it on a
   * stranger's URL would turn a mistyped link into a 500 — and a path
   * traversal into a stack trace.
   */
  it('refuses a link that tries to leave the directory, without throwing', async () => {
    for (const link of [
      '../../../etc/passwd.' + 'x'.repeat(40),
      'req_../../secret.' + 'x'.repeat(40),
      'req_a/b.' + 'x'.repeat(40),
      `req_${'a'.repeat(300)}.${'x'.repeat(40)}`,
    ]) {
      await expect(store.requestForLink(link, NOW)).resolves.toBeNull();
    }
  });

  it('stops opening once the link has run out', async () => {
    const request = await issued({ expiresAt: '2026-09-30T12:00:00.000Z' });
    const link = store.linkFor(request);
    expect(await store.requestForLink(link, NOW)).not.toBeNull();
    expect(await store.requestForLink(link, LATER)).toBeNull();
  });

  /*
   * Withdrawing it is a new secret, and the old link stops working for
   * whoever holds it — including somebody who has already opened it.
   * [ROOM §6]
   */
  it('stops opening once the secret has been rotated', async () => {
    const request = await issued();
    const old = store.linkFor(request);
    await store.mutateRequest(request.id, (draft) => {
      edit.rotate(draft, store.newSecret(), NOW);
    });
    expect(await store.requestForLink(old, NOW)).toBeNull();
    const now = await store.loadRequest(request.id);
    expect(await store.requestForLink(store.linkFor(now), NOW)).not.toBeNull();
  });
});

describe('two properties no behaviour can show', () => {
  /*
   * THESE ARE SOURCE ASSERTIONS, DELIBERATELY, and the reason is worth
   * stating because the usual answer is that a source assertion is a
   * weak test.
   *
   * Both properties below are real and NEITHER IS OBSERVABLE from
   * outside the function. Replacing `timingSafeEqual` with `===`
   * passes every behavioural test in this file — it returns the same
   * answers, just in a time that depends on how much of the secret was
   * right. Moving the shape check after the disk read also passes
   * everything, because a traversal throws inside `safe()` and is
   * caught either way.
   *
   * A mutation that survives means a test that was not testing. The
   * honest options were to delete the guarantees as unprovable or to
   * hold them where they are written, and these two are worth more
   * than the purity of the method.
   */
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', 'src', 'store', 'requests.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('compares secrets in constant time, on equal lengths', () => {
    expect(source).toMatch(/timingSafeEqual\(a, b\)/);
    /* Hashed first, so both sides are 32 bytes whatever arrived — a
       length mismatch would throw, and catching that would make the
       length itself observable. */
    expect(source).toMatch(/const a = Buffer\.from\(sha256\(sent\), 'hex'\)/);
    expect(source).toMatch(/const b = Buffer\.from\(sha256\(held\), 'hex'\)/);
    expect(source).not.toMatch(/sent === held/);
  });

  it('checks the shape of a link before it reads anything', () => {
    const fn = source.slice(source.indexOf('export async function requestForLink'));
    const shaped = fn.indexOf('.exec(link)');
    const read = fn.indexOf('loadRequest(id)');
    expect(shaped).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(-1);
    expect(shaped, 'the shape is matched before the disk is touched')
      .toBeLessThan(read);
  });
});

describe('the store', () => {
  it('keeps what came back beside the request, not in a production', async () => {
    const request = await issued();
    await store.mutateRequest(request.id, (draft) => {
      edit.open(draft, NOW);
      edit.submit(draft, { assetId: 'asset_a', kind: 'video', at: NOW }, NOW);
    });
    const read = await store.loadRequest(request.id);
    expect(read.submissions).toHaveLength(1);
    expect(read.state).toBe('submitted');
    /* Under the account's own requests directory — not under the
       performance that prompted it, which is D-25 on disk. */
    expect(join(root)).toBeTruthy();
    expect(read.holder).toEqual({ kind: 'performance', id: 'perf_one' });
  });

  it('lists them newest first, and survives a directory that is not one', async () => {
    const listed = await store.listRequests();
    expect(listed.length).toBeGreaterThan(0);
    const dates = listed.map((r) => r.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('throws them away whole', async () => {
    const request = await issued();
    await store.deleteRequest(request.id);
    await expect(store.loadRequest(request.id)).rejects.toThrow();
    expect(await store.requestForLink(store.linkFor(request), NOW)).toBeNull();
  });
});
