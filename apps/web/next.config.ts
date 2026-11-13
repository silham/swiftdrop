import type { NextConfig } from 'next';
import { join } from 'node:path';

/** Owner: M1/M10. */
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../..'),
  poweredByHeader: false,
  // keep the dev badge away from the sidebar's bottom-left controls
  devIndicators: { position: 'bottom-right' },
  // dev only: allow the Caddy gateway hostname (used by the e2e container) to load /_next dev resources
  allowedDevOrigins: ['gateway', 'localhost', '127.0.0.1'],
  // When the app is opened directly on :3000 (not via the gateway on :8080), proxy /api to the API.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
