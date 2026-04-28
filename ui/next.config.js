/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // UI runs from ui/ subdirectory, but Next.js expects to be at root
  // We use relative paths to call scripts in parent directory
  env: {
    DATA_PATH: process.env.DATA_PATH || '../data',
  },
  // Allow reading from parent directory for script execution
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  async headers() {
    return [
      {
        source: '/api/sync/:jobId/stream',
        headers: [
          { key: 'Content-Type', value: 'text/event-stream' },
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Connection', value: 'keep-alive' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
