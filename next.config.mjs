/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
