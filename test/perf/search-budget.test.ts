/**
 * The performance budgets, measured where measuring them means something.
 * [Doctrine D-05, D-20]
 *
 * WHY THIS IS NOT IN `test/search/` ANY MORE. It was, and it failed the first
 * time CI ever ran it: 315 ms against a 200 ms budget. The search code was
 * not slow. Vitest runs test files in parallel, `frame-exact.test.ts` spends
 * four minutes rendering video with ffmpeg, and this test was timing a
 * user-latency budget on a two-core runner that was flat out doing something
 * else. A wall-clock budget measured during a self-inflicted CPU storm is not
 * a measurement of anything.
 *
 * So the budgets live here and run ON THEIR OWN, after the rest of the suite
 * and with file parallelism off (`vitest.perf.config.ts`). That is not a
 * concession to CI — it is the only way the number on the left of the
 * comparison is the number D-05 is talking about.
 *
 * AND THE BEST OF SEVERAL, NOT ONE. Even alone, a runner can lose a slice to
 * the kernel mid-measurement, and a build that fails because of a scheduler
 * decision teaches a team to re-run reflexively until green — which is how a
 * real regression gets waved through. The fastest of several attempts is what
 * the machine CAN do, which is the honest question; if none of seven tries
 * comes in under budget, the code really is too slow.
 *
 * WHAT THIS DELIBERATELY STILL CATCHES. The budget is unchanged at 200 ms and
 * the fixture is unchanged at forty minutes of speech. An accidental O(n²) in
 * search — the failure this test exists for — is hundreds of times over,
 * not thirty per cent over, and no amount of sampling hides it.
 */

import { describe, expect, it } from 'vitest';

import { searchConversation } from '../../src/search/search.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { makeConversation } from '../domain/fixtures.js';
import { transcriptOf } from '../knowledge/fixtures.js';

/** D-05: "Transcript search → results < 200 ms". */
const SEARCH_BUDGET_MS = 200;

/** Enough attempts that a lost time slice cannot be the whole story. */
const ATTEMPTS = 7;

describe('performance budgets (D-05)', () => {
  it('searches a forty-minute transcript inside 200 ms', () => {
    /* Forty minutes of speech, which is the length the budget is written for. */
    const sentences = Array.from({ length: 2400 }, (_, i) =>
      `sentence number ${i} about various things including norway sometimes`);
    const conversation = makeConversation(40 * 60 * HOUSE_FPS);
    const transcript = transcriptOf(sentences, 0.5);

    const samples: number[] = [];
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const started = performance.now();
      const result = searchConversation(
        'norway', { conversation, sourceTranscript: transcript });
      samples.push(performance.now() - started);
      /* The work has to actually happen, or the timing is of nothing. */
      expect(result.total).toBeGreaterThan(0);
    }

    const best = Math.min(...samples);
    expect(
      best,
      `best of ${ATTEMPTS}: ${samples.map((ms) => Math.round(ms)).join(', ')} ms`,
    ).toBeLessThan(SEARCH_BUDGET_MS);
  }, 60_000);
});
