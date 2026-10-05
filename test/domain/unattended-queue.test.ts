/**
 * A spinner with nothing behind it.  [Doctrine D-13, D-21, U-19, U-23]
 *
 * THE FAULT THESE ANSWER, reported from a running installation:
 *
 * > *"music get stuck in studio 2 and show preparing and never
 * > complete preparing"*
 *
 * It was not stuck. Studio Two says *"Preparing the song…"* until the
 * master has been normalised and measured — `master.durationSamples
 * > 0` — and that is a JOB, run by the WORKER, which is a separate
 * process from the web tier exactly as the playout engine is. On an
 * installation where nothing is draining the queue the song is never
 * prepared, and the one word the room had for it was the one word
 * that could never come true.
 *
 * `serve.sh` has said so in its own header all along:
 *
 * > *"a container running a web tier with no worker looks healthy and
 * > quietly accepts recordings it will never render"*
 *
 * And it looked healthy. The same installation also showed no playout
 * engine — two of the three background processes absent, the web tier
 * perfect — which is one cause, not two.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { NO_WORKER, UNATTENDED_MS, unattended } from '../../src/domain/health.js';

const NOW = Date.parse('2026-10-06T01:13:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const pending = (olderBy: number) =>
  ({ state: 'pending', createdAt: ago(olderBy) });
const running = (olderBy: number) =>
  ({ state: 'running', createdAt: ago(olderBy), startedAt: ago(olderBy - 1000) });

describe('nothing is draining the queue', () => {
  it('says nothing while the queue is empty', () => {
    expect(unattended([], NOW)).toBe(false);
  });

  /*
   * THE WORKER POLLS EVERY 400ms, so a job unclaimed after half a
   * minute is seventy-five polls late. Generous on purpose: this
   * sentence calls an installation misconfigured.
   */
  it('gives a worker time before it says there is none', () => {
    expect(unattended([pending(1_000)], NOW)).toBe(false);
    expect(unattended([pending(UNATTENDED_MS)], NOW)).toBe(false);
    expect(unattended([pending(UNATTENDED_MS + 1)], NOW)).toBe(true);
  });

  /*
   * NEVER CLAIMED IS THE SIGNAL, NOT "WAITING A LONG TIME". A worker
   * chewing through a long render leaves everything behind it pending
   * for minutes, and that is a queue WORKING. What cannot happen
   * while anything is consuming is a job that has never been started
   * going stale — claiming takes one poll.
   */
  it('stays quiet behind a long render', () => {
    expect(unattended([
      running(20 * 60_000),
      pending(10 * 60_000),
      pending(9 * 60_000),
    ], NOW)).toBe(false);
  });

  /*
   * AND A JOB THAT WAS STARTED IS NOT EVIDENCE OF NO WORKER, even
   * once it is no longer running: something claimed it.
   */
  it('does not count a job that was picked up and finished', () => {
    expect(unattended([
      { state: 'done', createdAt: ago(60 * 60_000), startedAt: ago(59 * 60_000) },
    ], NOW)).toBe(false);
    /* Nor one that was claimed and left behind by a worker that died
       — that is a different fault with a different answer, and this
       sentence must not claim it. */
    expect(unattended([
      { state: 'pending', createdAt: ago(60 * 60_000), startedAt: ago(59 * 60_000) },
    ], NOW)).toBe(false);
  });

  it('says so when one old job has never been touched', () => {
    expect(unattended([
      { state: 'done', createdAt: ago(60 * 60_000), startedAt: ago(59 * 60_000) },
      pending(5 * 60_000),
    ], NOW)).toBe(true);
  });

  it('names the process and how to start it', () => {
    expect(NO_WORKER).toMatch(/no worker process is running/);
    expect(NO_WORKER).toMatch(/ROLE=all or ROLE=worker/);
    expect(NO_WORKER).toMatch(/separate process/);
  });
});

describe('where the answer is asked and shown', () => {
  const code = (path: string) => readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  /*
   * THE WHOLE QUEUE, NOT THIS DOCUMENT'S. A worker busy with somebody
   * else's render leaves this document with a pending job and nothing
   * of this document's running — which, judged on one document, is
   * indistinguishable from no worker at all. [U-02]
   */
  it('asks the whole queue and not one document’s', () => {
    const route = code('app/api/performances/[id]/route.ts');
    expect(route).toMatch(/listJobs\(id\)/);
    expect(route).toMatch(/listJobs\(\)/);
    expect(route).toMatch(/unattended: unattended\(everything, Date\.now\(\)\)/);
  });

  it('is what the room shows instead of spinning', () => {
    const room = code('app/p/[id]/PerformanceStudio.tsx');
    expect(room).toMatch(/setUnattended\(Boolean\(said\.unattended\)\)/);
    expect(room).toMatch(/Nothing is preparing it/);
    /* And the full sentence is there to be read, not just the three
       words that fit in a header. */
    expect(room).toMatch(/NO_WORKER/);
  });

  /* The song's own length still wins once it is known: a measured
     master is not a fault however the queue is doing. */
  it('still shows the length once the song is ready', () => {
    const room = code('app/p/[id]/PerformanceStudio.tsx');
    expect(room).toMatch(/ready \? songLength/);
    expect(room).toMatch(/!ready && unattended/);
  });
});
