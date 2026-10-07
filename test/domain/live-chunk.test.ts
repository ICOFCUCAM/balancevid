/**
 * A dropped chunk is permanent, so it is worth one more try.
 *   [CHANNEL §7, §9; Doctrine D-13, D-19, D-21, U-02]
 *
 * THE RULE THIS REPLACES WAS A PRINCIPLE, NOT A MEASUREMENT.
 * `useLiveEncoder`'s header said *"there is no retry and no queue:
 * a chunk that arrives late has missed the broadcast, and
 * inserting it would corrupt a file being read right now. Live is
 * the one place in this product where 'later' means 'never'."*
 *
 * BOTH HALVES FAIL AGAINST THE SAME FILE. There has always been a
 * queue — `queue` serialises every post, and its own comment says
 * *"chunk two cannot overtake chunk one on a flaky connection.
 * Appending them out of order would splice the broadcast."* A
 * second attempt inside that chain is not an insertion. And
 * "late" has a number: the engine reads `LIVE_DELAY_MS` behind,
 * so a chunk landing two seconds after its first attempt is ten
 * seconds EARLY.
 *
 * AND THE COST OF BEING WRONG IS NOT SYMMETRIC. The clock does not
 * stop for a failed upload, so a dropped chunk is two seconds of
 * media the buffer will never hold while the broadcast ages two
 * seconds. It never comes back and it does not average out: the
 * feed is permanently further behind, for ever, per drop. A retry
 * that lands inside the delay costs the viewer nothing at all.
 */

import { describe, expect, it } from 'vitest';

import { LIVE_DELAY_MS } from '../../src/domain/playout.js';
import {
  RETRY_WINDOW_MS, failureSays, sendAgain, waitBefore, worthRepeating,
} from '../../src/domain/liveChunk.js';

describe('how long a chunk is worth retrying', () => {
  /*
   * DERIVED, NOT TYPED. A `6_000` here would outlive whatever made
   * twelve the right delay — and the two numbers only mean
   * anything in relation to each other.
   */
  it('is half the delay the engine reads behind', () => {
    expect(RETRY_WINDOW_MS).toBe(LIVE_DELAY_MS / 2);
    /* And comfortably more than one chunk, or no retry could ever
       complete before the window shut. */
    expect(RETRY_WINDOW_MS).toBeGreaterThan(2000);
  });

  /*
   * AND IT IS COMPUTED, WHICH THE VALUE CANNOT SHOW. A mutation
   * replacing the expression with `6_000` passed the assertion
   * above, and rightly: twelve halved IS six today. What the test
   * is for is the day somebody changes the delay — a typed six
   * would survive that silently and start dropping chunks the
   * viewer would still have seen. A derivation is a property of
   * the source, so the source is what is read. [U-02, D-20]
   */
  it('and is computed from it, not a number that matches it today', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const source = readFileSync('src/domain/liveChunk.ts', 'utf8');
    expect(source).toMatch(/RETRY_WINDOW_MS = LIVE_DELAY_MS \/ 2/);
  });
});

describe('whether the same bytes could land next time', () => {
  /*
   * A DROPPED CONNECTION IS THE COMMON CASE ON A PHONE, and the
   * one that recovers a second later. `fetch` rejects with no
   * status at all, so "no status" has to mean try again.
   */
  it('a connection that dropped is worth repeating', () => {
    expect(worthRepeating(undefined)).toBe(true);
  });

  it('and a server saying “not now” is', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(worthRepeating(status), String(status)).toBe(true);
    }
  });

  /*
   * A REFUSAL IS NOT. The channel has looked at this chunk and
   * declined it; the identical bytes will be declined again.
   * Retrying is WORSE than dropping here, because the chunk behind
   * waits out a window spent on something already lost.
   */
  it('but a refusal is not, however the connection is behaving', () => {
    for (const status of [400, 401, 403, 404, 413, 415, 422]) {
      expect(worthRepeating(status), String(status)).toBe(false);
    }
  });
});

