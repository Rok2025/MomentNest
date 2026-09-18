/** @type {import('next').NextConfig} */
const config = {
  // Detect stale action IDs after a release and force a consistent full reload.
  deploymentId: process.env.DEPLOYMENT_VERSION,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ['exifr', 'exiftool-vendored.pl'],
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
