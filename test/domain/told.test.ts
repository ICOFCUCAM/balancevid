/**
 * The loop closes on the participant's own device.
 *   [GO-VIRAL V-7; Doctrine D-03, D-25, U-19]
 *
 * > **Judged on:** *"A phone that entered a campaign and was closed
 * > is told the result without the installation ever holding
 * > anything that identifies its owner; and a device that declined
 * > notifications loses nothing but the notification."*
 *
 * BOTH CLAUSES ARE ABOUT WHAT IS *NOT* STORED, which is the kind
 * that rots quietly. The first is held by a test that reads the
 * request document after the whole exchange; the second by running
 * the worker with no permission and watching it still record what
 * it learned.
 *
 * THE WORKER IS RUN, NOT READ. Whether a device is notified twice
 * about one piece of news is a fact about a store and a fetch, and
 * a source-text assertion that it compares a word cannot see the
 * comparison happen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { deviceSays, outcomeFor } from '../../src/domain/participation.js';
import type { ParticipationRequest, RequestState } from '../../src/domain/participation.js';
import { type LittleScope, littleStore } from '../helpers/littleStore.js';

const ROOT = join(import.meta.dirname, '..', '..');
const QUEUE = readFileSync(join(ROOT, 'public', 'take-app', 'queue.js'), 'utf8');
const WORKER = readFileSync(join(ROOT, 'public', 'take-sw.js'), 'utf8');

/* ------------------------------------------------------------------ *
 *  WHAT HAPPENED TO IT, IN ONE LINE.
 * ------------------------------------------------------------------ */

const request = (state: RequestState, says?: string): ParticipationRequest => ({
  id: 'req_one',
  holder: { kind: 'performance', id: 'perf_one' },
  assignment: { kind: 'performance', asks: 'sing' },
  allowed: { video: true, takes: 3 },
  token: 'a-token-long-enough-to-be-a-credential',
  state,
  createdAt: '2026-06-01T09:00:00.000Z',
  history: [{ state, at: '2026-06-01T09:00:00.000Z', ...(says ? { says } : {}) }],
} as unknown as ParticipationRequest);

describe('what the holder of a link is told', () => {
  it('is nothing while nobody has decided', () => {
    for (const state of ['created', 'sent', 'opened', 'submitted', 'received',
      'reviewed'] as RequestState[]) {
      expect(outcomeFor(request(state)).state, state).toBe('waiting');
    }
    expect(outcomeFor(request('submitted')).says).toBe('Nothing yet.');
  });

  it('is that their take was used', () => {
    expect(outcomeFor(request('accepted'))).toEqual({
      state: 'accepted', says: 'Your take was used.',
    });
    /* And attached, which is the only state after it. */
    expect(outcomeFor(request('attached')).state).toBe('accepted');
  });

  /* And a decline says why, where somebody said. [G8] */
  it('is that it was passed over, with the reason', () => {
    expect(outcomeFor(request('rejected')).says).toBe('Not this time.');
    expect(outcomeFor(request('rejected', 'Recorded indoors.')).says)
      .toBe('Not this time — Recorded indoors.');
    expect(outcomeFor(request('rejected', 'Recorded indoors.')).state)
      .toBe('passed');
  });

  /*
   * THE RESULT OUTRANKS THE ACCEPTANCE, and the fixture is the one
   * where they disagree: somebody whose take was used AND who came
   * second. A device holds one word and a notification carries one
   * line; the one they entered for is where they came.
   */
  it('is where they came, over everything else', () => {
    const both = outcomeFor(request('accepted'), { place: 2, of: 11 });
    expect(both.state).toBe('result');
    expect(both.says).toBe('The results are in — you came 2nd of 11.');
    expect(both.place).toBe(2);
    expect(both.of).toBe(11);

    expect(outcomeFor(request('rejected', 'no'), { place: 7, of: 11 }).state)
      .toBe('result');
  });

  /*
   * 1ST, 2ND, 3RD — AND THE TEENS, which every implementation of
   * this gets wrong. A fixture that stopped at 3 would pass a
   * version that said *11st*.
   */
  it('writes the place as a person reads it', () => {
    const at = (place: number) =>
      outcomeFor(request('submitted'), { place, of: 100 }).says;
    expect(at(1)).toContain('1st');
    expect(at(2)).toContain('2nd');
    expect(at(3)).toContain('3rd');
    expect(at(4)).toContain('4th');
    expect(at(11)).toContain('11th');
    expect(at(12)).toContain('12th');
    expect(at(13)).toContain('13th');
    expect(at(21)).toContain('21st');
    expect(at(22)).toContain('22nd');
    expect(at(23)).toContain('23rd');
    expect(at(111)).toContain('111th');
  });
});

