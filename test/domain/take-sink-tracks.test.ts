/**
 * Which camera a sink is, and the shell that carries it.
 *   [TAKE-DESKTOP B-2; TAKE-APP T13a; Doctrine D-19, U-06]
 *
 * ONE SINK PER CAMERA, NOT ONE SINK TOLD WHICH CAMERA. That is the
 * shape B-2 ended up with, and it is B-1's own correction applied a
 * second time: B-1 wanted to give a take N tracks and found that
 * four cameras need four takes that know they belong together.
 * Four cameras do not need a new recorder argument either —
 * `useMasterRecording` is one camera, stays one camera, and not a
 * line of the latency arithmetic this stage was told not to touch
 * had to move. What knows about the capture is the thing outside it.
 *
 * THE SINK IS RUN HERE RATHER THAN READ. Every assertion below is
 * on a URL that was actually requested or a row that was actually
 * queued, because the thing that goes wrong is a track that is
 * carried in three places and dropped in the fourth.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

interface Queued {
  link: string; submissionId: string; index: number; track?: number; blob: Blob;
}

const queued: Queued[] = [];
const asked: { url: string; method: string }[] = [];

type Sink = typeof import('../../app/take/[link]/takeSink.js').takeSink;

/**
 * The sink, under a browser that either has a queue or has not.
 *
 * `takeQueue()` LOADS THE QUEUE ONCE AND REMEMBERS IT, including the
 * failure — a phone that cannot have a queue should not be asked
 * again on every segment. Which makes the two browsers two module
 * graphs rather than two variables, and `resetModules` is how a test
 * gets the second one.
 */
async function loadSink(withQueue: boolean): Promise<Sink> {
  vi.resetModules();
  queued.length = 0;
  asked.length = 0;
  (globalThis as { window?: unknown }).window = withQueue ? {
    indexedDB: {},
    TakeQueue: {
      put: (record: Queued) => { queued.push(record); return Promise.resolve(); },
      drain: () => Promise.resolve({ sent: 0, held: 0, dead: 0 }),
      pending: () => Promise.resolve(0),
      broken: () => Promise.resolve(0),
      forget: () => Promise.resolve(),
    },
  } : { /* Private browsing: no IndexedDB, so no durable queue. [U-19] */ };
  globalThis.fetch = ((url: string, init: { method: string }) => {
    asked.push({ url: String(url), method: init?.method ?? 'GET' });
    return Promise.resolve(new Response(JSON.stringify({ submissionId: 'sub_new' }),
      { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return (await import('../../app/take/[link]/takeSink.js')).takeSink;
}

const blob = () => new Blob(['bytes']);

describe('a sink knows which camera it is', () => {
  let takeSink: Sink;
  beforeEach(async () => { takeSink = await loadSink(true); });

  /*
   * THE PHONE, WHICH PASSES NOTHING. One argument absent, and what
   * is queued has no track on it at all — the same row a build
   * before tracks existed would have written.
   */
  it('queues a phone’s segment with no track', async () => {
    const sink = takeSink('req_x.secret', () => undefined);
    await sink.chunk('sub_one', 3, blob());
    expect(queued).toHaveLength(1);
    expect(queued[0]!.link).toBe('req_x.secret');
    expect(queued[0]!.submissionId).toBe('sub_one');
    expect(queued[0]!.index).toBe(3);
    expect(queued[0]!.track).toBe(0);
  });

  it('queues a second camera’s segment under its own track', async () => {
    const sink = takeSink('req_x.secret', () => undefined, 2);
    await sink.chunk('sub_one', 3, blob());
    expect(queued[0]!.track).toBe(2);
    expect(queued[0]!.submissionId).toBe('sub_one');
  });

  /*
   * AND THE ANGLE IS NAMED IN WHAT IT HANDS BACK, so a page holding
   * four sinks can build the list the send needs without keeping a
   * second record of which was which.
   */
  it('says which angle reported, and says nothing for one camera', async () => {
    const said: { track?: number }[] = [];
    const alone = takeSink('req_x.secret', (_id, spec) => said.push(spec));
    const second = takeSink('req_x.secret', (_id, spec) => said.push(spec), 1);
    const measured = { hintSamples: 480, elapsedSamples: 96000, latencySamples: 12 };
    await alone.finish('sub_one', measured);
    await second.finish('sub_one', measured);
    expect(said[0]!.track).toBeUndefined();
    expect(said[1]!.track).toBe(1);
  });
});

describe('the fallback path carries it too', () => {
  /*
   * A PHONE THAT CANNOT HAVE A QUEUE STILL RECORDS — private
   * browsing has no IndexedDB — and the direct upload is the one
   * place a track is easiest to forget, because it is the path
   * nobody is looking at. [U-19]
   */
  let takeSink: Sink;
  beforeEach(async () => { takeSink = await loadSink(false); });

  async function direct(track?: number): Promise<string> {
    const sink = takeSink('req_x.secret', () => undefined, track);
    await sink.chunk('sub_one', 3, blob());
    /* Nothing was queued, because there was nothing to queue into. */
    expect(queued).toHaveLength(0);
    return asked.at(-1)!.url;
  }

  it('posts a phone’s segment to the URL it always posted to', async () => {
    expect(await direct()).toBe('/api/take/req_x.secret/submissions/sub_one?index=3');
  });

  it('names the camera where there is more than one', async () => {
    expect(await direct(2))
      .toBe('/api/take/req_x.secret/submissions/sub_one?index=3&track=2');
  });
});

/* ------------------------------------------------------------------ *
 *  THE SHELL THAT CARRIES THE QUEUE.
 * ------------------------------------------------------------------ */

describe('the installed app receives the queue it is tested with', () => {
  /*
   * A FILE IN THE SHELL LIST IS A FILE THE PHONE HAS A COPY OF.
   * `queue.js` is cached by the service worker at install, so a
   * phone with the Take App on its home screen goes on running the
   * queue it installed with no matter what this repository learns —
   * and B-2 changed that file. Changing it without changing the
   * cache name is changing a file nobody receives.
   *
   * SO THE SHELL IS HASHED AND THE HASH IS WRITTEN DOWN. Not the
   * version compared against itself, which would be arithmetic
   * [C-46]: the CONTENT compared against a number a person had to
   * type. When this fails, the shell has changed — bump `SHELL` in
   * `public/take-sw.js` and put the new hash here, in that order.
   */
  it('has a cache name that was bumped when the shell changed', () => {
    const worker = readFileSync(join(ROOT, 'public', 'take-sw.js'), 'utf8');
    const named = /const SHELL_URLS = \[([^\]]*)\]/.exec(worker);
    const files = [...(named?.[1] ?? '').matchAll(/'([^']+)'/g)].map((one) => one[1]!);
    expect(files).toEqual(['/take-app/queue.js']);

    const shell = createHash('sha256');
    for (const file of files) shell.update(readFileSync(join(ROOT, 'public', file)));
    expect(shell.digest('hex').slice(0, 12)).toBe(SHELL_HASH);
    expect(worker).toContain(`const SHELL = '${SHELL_VERSION}';`);
  });
});

/** The shell as it stands, and the cache name serving it. */
const SHELL_HASH = '55d16beb9d20';
const SHELL_VERSION = 'balancevid-take-shell-v2';
