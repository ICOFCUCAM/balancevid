/**
 * Whether a chunk of a live broadcast is still worth sending.
 *   [CHANNEL §7, §9; Doctrine D-14, D-19, D-21, U-02]
 *
 * THE RULE THAT STOOD HERE WAS "NEVER", and it was stated as a
 * principle rather than a measurement: *"a chunk that arrives late
 * has missed the broadcast, and inserting it would corrupt a file
 * being read right now. Live is the one place in this product
 * where 'later' means 'never'."*
 *
 * BOTH HALVES FAIL AGAINST THE CODE THEY WERE WRITTEN BESIDE.
 * `useLiveEncoder` has always serialised its posts through one
 * promise chain, and that chain's own comment says why — *"chunk
 * two cannot overtake chunk one on a flaky connection. Appending
 * them out of order would splice the broadcast."* A second attempt
 * made inside the chain is not an insertion; it is the same chunk
 * holding the same place. And "late" has a number: the engine
 * reads `LIVE_DELAY_MS` behind, so a chunk that lands two seconds
 * after its first attempt is ten seconds EARLY.
 *
 * WHAT DROPPING COSTS, SAID PLAINLY. The clock does not stop for a
 * failed upload. Every dropped chunk is two seconds of media the
 * buffer will never hold while the broadcast ages two seconds, it
 * is not recoverable, and it does not average out — the feed ends
 * up permanently further behind. The engine's `liveReachMs` clamp
 * absorbs that by growing the delay instead of freezing the
 * picture, which is better than freezing and worse than not
 * needing to.
 *
 * THE DECISION IS HERE RATHER THAN IN THE HOOK because it is a
 * decision and not a fetch: a number, a status and a clock, with
 * no network in it. The hook does the asking; this says whether to
 * ask again. [D-19]
 */

import { LIVE_DELAY_MS } from './playout.js';

/**
 * HOW LONG A CHUNK IS STILL WORTH SENDING.
 *
 * HALF THE DELAY, DERIVED AND NOT TYPED. The engine reads
 * `LIVE_DELAY_MS` behind the clock, so a chunk landing inside that
 * window is a chunk the viewer sees; half of it leaves the rest as
 * margin for the server's write and the engine's next pass. Taken
 * FROM the constant so the two cannot drift: a `6_000` typed here
 * would outlive whatever made twelve the right number.
 */
export const RETRY_WINDOW_MS = LIVE_DELAY_MS / 2;

/**
 * Could sending the identical bytes again work?
 *
 * A DROPPED CONNECTION COULD, and that is the common case on a
 * phone — `fetch` rejects outright and there is no status at all.
 * So could a server saying "not now": 408, 429, and every 5xx.
 *
 * A REFUSAL COULD NOT. 400, 413, 415 — the channel has looked at
 * this chunk and declined it, and the same bytes will be declined
 * again. Retrying those is worse than dropping them, because the
 * chunk behind waits through a window spent on something already
 * lost. 409 never reaches here: it means the broadcast ended.
 */
export function worthRepeating(status?: number): boolean {
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Send this one again?
 *
 * AGED FROM WHEN IT WAS RECORDED, never from when the attempt
 * began, and that distinction is the whole safety of the thing. A
 * chunk waits behind the one in front of it and grows old doing
 * so; a window measured per attempt would not notice, and a
 * connection failing every post would have the chain falling
 * further behind for ever, retrying things nobody can still use.
 * Measured from the recording, the backlog is bounded by the
 * window itself.
 */
export function sendAgain(
  attempt: { status?: number | undefined; ageMs: number },
): boolean {
  if (!Number.isFinite(attempt.ageMs) || attempt.ageMs >= RETRY_WINDOW_MS) {
    return false;
  }
  return worthRepeating(attempt.status);
}

/**
 * How long to wait before trying again.
 *
 * A BEAT, AND NEVER PAST THE WINDOW. Hammering a channel that has
 * just answered 500 is how one struggling broadcast becomes a
 * struggling server, and a wait that outlived the window would
 * guarantee the retry was pointless by the time it happened.
 */
export function waitBefore(ageMs: number): number {
  return Math.max(0, Math.min(500, RETRY_WINDOW_MS - ageMs));
}

/**
 * What to tell the studio about a failure.
 *
 * `catch {}` threw this away. A presenter could see twelve chunks
 * lost and not know whether their own uplink had died or the
 * channel had answered 500 — one of those is theirs to fix and one
 * is ours, and they send different people to look. [D-21]
 */
export function failureSays(status?: number): string {
  if (status === undefined) return 'the connection dropped';
  if (status >= 500) return `the channel answered ${status}`;
  if (status === 429) return 'the channel is refusing the rate';
  if (status === 413) return 'the channel says the chunk is too large';
  if (status === 401 || status === 403) return 'the channel refused the sign-in';
  return `the channel answered ${status}`;
}
