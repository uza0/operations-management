/** @type {import('next').NextConfig} */
/*
 * Which build this is.
 *
 * The service worker needs it: a page it cached from an earlier deploy points
 * at script chunks whose filenames no longer exist on the server, and serving
 * that page again produces a blank error screen that looks random because it
 * depends on whether the network happened to hiccup. Vercel gives the commit;
 * a local build falls back to the start time, which is enough to tell two
 * builds apart.
 */
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_DEPLOYMENT_ID ??
  String(Date.now());

const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  serverExternalPackages: ['bcryptjs', 'sharp'],
  eslint: { ignoreDuringBuilds: true },

  /**
   * Android looks for the Digital Asset Links file at this exact path. A
   * dot-folder inside public/ is not reliably served, so it is a route handler
   * behind a rewrite instead.
   */
  async rewrites() {
    return [
      { source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' },
    ];
  },

  /**
   * Konva ships a Node build that pulls in the native `canvas` package. The map
   * only ever runs in the browser (every Konva component is behind a
   * `dynamic(..., { ssr: false })` import), so the Node path is stubbed out
   * rather than adding a native dependency.
   */
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },

  turbopack: {
    resolveAlias: {
      canvas: './src/lib/empty-module.js',
    },
  },
};

export default nextConfig;
