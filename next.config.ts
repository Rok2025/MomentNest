import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: {'/*':['./.private/**/*','./.env*','./work/**/*']},
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
