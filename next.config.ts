import type { NextConfig } from 'next';

/**
 * Presentation Buddy 3.0 — Next.js configuration.
 *
 * ── The one unusual thing in this file ──────────────────────────────────────
 * **The environment variable names do not change.** Vercel already holds five
 * `VITE_`-prefixed public variables and four server-only ones, and the whole
 * point of this file's `env` block is that they keep working: the values are
 * read here at build time and inlined into the bundle under the *same names*,
 * so `process.env.VITE_SUPABASE_URL` is valid in browser code even though
 * Next.js would normally only inline `NEXT_PUBLIC_*`.
 *
 * Why not rename them to `NEXT_PUBLIC_*`? Because renaming an environment
 * variable in production is a manual step that fails silently: paste the new
 * name in the wrong place and the site deploys with no database. Keeping the
 * names is boring, and boring is what you want in the deploy path.
 *
 * The rule that still holds: anything the browser reads is public by design
 * (a Supabase URL and its anon key are identifiers, not secrets — the row
 * policies decide what they can do). Anything secret has no prefix, is read
 * only inside route handlers on the server, and is never in the `env` block.
 */

const env = process.env;

/** The five public variables, under the names Vercel already holds them. */
const publicEnv = {
  VITE_SITE_URL: env.VITE_SITE_URL ?? '',
  VITE_CLERK_PUBLISHABLE_KEY: env.VITE_CLERK_PUBLISHABLE_KEY ?? '',
  VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? '',
  VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? '',
  VITE_CONVEX_URL: env.VITE_CONVEX_URL ?? '',
};

/**
 * The security headers. Same set the 2.x deployment served from `vercel.json`,
 * now written once here so `next dev` and production agree — a CSP that only
 * exists in production is a CSP you find out about after deploying.
 */
const CSP = [
  "default-src 'self'",
  // Next.js ships its bootstrap as inline scripts; Clerk and the identity
  // providers need their own origins. `unsafe-inline` is required by Next
  // (nonces would mean a middleware on every request — see docs/VERCEL.md).
  "script-src 'self' 'unsafe-inline' https://cdn.protect.clerk.com https://suitable-bison-4886.clerk.accounts.dev https://clerk.aavrit.dedyn.io https://apis.google.com https://www.gstatic.com https://login.microsoftonline.com https://login.live.com https://*.msftauth.net https://*.msauth.net https://logincdn.msauth.net https://aadcdn.msftauth.net https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://logincdn.msauth.net https://aadcdn.msftauth.net https://aadcdn.msauth.net https://*.msftauth.net https://*.msauth.net",
  "font-src 'self' https://fonts.gstatic.com data: https://logincdn.msauth.net https://aadcdn.msauth.net https://aadcdn.msftauth.net https://*.msftauth.net https://*.msauth.net",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://cdn.protect.clerk.com https://api.dictionaryapi.dev https://api.datamuse.com https://en.wikisource.org https://en.wikiquote.org https://gutendex.com https://www.gutenberg.org https://*.googleapis.com https://*.supabase.co wss://*.supabase.co https://*.convex.cloud wss://*.convex.cloud https://suitable-bison-4886.clerk.accounts.dev https://clerk.aavrit.dedyn.io https://clerk.accounts.dev https://accounts.aavrit.dedyn.io https://apis.google.com https://www.googleapis.com https://login.microsoftonline.com https://login.live.com https://*.msftauth.net https://*.msauth.net https://logincdn.msauth.net https://aadcdn.msftauth.net https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://suitable-bison-4886.clerk.accounts.dev https://clerk.aavrit.dedyn.io https://challenges.cloudflare.com https://accounts.google.com https://login.microsoftonline.com https://accounts.aavrit.dedyn.io https://login.live.com https://*.msftauth.net https://*.msauth.net https://logincdn.msauth.net https://aadcdn.msftauth.net",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'geolocation=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: CSP },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: publicEnv,

  /**
   * Every 2.3-era path still resolves. These used to live in `vercel.json`,
   * which meant they only existed in production; here they work in development
   * too, so a redirect cannot ship untested.
   */
  async redirects() {
    return [
      { source: '/practice', destination: '/rehearse', permanent: true },
      { source: '/practice/:id', destination: '/rehearse/:id', permanent: true },
      { source: '/studio', destination: '/write', permanent: true },
      { source: '/studio/:id', destination: '/write/:id', permanent: true },
      { source: '/web', destination: '/arrivals', permanent: true },
    ];
  },

  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/assets/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/icons/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/cards/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      // The service worker must revalidate, or a deploy never reaches anyone
      // who already has the site cached.
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/admin',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
