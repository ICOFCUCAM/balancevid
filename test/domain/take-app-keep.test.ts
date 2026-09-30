/**
 * Keep, send, delete — the performer's three decisions.
 *   [TAKE-APP T4, T5; TIMELINE B14c; D-25, U-06]
 *
 * "Take 3 doesn't have to reach the server at all if they delete it
 * locally."
 *
 * THE TENSION IN THAT SENTENCE IS REAL AND IS RESOLVED RATHER THAN
 * IGNORED. A take's SEGMENTS are uploaded as they close, because a
 * phone that loses a call mid-song must not lose the performance with
 * it (U-06). What has not happened is the SUBMISSION: nothing crosses
 * to the producer until the performer sends it, and a take they
 * delete is never assembled.
 *
 * AND THE DISAGREEMENT THIS FILE WAS WRITTEN AFTER FINDING: the Take
 * App's own comment said "a finished recording is KEPT, not sent —
 * `Submit` is what crosses to the producer", and two files away the
 * sink sent it at the stop, with no Submit anywhere and every take
 * marked `sent: true`. Two descriptions of one behaviour, both in the
 * codebase, one of them false.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dropTake, sendTake, takeSink, type KeptSpec } from '../../app/take/[link]/takeSink.js';
import { mayBePublic } from '../../src/auth/policy.js';

const LINK = 'req_abc.secret-token';
const SPEC: KeptSpec = {
  hintSamples: 4800, elapsedSamples: 240000, latencySamples: 0,
};

/** Every request a sink or a call made, in order. */
function recorder(answer: (url: string, init: RequestInit) => Response) {
  const sent: { url: string; method: string; body?: unknown }[] = [];
  const send = (async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    sent.push({ url: String(url), method: init.method ?? 'GET', body });
    return answer(String(url), init);
  }) as unknown as typeof fetch;
  return { sent, send };
}

const ok = (payload: unknown = {}, status = 200) =>
  new Response(JSON.stringify(payload), { status });

describe('stopping is not sending', () => {
  /*
   * THE WHOLE POINT. If the sink sends at the stop, there is nothing
   * for Send to do and nothing for Delete to prevent — which is what
   * the first version did while claiming otherwise.
   */
  it('hands the recording back instead of submitting it', async () => {
    const kept: [string, KeptSpec][] = [];
    const made = recorder(() => ok());
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    try {
      const sink = takeSink(LINK, (id, spec) => { kept.push([id, spec]); });
      await sink.finish('sub_one', SPEC);
    } finally { globalThis.fetch = original; }

    expect(kept).toHaveLength(1);
    expect(kept[0]![0]).toBe('sub_one');
    expect(kept[0]![1]).toMatchObject(SPEC);
    /* And nothing was sent — no PUT at all. */
    expect(made.sent).toEqual([]);
  });

  /* The segments still go up as they close: a dropped call must not
     cost a good take. [U-06] */
  it('still uploads the segments as they close', async () => {
    const made = recorder(() => ok({ submissionId: 'sub_one' }, 201));
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    try {
      const sink = takeSink(LINK, () => undefined);
      expect(await sink.begin({
        label: 'x', environment: { kind: 'original' },
        offsetSamples: 0, method: 'measured',
      })).toBe('sub_one');
      await sink.chunk('sub_one', 2, new Blob(['x']));
    } finally { globalThis.fetch = original; }
    expect(made.sent.map((one) => `${one.method} ${one.url}`)).toEqual([
      `POST /api/take/${encodeURIComponent(LINK)}/submissions`,
      `POST /api/take/${encodeURIComponent(LINK)}/submissions/sub_one?index=2`,
    ]);
  });

  /* What recorded it travels with the recording, for a producer with
     twenty submissions and one that is out of sync. */
  it('records what the recording was made on', async () => {
    const kept: KeptSpec[] = [];
    const sink = takeSink(LINK, (_id, spec) => { kept.push(spec); });
    await sink.finish('sub_one', SPEC);
    expect(kept[0]).toHaveProperty('device');
  });
});

describe('sending one', () => {
  it('is the PUT, carrying what the phone measured', async () => {
    const made = recorder(() => ok({}, 201));
    await sendTake(LINK, 'sub_one', SPEC, made.send);
    expect(made.sent[0]?.method).toBe('PUT');
    expect(made.sent[0]?.url)
      .toBe(`/api/take/${encodeURIComponent(LINK)}/submissions/sub_one`);
    expect(made.sent[0]?.body).toEqual(SPEC);
  });

  /* The refusal the server wrote, not one this file invented: a phone
     on a train needs to know what happened. */
  it('says what the server said when it refuses', async () => {
    const made = recorder(() => ok({ error: 'that link is not open' }, 404));
    await expect(sendTake(LINK, 'sub_one', SPEC, made.send))
      .rejects.toThrow('that link is not open');
  });
});