/* ------------------------------------------------------------------ *
 *  THE DEVICE'S OWN LIST, RUN.
 * ------------------------------------------------------------------ */

describe('the links a device is waiting on', () => {
  let scope: LittleScope;
  let watch: NonNullable<LittleScope['TakeWatch']>;

  beforeEach(() => {
    const store = littleStore();
    scope = {
      indexedDB: store.indexedDB,
      fetch: () => Promise.resolve({ ok: true, status: 200 }),
    };
    new Function('self', QUEUE)(scope);
    watch = scope.TakeWatch!;
  });

  it('is empty until something is put in it', async () => {
    expect(await watch.watching()).toEqual([]);
    expect(await watch.saw('req_x.secret')).toBeNull();
  });

  it('remembers a link and what it was last told', async () => {
    await watch.watch('req_x.secret', 'waiting');
    expect(await watch.saw('req_x.secret')).toBe('waiting');
    await watch.watch('req_x.secret', 'accepted');
    expect(await watch.saw('req_x.secret')).toBe('accepted');
    expect(await watch.watching()).toHaveLength(1);
  });

  it('holds more than one, and forgets one at a time', async () => {
    await watch.watch('req_a.one', 'waiting');
    await watch.watch('req_b.two', 'waiting');
    expect((await watch.watching()).map((one) => one.link))
      .toEqual(['req_a.one', 'req_b.two']);
    await watch.unwatch('req_a.one');
    expect((await watch.watching()).map((one) => one.link)).toEqual(['req_b.two']);
    expect(await watch.saw('req_a.one')).toBeNull();
  });

  /*
   * AND THE QUEUE IS STILL THE QUEUE. Both stores live in one
   * database because the page and the worker both open it — and a
   * store that mixed them would have the worker reading a
   * performer's segments as links. [D-19]
   */
  it('shares the database with the upload queue without mixing', async () => {
    await scope.TakeQueue!.put({
      link: 'req_x.secret', submissionId: 'sub_one', index: 0, blob: 'bytes',
    });
    await watch.watch('req_x.secret', 'waiting');
    expect(await scope.TakeQueue!.pending('sub_one')).toBe(1);
    expect(await watch.watching()).toHaveLength(1);
    expect((await watch.watching())[0]).not.toHaveProperty('submissionId');
  });
});

/* ------------------------------------------------------------------ *
 *  THE WORKER, RUN.
 * ------------------------------------------------------------------ */

/** Enough of a service worker's world to run the real file in. */
function aWorker(options: { permission?: string } = {}) {
  const store = littleStore();
  const listeners = new Map<string, (event: unknown) => void>();
  const asked: string[] = [];
  const shown: { title: string; body: string }[] = [];
  let answer: { status: number; body: unknown } = { status: 200, body: {} };

  const scope: Record<string, unknown> = {
    indexedDB: store.indexedDB,
    location: { origin: 'https://studio.example' },
    importScripts: () => { /* the page loads it; see below. */ },
    addEventListener: (name: string, run: (event: unknown) => void) => {
      listeners.set(name, run);
    },
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
    caches: {
      open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => undefined }),
      keys: () => Promise.resolve([]),
      match: () => Promise.resolve(undefined),
    },
    fetch: (url: string) => {
      asked.push(url);
      return Promise.resolve({
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        json: () => Promise.resolve(answer.body),
      });
    },
    registration: {
      showNotification: (title: string, init: { body: string }) => {
        shown.push({ title, body: init.body });
        return Promise.resolve();
      },
    },
    ...(options.permission
      ? { Notification: { permission: options.permission } } : {}),
  };

  /*
   * THE WORKER'S OWN GLOBALS ARE PASSED IN RATHER THAN PATCHED
   * ONTO THE PROCESS. `importScripts`, `caches` and `fetch` are
   * bare identifiers in a service worker, so they arrive as
   * parameters — which also means this test cannot accidentally
   * reach the real network, and a file edited to be loadable
   * would be a file this does not test. [`take-queue-tracks`]
   */
  new Function('self', QUEUE)(scope);
  new Function('self', 'importScripts', 'caches', 'fetch', WORKER)(
    scope, scope['importScripts'], scope['caches'], scope['fetch']);

  return {
    scope,
    watch: scope['TakeWatch'] as NonNullable<LittleScope['TakeWatch']>,
    asked,
    shown,
    says: (status: number, body: unknown) => { answer = { status, body }; },
    fire: async (name: string, event: Record<string, unknown>) => {
      const run = listeners.get(name);
      if (!run) throw new Error(`no ${name} listener`);
      const waited: Promise<unknown>[] = [];
      run({ ...event, waitUntil: (p: Promise<unknown>) => waited.push(p) });
      await Promise.all(waited);
    },
  };
}

