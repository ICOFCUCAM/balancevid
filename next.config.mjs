/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * FFMPEG IS A BINARY ON DISK, NOT A MODULE TO BUNDLE.
   * [MASTER-EDIT §8; Doctrine U-02]
   *
   * `ffmpeg-static` and `ffprobe-static` export a PATH to an executable,
   * computed from their own location. Bundled into a route's output, that
   * location becomes the route's directory and the path points at a file
   * that was never there — so the first route in this product to measure
   * media failed with `spawn .next/server/app/.../ffmpeg ENOENT`.
   *
   * It had not come up before because every other measurement in this
   * product happens in the worker, which node runs directly. A route that
   * measures is new, and this is what it needs.
   */
  serverExternalPackages: ['ffmpeg-static', 'ffprobe-static'],
  experimental: {
    /*
     * HOW MUCH OF AN UPLOAD SURVIVES THE SIGN-IN GATE.
     *   [Doctrine D-19, D-21; src/web/body.ts]
     *
     * Next clones the request body so `middleware.ts` can read
     * it, and caps that clone at 10 MB by default. Over the cap
     * it does not refuse — it ends the stream early and warns on
     * the server — so a 31 MB video reached the route as ten
     * megabytes of a multipart body with no closing boundary,
     * `formData()` threw, and the person was told "the server
     * failed on that".
     *
     * The cap exists only because a middleware exists. This
     * product gained one with the sign-in gate, and nothing about
     * adding a gate suggests it changes uploads.
     *
     * THE NUMBER IS `MOST_BODY_BYTES` IN `src/web/body.ts`, which
     * a config file cannot import because it cannot load
     * TypeScript. It is written out here and `body.test.ts` fails
     * when the two drift.
     */
    middlewareClientMaxBodySize: 512 * 1024 * 1024,
  },
  // Source files import each other with explicit .js specifiers (correct for
  // Node ESM); webpack needs to be told those resolve to .ts on disk.
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
export default nextConfig;