describe('deleting one', () => {
  it('is a DELETE of the recording that is not yet a submission', async () => {
    const made = recorder(() => ok());
    await dropTake(LINK, 'sub_one', made.send);
    expect(made.sent[0]?.method).toBe('DELETE');
    expect(made.sent[0]?.url)
      .toBe(`/api/take/${encodeURIComponent(LINK)}/submissions/sub_one`);
  });

  it('says why when it is refused', async () => {
    const made = recorder(() => ok({ error: 'that take has already been sent' }, 409));
    await expect(dropTake(LINK, 'sub_one', made.send))
      .rejects.toThrow('that take has already been sent');
  });
});

describe('what a link may do', () => {
  const at = (method: string, path: string) =>
    mayBePublic(path, method);

  /*
   * FOUR VERBS, EACH ON ITS OWN PATH. A path-only allowance once
   * answered DELETE as well, and that was a real hole — which is why
   * the DELETE that a performer now needs is added as its own rule
   * rather than by loosening one. [D-25, INV-15]
   */
  it('may delete a recording of its own', () => {
    expect(at('DELETE', `/api/take/${LINK}/submissions/sub_one`)).toBe(true);
    expect(at('PUT', `/api/take/${LINK}/submissions/sub_one`)).toBe(true);
    expect(at('POST', `/api/take/${LINK}/submissions`)).toBe(true);
  });

  /* And nothing else. A link is a request, not a door. */
  it('may not delete anything a producer owns', () => {
    for (const path of [
      '/api/performances/perf_one',
      `/api/take/${LINK}`,
      `/api/take/${LINK}/submissions`,
      '/api/conversations/conv_one',
    ]) {
      expect(at('DELETE', path), path).toBe(false);
    }
  });
});

describe('the route that deletes it', () => {
  const route = readFileSync(join(
    import.meta.dirname, '..', '..', 'app', 'api', 'take', '[link]',
    'submissions', '[submissionId]', 'route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  /*
   * ONLY BEFORE IT IS A SUBMISSION. Once it has been sent it belongs
   * to the production, and what a performer may undo is their own
   * decision not yet acted on — never a producer's. [D-25]
   */
  it('refuses a recording that has already been sent', () => {
    expect(route).toMatch(
      /found\.submissions \?\? \[\]\)\.some\(\(one\) => one\.assetId === submissionId\)/);
    expect(route).toContain("fail(409, 'that take has already been sent')");
  });

  /* It reaches the segments and nothing else. */
  it('removes the segments and nothing else', () => {
    expect(route).toMatch(
      /rm\(paths\.requestChunks\(found\.id, submissionId\),\s*\n?\s*\{ recursive: true, force: true \}\)/);
    expect(route).not.toMatch(/rm\(paths\.requestAsset/);
  });

  /* An id out of a URL becomes a directory path. [INV-15] */
  it('checks the id against a shape before it touches the disk', () => {
    const body = route.slice(route.indexOf('export async function DELETE'));
    expect(body.indexOf('ID.test(submissionId)'))
      .toBeLessThan(body.indexOf('requestChunks'));
  });
});

describe('the surface it is offered on', () => {
  const app = readFileSync(join(
    import.meta.dirname, '..', '..', 'app', 'take', '[link]', 'TakeApp.tsx'),
  'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('offers Send and Delete on a kept take', () => {
    expect(app).toContain('data-testid="take-send"');
    expect(app).toContain('data-testid="take-drop"');
  });

  /* And neither on one already sent: it belongs to the production
     now. [D-25] */
  it('offers neither once it has been sent', () => {
    expect(app).toMatch(
      /one\.state === 'sent' \? \([\s\S]{0,400}data-testid="take-sent"/);
  });

  /*
   * A FAILED SEND PUTS THE BUTTON BACK. A phone on a train will fail
   * at this, and a row that goes quiet is a row the performer cannot
   * act on. [U-19]
   */
  it('puts the button back when a send fails', () => {
    expect(app).toMatch(/catch \(error\) \{\s*\n\s*mark\(one\.id, 'kept'\);/);
  });

  /* Nothing in the list is marked sent until it has been. The first
     version wrote `sent: true` at the stop. */
  it('marks a new recording kept, not sent', () => {
    expect(app).toMatch(/at: new Date\(\)\.toISOString\(\), state: 'kept',/);
    expect(app).not.toMatch(/sent: true/);
  });
});
