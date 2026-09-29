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
  // Source files import each other with explicit .js specifiers (correct for
  // Node ESM); webpack needs to be told those resolve to .ts on disk.
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
export default nextConfig;
