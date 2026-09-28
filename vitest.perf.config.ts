import { defineConfig } from 'vitest/config';

/**
 * The performance budgets, run alone.  [Doctrine D-05, D-20]
 *
 * A second config rather than a second job, because the thing being protected
 * is not "these tests run in CI" — it is that NOTHING ELSE OF OURS IS RUNNING
 * while a latency budget is measured. `npm test` runs the main suite and then
 * this, in that order, so the render suite's ffmpeg processes have exited
 * before a stopwatch is started.
 *
 * `fileParallelism: false` for the same reason one level down: budgets must
 * not be measured against each other either.
 */
export default defineConfig({
  test: {
    include: ['test/perf/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
