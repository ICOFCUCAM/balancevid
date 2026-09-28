import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    /*
     * The performance budgets are excluded here and run afterwards on
     * their own (`vitest.perf.config.ts`). Timing a user-latency budget
     * while the render suite has every core busy with ffmpeg measures the
     * runner, not the code. [D-05, D-20]
     */
    exclude: [...configDefaults.exclude, 'test/perf/**'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
