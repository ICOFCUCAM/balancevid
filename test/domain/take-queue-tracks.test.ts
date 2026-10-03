/**
 * The upload queue, run rather than read.
 *   [TAKE-DESKTOP B-2; TAKE-APP T13a; Doctrine U-06, D-19]
 *
 * `public/take-app/queue.js` is the one piece of this product that
 * stands between a performer's bytes and a hole in the middle of
 * their take, and until now every test of it was a test of its
 * source text. That was enough while the question was "does it
 * check the response" — a question a reader can answer.
 *
 * B-2 ASKS A QUESTION A READER CANNOT ANSWER. A capture station
 * uploads four cameras under one submission id, and the thing that
 * must not happen is camera 2's fourth segment landing on camera
 * 1's fourth segment: a take with another camera's bytes spliced
 * into the middle of it, of a plausible length, that nobody can
 * tell from a good one until they watch it. Whether that happens is
 * a fact about a STORE, and so a store is what these tests give it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { piecePath } from '../../shared/src/submit.js';
import { type LittleScope, littleStore } from '../helpers/littleStore.js';

const SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'public', 'take-app', 'queue.js'), 'utf8');

let scope: LittleScope;
let rows: () => { key: string; [field: string]: unknown }[];
let asked: string[];
let answer: { ok: boolean; status: number };

/** Load the real file, exactly as the page and the worker load it. */
function load(): NonNullable<LittleScope['TakeQueue']> {
  const store = littleStore();
  rows = store.rows;
  asked = [];
  answer = { ok: true, status: 202 };
  scope = {
    indexedDB: store.indexedDB,
    fetch: (url) => { asked.push(url); return Promise.resolve(answer); },
  };
  /*
   * `(function attach(scope) { … }(self))` — so `self` is what has to
   * be in place, and the file is otherwise untouched. A test that
   * edited the source to make it loadable would be testing an edit.
   */
  new Function('self', SOURCE)(scope);
  return scope.TakeQueue!;
}

let queue: NonNullable<LittleScope['TakeQueue']>;
beforeEach(() => { queue = load(); });

const put = (index: number, track?: number, submissionId = 'sub_one') =>
  queue.put({
    link: 'req_x.secret', submissionId, index, blob: `${track ?? 0}:${index}`,
    ...(track === undefined ? {} : { track }),
  });

describe('a second camera does not land on the first', () => {
  /*
   * THE WHOLE OF THE STAGE, IN ONE ASSERTION. Two cameras, the same
   * segment number, under the same submission: two rows, with both
   * cameras' bytes still in the queue. Without the track in the key
   * this is one row and one camera's performance.
   */
  it('keeps both cameras’ fourth segment', async () => {
    await put(4, 0);
    await put(4, 1);
    expect(rows()).toHaveLength(2);
    expect(rows().map((row) => row.blob).sort()).toEqual(['0:4', '1:4']);
  });

  /*
   * AND A PHONE'S KEY DID NOT MOVE. A recording that was mid-flight
   * when this file was replaced has rows in IndexedDB under the old
   * key; they must still drain, and still be found by `pending` and
   * `forget`, which find them by that key's shape.
   */
  it('leaves track 0 under the key it always had', async () => {
    await put(4);
    expect(rows()[0]!.key).toBe('sub_one#000004');
    expect(queue.keyOf('sub_one', 4)).toBe('sub_one#000004');
    expect(queue.keyOf('sub_one', 4, 0)).toBe('sub_one#000004');
    /* Zero-padded, so a plain sort is the recording's own order. */
    expect(queue.keyOf('sub_one', 4, 2)).toBe('sub_one#t2#000004');
  });

  /* The same segment of the same camera is still one row. */
  it('replaces a segment it already holds', async () => {
    await put(4, 1);
    await put(4, 1);
    expect(rows()).toHaveLength(1);
  });
});