const told = (outcome: unknown) => ({ request: { outcome } });

describe('the worker asking on the device\'s behalf', () => {
  it('asks with the link, and about nothing it is not watching', async () => {
    const it0 = aWorker({ permission: 'granted' });
    it0.says(200, told({ state: 'accepted', says: 'Your take was used.' }));
    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect(it0.asked).toEqual([]);

    await it0.watch.watch('req_x.secret', 'waiting');
    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect(it0.asked).toEqual(['/api/take/req_x.secret']);
  });

  it('ignores a tag that is not its own', async () => {
    const it0 = aWorker({ permission: 'granted' });
    await it0.watch.watch('req_x.secret', 'waiting');
    await it0.fire('periodicsync', { tag: 'take-upload' }).catch(() => undefined);
    expect(it0.asked).toEqual([]);
  });

  /*
   * THE NEWS, ONCE. A worker that notified on every wake would be a
   * phone buzzing every day about a decision taken on Tuesday —
   * which is why the device writes down what it was told.
   */
  it('shows the news once and not again', async () => {
    const it0 = aWorker({ permission: 'granted' });
    await it0.watch.watch('req_x.secret', 'waiting');
    it0.says(200, told({ state: 'result', says: 'The results are in — you came 2nd of 11.' }));

    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect(it0.shown).toEqual([
      { title: 'Your take', body: 'The results are in — you came 2nd of 11.' },
    ]);
    expect(await it0.watch.saw('req_x.secret')).toBe('result');

    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect(it0.shown).toHaveLength(1);
  });

  it('says nothing about news the device already had', async () => {
    const it0 = aWorker({ permission: 'granted' });
    await it0.watch.watch('req_x.secret', 'accepted');
    it0.says(200, told({ state: 'accepted', says: 'Your take was used.' }));
    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect(it0.shown).toEqual([]);
  });

  /*
   * > *"A device that declined notifications loses nothing but the
   * > notification."*
   *
   * SO THE WORD IS WRITTEN DOWN FIRST AND THE NOTIFICATION IS
   * SECOND. A device with no permission still learns, still
   * records, and still stops asking about news it has — and the
   * page says the same sentence the moment it is opened.
   */
  it('records what it learned even where it may not show it', async () => {
    for (const permission of ['denied', 'default', undefined]) {
      const it0 = aWorker(permission ? { permission } : {});
      await it0.watch.watch('req_x.secret', 'waiting');
      it0.says(200, told({ state: 'passed', says: 'Not this time.' }));
      await it0.fire('periodicsync', { tag: 'take-watch' });
      expect(it0.shown, String(permission)).toEqual([]);
      expect(await it0.watch.saw('req_x.secret'), String(permission)).toBe('passed');
    }
  });

  /*
   * A LINK THAT IS NO LONGER OPEN STOPS BEING WATCHED. Rotated,
   * expired, attached: there is nothing more to hear and no reason
   * to keep asking. A network failure is not that.
   */
  it('stops watching a link the server no longer opens', async () => {
    const it0 = aWorker({ permission: 'granted' });
    await it0.watch.watch('req_x.secret', 'waiting');
    it0.says(404, { error: 'that link is not open' });
    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect(await it0.watch.watching()).toEqual([]);
    expect(it0.shown).toEqual([]);
  });

  it('keeps watching through a failure that is not an answer', async () => {
    const it0 = aWorker({ permission: 'granted' });
    await it0.watch.watch('req_x.secret', 'waiting');
    it0.says(503, {});
    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect((await it0.watch.watching()).map((one) => one.link))
      .toEqual(['req_x.secret']);
    expect(it0.shown).toEqual([]);
  });

  /* And an answer with nothing to say is not news. */
  it('says nothing about a request nobody has decided', async () => {
    const it0 = aWorker({ permission: 'granted' });
    await it0.watch.watch('req_x.secret', 'waiting');
    it0.says(200, { request: { id: 'req_one', state: 'submitted' } });
    await it0.fire('periodicsync', { tag: 'take-watch' });
    expect(it0.shown).toEqual([]);
    expect(await it0.watch.saw('req_x.secret')).toBe('waiting');
  });

  /* Background Sync, where there is no periodic sync, is the same path. */
  it('answers a one-off sync the same way', async () => {
    const it0 = aWorker({ permission: 'granted' });
    await it0.watch.watch('req_x.secret', 'waiting');
    it0.says(200, told({ state: 'accepted', says: 'Your take was used.' }));
    await it0.fire('sync', { tag: 'take-watch' });
    expect(it0.shown).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 *  WHAT RECORDED IT, AND WHAT THAT MAY SAY.
 * ------------------------------------------------------------------ */

describe('what the installation writes down about a device', () => {
  /*
   * FOUND WHILE CHECKING V-7'S OWN CLAIM IN A BROWSER. The Take
   * App filled `Submission.device` with `navigator.userAgent`, so
   * the request document of somebody who was asked for no account
   * held eighty characters of build string, forever. The field
   * exists for one sentence — *"a producer with twenty
   * submissions and one that is out of sync needs to know which
   * device"* — and the browser and the platform answer it.
   */
  it('reduces a user agent to the browser and the platform', () => {
    expect(deviceSays('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36'
      + ' (KHTML, like Gecko) Chrome/153.0.8010.12 Mobile Safari/537.3'))
      .toBe('Chrome on Android');
    expect(deviceSays('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      + ' AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148'
      + ' Safari/604.1')).toBe('Safari on iOS');
    expect(deviceSays('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0)'
      + ' Gecko/20100101 Firefox/121.0')).toBe('Firefox on Windows');
  });

  /*
   * AND THE SPECIFIC BROWSERS BEFORE THE GENERAL ONES, because
   * every one of them also claims to be Safari or Chrome
   * somewhere in the string. A fixture of only Chrome and Safari
   * would pass an order that reported Edge as Chrome.
   */
  it('names the browser that is actually there', () => {
    const mac = ' (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      + ' (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    expect(deviceSays(`Mozilla/5.0${mac} Edg/120.0`)).toBe('Edge on a Mac');
    expect(deviceSays(`Mozilla/5.0${mac} OPR/106.0`)).toBe('Opera on a Mac');
    expect(deviceSays(`Mozilla/5.0${mac}`)).toBe('Chrome on a Mac');
    expect(deviceSays('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
      + ' SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36'))
      .toBe('Samsung Internet on Android');
    expect(deviceSays('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      + ' AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1'))
      .toBe('Safari on iOS');
  });

  /*
   * AND A CAMERA'S NAME IS LEFT ALONE. A capture station sends
   * one of these per angle — *"the camera is the answer to which
   * one is out"* — and reducing *Camera 2* to a browser would be
   * this function deciding it knew better than the thing that
   * measured. [B-2]
   */
  it('leaves anything that is not a user agent as it was', () => {
    expect(deviceSays('Camera 2')).toBe('Camera 2');
    expect(deviceSays('Hall · front')).toBe('Hall · front');
    expect(deviceSays('  a phone  ')).toBe('a phone');
    /* Still bounded, because it arrives from somewhere else. */
    expect(deviceSays('x'.repeat(300))).toHaveLength(120);
  });

  /* And something shaped like a user agent it does not know. */
  it('says a browser where it cannot tell which', () => {
    expect(deviceSays('Mozilla/5.0 (Unknown) SomeEngine/1.0'))
      .toBe('a browser');
    expect(deviceSays('Mozilla/5.0 (X11; CrOS x86_64 1.0) AppleWebKit/537.36'
      + ' (KHTML, like Gecko) Chrome/120.0 Safari/537.36'))
      .toBe('Chrome on ChromeOS');
  });
});
