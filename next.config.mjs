/** @type {import('next').NextConfig} */
const nextConfig = {
  // Source files import each other with explicit .js specifiers (correct for
  // Node ESM); webpack needs to be told those resolve to .ts on disk.
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
export default nextConfig;