describe('what the queue sends', () => {
  /*
   * THE ONE SPELLING THE QUEUE CANNOT IMPORT.  [T-5, D-19]
   *
   * `shared/src/submit.ts` owns these URLs now, because the
   * desktop capture station posts to the same route and a path
   * written out at each end is a path that disagrees with itself
   * the first time either changes. The browser sink imports it;
   * this file cannot — it is a classic script loaded by
   * `importScripts` and by a `<script>` tag, which is the
   * decision that lets the page and the service worker share one
   * queue.
   *
   * SO THE COPY IS CHECKED RATHER THAN TOLERATED. A duplication
   * that a test compares against its source is a duplication
   * that cannot drift; one that nothing compares is how three
   * clients end up posting to two URLs.
   */
  it('posts where the shared protocol says, for every track', async () => {
    for (const track of [0, 1, 7]) {
      await put(5, track);
    }
    await queue.drain();
    expect(asked).toEqual([
      piecePath('req_x.secret', 'sub_one', 5, 0),
      piecePath('req_x.secret', 'sub_one', 5, 1),
      piecePath('req_x.secret', 'sub_one', 5, 7),
    ]);
  });

  /*
   * TRACK 0 SENDS THE URL IT HAS ALWAYS SENT, down to the query —
   * including every row written before tracks existed, which has no
   * `track` field on it at all.
   */
  it('asks for no track where there is one camera', async () => {
    await put(0);
    await queue.drain();
    expect(asked).toEqual(['/api/take/req_x.secret/submissions/sub_one?index=0']);
  });

  it('names the camera where there is more than one', async () => {
    await put(0, 2);
    await queue.drain();
    expect(asked).toEqual(['/api/take/req_x.secret/submissions/sub_one?index=0&track=2']);
  });

  /*
   * DRAINED OLDEST FIRST AND ONE AT A TIME. Four parallel uploads
   * from a phone on a weak connection is how all four time out.
   */
  it('sends every angle of a capture, in key order', async () => {
    await put(1, 1);
    await put(0, 0);
    await put(0, 1);
    const verdict = await queue.drain();
    expect(verdict.sent).toBe(3);
    expect(asked).toEqual([
      '/api/take/req_x.secret/submissions/sub_one?index=0',
      '/api/take/req_x.secret/submissions/sub_one?index=0&track=1',
      '/api/take/req_x.secret/submissions/sub_one?index=1&track=1',
    ]);
    expect(rows()).toHaveLength(0);
  });
});

describe('what the performer is held on', () => {
  /*
   * SEND IS A JOIN OF WHAT IS THERE, so `settle` holds the Send
   * button until nothing is outstanding — and a capture is not sent
   * until ALL of it is there. Counting by submission rather than by
   * track is what makes that true without the page knowing there are
   * tracks at all.
   */
  it('counts every angle still waiting as this recording’s', async () => {
    await put(0, 0);
    await put(0, 1);
    await put(0, 2);
    expect(await queue.pending('sub_one')).toBe(3);
    expect(await queue.pending('sub_other')).toBe(0);
  });

  /*
   * A SEGMENT THAT CAN NEVER ARRIVE IS NOT A SLOW ONE: the performer
   * is told the recording is incomplete rather than watching it
   * spin. A refusal on one camera is the capture's refusal.
   */
  it('counts a refused angle as broken, not outstanding', async () => {
    await put(0, 1);
    answer = { ok: false, status: 400 };
    const verdict = await queue.drain();
    expect(verdict.dead).toBe(1);
    expect(await queue.broken('sub_one')).toBe(1);
    expect(await queue.pending('sub_one')).toBe(0);
  });

  /* And a bad connection is still worth repeating. */
  it('holds an angle the network did not answer for', async () => {
    await put(0, 1);
    answer = { ok: false, status: 503 };
    expect((await queue.drain()).held).toBe(1);
    expect(await queue.pending('sub_one')).toBe(1);
  });

  /*
   * "Take 3 doesn't have to reach the server at all if they delete
   * it locally." Deleting a capture deletes all of it, for the same
   * reason the server's own DELETE does: a performer throwing away a
   * take is not throwing away three quarters of one.
   */
  it('throws every angle of a deleted recording away', async () => {
    await put(0, 0);
    await put(0, 1);
    await put(0, 0, 'sub_kept');
    await queue.forget('sub_one');
    expect(rows().map((row) => row.submissionId)).toEqual(['sub_kept']);
  });
});