describe('send it again?', () => {
  /*
   * THE WHOLE POINT, IN ONE ASSERTION. A chunk that failed a
   * moment ago, on a connection that dropped, is a chunk the
   * viewer will still see — and the old code threw it away.
   */
  it('yes, while it is young and the failure could pass', () => {
    expect(sendAgain({ ageMs: 0 })).toBe(true);
    expect(sendAgain({ ageMs: 2_000, status: 503 })).toBe(true);
    expect(sendAgain({ ageMs: RETRY_WINDOW_MS - 1 })).toBe(true);
  });

  /*
   * AND THE AGE IS FROM THE RECORDING, WHICH IS WHAT BOUNDS THE
   * BACKLOG. A chunk waits behind the one in front of it and grows
   * old doing so. Measured per attempt, a connection failing every
   * post would have the chain falling further behind for ever,
   * retrying things nobody can use. Measured from the recording,
   * the whole queue is bounded by one window.
   */
  it('no, once it is older than the window', () => {
    expect(sendAgain({ ageMs: RETRY_WINDOW_MS })).toBe(false);
    expect(sendAgain({ ageMs: RETRY_WINDOW_MS + 1, status: 503 })).toBe(false);
    expect(sendAgain({ ageMs: 60_000 })).toBe(false);
  });

  it('no, when the channel has refused it outright', () => {
    expect(sendAgain({ ageMs: 0, status: 413 })).toBe(false);
    expect(sendAgain({ ageMs: 0, status: 400 })).toBe(false);
  });

  /*
   * AND AN AGE THAT IS NOT A NUMBER IS NOT A YOUNG CHUNK. A clock
   * that went backwards or a `NaN` must not read as "zero seconds
   * old, retry for ever".
   */
  it('no, when the age is not a number', () => {
    expect(sendAgain({ ageMs: Number.NaN })).toBe(false);
    expect(sendAgain({ ageMs: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('how long to wait first', () => {
  /*
   * A BEAT, NOT A STAMPEDE. Retrying instantly against a channel
   * that just answered 500 is how one struggling broadcast becomes
   * a struggling server.
   */
  it('pauses before trying again', () => {
    expect(waitBefore(0)).toBe(500);
    expect(waitBefore(1_000)).toBe(500);
  });

  /*
   * AND NEVER PAST THE WINDOW, or the wait itself would guarantee
   * the retry was pointless by the time it happened.
   */
  it('never waits longer than the chunk has left', () => {
    expect(waitBefore(RETRY_WINDOW_MS - 100)).toBe(100);
    expect(waitBefore(RETRY_WINDOW_MS)).toBe(0);
    expect(waitBefore(RETRY_WINDOW_MS + 5_000)).toBe(0);
  });
});

describe('what the studio is told', () => {
  /*
   * ONE OF THESE IS THE PRESENTER'S TO FIX AND ONE IS OURS, and
   * `catch {}` made them the same sentence. A studio seeing twelve
   * chunks lost needs to know which, because they send different
   * people to look. [D-21]
   */
  it('names the connection and names the channel, differently', () => {
    expect(failureSays(undefined)).toMatch(/connection/);
    expect(failureSays(503)).toMatch(/channel answered 503/);
    expect(failureSays(500)).toMatch(/channel answered 500/);
  });

  it('and says which kind of refusal it was', () => {
    expect(failureSays(429)).toMatch(/rate/);
    expect(failureSays(413)).toMatch(/too large/);
    expect(failureSays(403)).toMatch(/sign-in/);
  });

  it('always says something', () => {
    for (const status of [undefined, 400, 401, 404, 408, 413, 429, 500, 599]) {
      expect(failureSays(status), String(status)).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------ *
 *  And the encoder asks.
 * ------------------------------------------------------------------ */

/**
 * A RULE NOTHING CALLS IS THE MISTAKE THIS CODEBASE KEEPS MAKING.
 * `RotationEntry.loop` was correct, documented and wired to
 * nothing while a channel ran dark. [D-13]
 */
describe('the encoder retries, in order, and says why', () => {
  const bare = (path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    return readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  };
  const HOOK = bare('app/t/[id]/useLiveEncoder.ts');
  const STUDIO = bare('app/t/[id]/ChannelStudio.tsx');

  it('asks the domain rather than deciding in a React file', () => {
    expect(HOOK).toMatch(/sendAgain\(\{ status, ageMs: age \}\)/);
    expect(HOOK).toMatch(/waitBefore\(age\)/);
    expect(HOOK).toMatch(/failureSays\(/);
  });

  /*
   * THE AGE IS TAKEN WHEN THE CHUNK IS RECORDED. Inside the
   * attempt it would restart on every try, the window would never
   * close, and a failing connection would queue for ever — which
   * is the one way this change could be worse than dropping.
   */
  it('ages the chunk from the recording, not from the attempt', () => {
    expect(HOOK).toMatch(/const recordedAt = Date\.now\(\);/);
    expect(HOOK).toMatch(/const age = Date\.now\(\) - recordedAt;/);
    /* And `recordedAt` is set outside the posting chain. */
    const at = HOOK.indexOf('const recordedAt');
    const chain = HOOK.indexOf('queue.current = queue.current.then');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(chain);
  });

  /*
   * AND IT RETRIES INSIDE THE CHAIN, which is what makes it safe:
   * chunk two waits for chunk one exactly as it already did, so
   * nothing is ever appended out of order.
   */
  it('retries inside the queue that already serialises the posts', () => {
    const chain = HOOK.indexOf('queue.current = queue.current.then');
    const loop = HOOK.indexOf('while (live.current)');
    expect(loop).toBeGreaterThan(chain);
  });

  /* A broadcast that ended stops the loop rather than retrying
     into a channel that is no longer listening. */
  it('stops when the broadcast ends', () => {
    expect(HOOK).toMatch(/while \(live\.current\)/);
    expect(HOOK).toMatch(/if \(response\.status === 409\) \{ stop\(\); return; \}/);
  });

  /*
   * AND THE STUDIO SHOWS BOTH NUMBERS AND THE REASON. A count
   * nobody reads is the same mistake as a rule nobody calls.
   */
  it('and the control room says resent, lost, and why', () => {
    expect(HOOK).toMatch(/retried: number;/);
    expect(HOOK).toMatch(/why: string \| null;/);
    expect(STUDIO).toMatch(/encoder\.retried \? ` · \$\{encoder\.retried\} resent`/);
    expect(STUDIO).toMatch(/encoder\.dropped && encoder\.why/);
  });
});
