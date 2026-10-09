import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  /*
   * SO A TEST CAN RENDER A COMPONENT AND READ WHAT CAME OUT.
   *   [Doctrine U-02]
   *
   * Every claim about a surface here used to be a claim about its
   * SOURCE TEXT, and this product has been bitten by that twice:
   * a studio tab whose fix was inert because the renderer returned
   * before reaching it, and a route test that matched the 404
   * branch. Both files contained exactly the right string.
   *
   * esbuild's default is the classic transform, which expects
   * `React` in scope and throws `React is not defined` the moment
   * a `.tsx` is imported outside Next. One line, and a test can
   * call `renderToStaticMarkup` on the real component.
   */
  esbuild: { jsx: 'automatic' },
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
